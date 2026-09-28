const { requireAuth } = require("../../lib/server/auth");
const {
  getSheetsClient,
  getSpreadsheetId,
  markAttendance,
  explainGoogleError,
} = require("../../lib/server/sheets");

// Body: { tabName, day, rows: [sheetRowNumber, ...] }  ->  { updatedCells, colLetter }
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!requireAuth(req, res)) return;

  const { tabName, day, rows } = req.body || {};
  const dayNum = Number(day);
  if (!tabName || typeof tabName !== "string" || tabName.length > 100) {
    return res.status(400).json({ error: "Sheet tab name is missing." });
  }
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) {
    return res.status(400).json({ error: "Day must be between 1 and 31." });
  }
  if (!Array.isArray(rows) || rows.length > 2000) {
    return res.status(400).json({ error: "Rows must be a list of row numbers." });
  }

  try {
    const out = await markAttendance(
      getSheetsClient(),
      getSpreadsheetId(),
      tabName,
      dayNum,
      rows.map(Number)
    );
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: explainGoogleError(e) });
  }
}
