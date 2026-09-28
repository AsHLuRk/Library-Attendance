const { requireAuth } = require("../../lib/server/auth");
const {
  getSheetsClient,
  getSpreadsheetId,
  getTabNames,
  getRoster,
  explainGoogleError,
} = require("../../lib/server/sheets");
const { extractNames } = require("../../lib/server/gemini");

// Photos are resized in the browser first, but Next.js still defaults to a
// 1MB body limit. (Vercel itself caps request bodies at about 4.5MB.)
export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } },
  maxDuration: 60,
};

// Body: { tabName, day, image }  ->  { roster, names }
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!requireAuth(req, res)) return;

  const { tabName, day, image } = req.body || {};
  const dayNum = Number(day);
  if (!tabName || typeof tabName !== "string" || tabName.length > 100) {
    return res.status(400).json({ error: "Sheet tab name is missing." });
  }
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) {
    return res.status(400).json({ error: "Day must be between 1 and 31." });
  }
  if (!image || typeof image !== "string") {
    return res.status(400).json({ error: "Photo is missing." });
  }

  let roster;
  try {
    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();
    const tabs = await getTabNames(sheets, spreadsheetId);
    if (!tabs.includes(tabName)) {
      return res.status(404).json({
        error: `Tab "${tabName}" was not found. Available tabs: ${tabs.slice(0, 12).join(", ")}${tabs.length > 12 ? ", ..." : ""}`,
      });
    }
    roster = await getRoster(sheets, spreadsheetId, tabName, dayNum);
    if (!roster.students.length) {
      return res.status(404).json({ error: `No student names found in tab "${tabName}".` });
    }
  } catch (e) {
    return res.status(500).json({ error: explainGoogleError(e) });
  }

  try {
    const names = await extractNames(image);
    return res.status(200).json({ roster, names });
  } catch (e) {
    return res.status(502).json({ error: e.message || String(e) });
  }
}
