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

// Temporary Google-side failures worth retrying (503 = "high demand").
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One request to one model. Throws an Error with .status set for HTTP failures.
async function callModel(model, apiKey, base64Jpeg, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: ctrl.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inlineData: { mimeType: "image/jpeg", data: base64Jpeg } },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
        }),
      }
    );
  } catch (e) {
    const err = new Error(
      e && e.name === "AbortError" ? "Gemini took too long to answer." : `Could not reach Gemini: ${e.message}`
    );
    err.status = 504;
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const t = await res.text();
    const err = new Error(`Gemini API error ${res.status}: ${t.slice(0, 250)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const block = data && data.promptFeedback && data.promptFeedback.blockReason;
  if (block) throw new Error(`Gemini blocked the photo (${block}). Try a different photo.`);

  const text = ((data.candidates && data.candidates[0] && data.candidates[0].content
    && data.candidates[0].content.parts) || [])
    .map((p) => p.text || "")
    .join("")
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini did not return valid JSON. Try again or use a clearer photo.");
  }
  return Array.isArray(parsed.names)
    ? parsed.names.map((n) => String(n).trim()).filter(Boolean)
    : [];
}

// Photo (base64 JPEG) -> array of names Gemini sees.
// If Gemini is overloaded (503 etc.) it retries the main model a couple of times,
// then switches to a backup model, all within ~45s so the Vercel limit is not hit.
// Mistakes that retrying cannot fix (bad key, bad request, blocked photo) fail at once.
async function extractNames(base64Jpeg, opts = {}) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on the server.");

  const primary = (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite").trim();
  const backup = (process.env.GEMINI_FALLBACK_MODEL || "gemini-3.7-flash").trim();
  const delayMs = opts.delayMs !== undefined ? opts.delayMs : 1500;
  const budgetMs = opts.budgetMs || 45000;

  // main model x3 (waits 1x and 2x the delay between tries), then backup model x2
  const plan = [primary, primary, primary];
  if (backup && backup !== primary) plan.push(backup, backup);

  const started = Date.now();
  let lastErr;
  for (let i = 0; i < plan.length; i++) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < 3000) break;
    try {
      return await callModel(plan[i], apiKey, base64Jpeg, Math.min(20000, remaining));
    } catch (e) {
      lastErr = e;
      const status = e.status;
      const modelGone = status === 404 && plan[i] === primary && backup && backup !== primary;
      if (!RETRYABLE.has(status) && !modelGone) throw e; // retrying will not help
      if (modelGone) i = plan.indexOf(backup) - 1; // jump straight to the backup model
      else if (i < plan.length - 1 && plan[i + 1] === plan[i]) await sleep(delayMs * (i + 1));
    }
  }

  const tried = backup && backup !== primary ? `${primary} and ${backup}` : primary;
  throw new Error(
    `Gemini is busy right now (tried ${tried}). Please wait a minute and try again. Details: ${lastErr ? lastErr.message : "unknown"}`
  );
}

module.exports = { extractNames };