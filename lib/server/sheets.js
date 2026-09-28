const { google } = require("googleapis");

// Quote a tab name for A1 notation (a literal ' inside the name is doubled).
const q = (tab) => `'${String(tab).replace(/'/g, "''")}'`;

// Accepts real newlines, single-escaped (\n) or double-escaped (\\n) keys,
// and ignores wrapping quotes, so pasting into .env or Vercel "just works".
function cleanPrivateKey(raw) {
  let k = String(raw || "").trim();
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1);
  }
  return k.replace(/\\+r/g, "").replace(/\\+n/g, "\n");
}

function getSheetsClient() {
  const email = (process.env.GOOGLE_CLIENT_EMAIL || "").trim();
  const key = cleanPrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  if (!email || !key) {
    throw new Error("Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY environment variables.");
  }
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function getSpreadsheetId() {
  const id = (process.env.GOOGLE_SHEET_ID || "").trim();
  if (!id) throw new Error("Missing GOOGLE_SHEET_ID environment variable.");
  return id;
}

// 0-indexed column number -> A1 letter(s): 0->A, 25->Z, 26->AA ...
function colToLetter(col) {
  let n = col + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function findDayColumn(headerRow, day, tabName) {
  const idx = (headerRow || []).findIndex((h) => String(h).trim() === String(day));
  if (idx === -1) {
    throw new Error(`Day "${day}" was not found in the header row (row 2) of tab "${tabName}".`);
  }
  return idx;
}

async function getTabNames(sheets, spreadsheetId) {
  const r = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  return (r.data.sheets || []).map((s) => s.properties.title);
}

// Layout: row 1 = totals, row 2 = headers (Name, Timing, ID, 1..30, Active),
// data from row 3, names in column A.
// We read from A1, so rows[0] = sheet row 1, rows[1] = headers (sheet row 2)
// and rows[i] = sheet row i + 1.
async function getRoster(sheets, spreadsheetId, tabName, day) {
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(tabName)}!A1:AK`,
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
  });
  const rows = r.data.values || [];
  if (rows.length < 2) {
    throw new Error(`Tab "${tabName}" does not have the expected header rows.`);
  }
  const colIdx = findDayColumn(rows[1], day, tabName);
  const students = [];
  for (let i = 2; i < rows.length; i++) {
    const name = String(rows[i][0] || "").trim();
    if (!name) continue;
    students.push({
      key: i, // unique id for this roster load
      sheetRow: i + 1,
      name,
      timing: String(rows[i][1] || "").trim(),
      id: String(rows[i][2] || "").trim(),
      current: String(rows[i][colIdx] || "").trim(),
    });
  }
  return { students, colIdx, colLetter: colToLetter(colIdx) };
}

// Writes "Y" into the day column for each row number. The column is resolved
// again from the header here, so the browser never decides where data goes.
async function markAttendance(sheets, spreadsheetId, tabName, day, rowNumbers) {
  const rows = [...new Set(rowNumbers)];
  if (!rows.length) return { updatedCells: 0, colLetter: null };
  for (const n of rows) {
    if (!Number.isInteger(n) || n < 3 || n > 20000) {
      throw new Error(`Invalid row number: ${n}`);
    }
  }
  const h = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${q(tabName)}!A2:AK2`,
    majorDimension: "ROWS",
  });
  const colIdx = findDayColumn((h.data.values || [[]])[0], day, tabName);
  const colLetter = colToLetter(colIdx);
  const res = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: rows.map((n) => ({
        range: `${q(tabName)}!${colLetter}${n}`,
        values: [["Y"]],
      })),
    },
  });
  return { updatedCells: res.data.totalUpdatedCells || 0, colLetter };
}

// Turns a Google API failure into a message a librarian can act on.
function explainGoogleError(e) {
  const code = e && (e.code || (e.response && e.response.status));
  if (code === 403 || code === 404) {
    const email = process.env.GOOGLE_CLIENT_EMAIL || "the service account";
    return `Google Sheets refused access. Share the spreadsheet with ${email} as Editor, and check GOOGLE_SHEET_ID. (${e.message})`;
  }
  return e && e.message ? e.message : String(e);
}

module.exports = {
  q,
  cleanPrivateKey,
  getSheetsClient,
  getSpreadsheetId,
  colToLetter,
  getTabNames,
  getRoster,
  markAttendance,
  explainGoogleError,
};
