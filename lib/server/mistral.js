const PROMPT = `You are an attendance assistant for a library. Study the attached photo very carefully.

The photo may show any of these: students sitting or standing in the library, name badges or ID cards, a handwritten or printed sign-in register, or a list of names on paper or a whiteboard.

Task: list the FULL name of every person who is present according to the image.

Rules:
- Prefer full names ("Amit Yadav"). If only a first name is visible for someone, return just that first name ("Amit").
- Never invent or guess surnames. If you cannot determine any name for a visible person, skip them.
- One entry per person, no duplicates.
- Read text in the image carefully, including small or partially obscured writing, but only include names you are reasonably confident about.

Return STRICT JSON and nothing else, exactly in this shape:
{"names": ["Full Name 1", "Full Name 2"]}

If no names can be determined, return {"names": []}.`;

// Photo (base64 JPEG) -> array of names Mistral sees.
// Mirrors gemini.js's extractNames() so callers can treat providers interchangeably.
async function extractNames(base64Jpeg, opts = {}) {
  const apiKey = (process.env.MISTRAL_API_KEY || "").trim();
  const model = (process.env.MISTRAL_MODEL || "mistral-small-latest").trim();
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not configured on the server.");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 20000);
  let res;
  try {
    res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Jpeg}` } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });
  } catch (e) {
    const err = new Error(
      e && e.name === "AbortError" ? "Mistral took too long to answer." : `Could not reach Mistral: ${e.message}`
    );
    err.status = 504;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const t = await res.text();
    const err = new Error(`Mistral API error ${res.status}: ${t.slice(0, 250)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const text = ((data.choices && data.choices[0] && data.choices[0].message
    && data.choices[0].message.content) || "")
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Mistral did not return valid JSON. Try again or use a clearer photo.");
  }
  return Array.isArray(parsed.names)
    ? parsed.names.map((n) => String(n).trim()).filter(Boolean)
    : [];
}

module.exports = { extractNames };