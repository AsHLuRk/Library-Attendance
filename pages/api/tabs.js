const { requireAuth } = require("../../lib/server/auth");
const {
  getSheetsClient,
  getSpreadsheetId,
  getTabNames,
  explainGoogleError,
} = require("../../lib/server/sheets");

// Lists the spreadsheet's tab names (used for the suggestions under "Sheet tab"
// and to check the password when someone signs in).
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET." });
  if (!requireAuth(req, res)) return;
  try {
    const tabs = await getTabNames(getSheetsClient(), getSpreadsheetId());
    return res.status(200).json({ tabs });
  } catch (e) {
    return res.status(500).json({ error: explainGoogleError(e) });
  }
}
