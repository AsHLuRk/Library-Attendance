# Library Attendance (server version)

Staff open the page, pick the floor and date, upload a photo, check the matches,
and the app writes `Y` into the right day column of the Google Sheet.
All keys live on the server (environment variables) — staff never see or enter them.

## What staff do

1. Sign in with the library password (once per device).
2. Choose **Floor** and **Date**. The **Sheet tab** fills itself in
   (e.g. `1st Floor Sep2026`) and can be edited; suggestions come from the real tabs.
3. Upload or take a photo → **Analyze**.
4. Review: exact matches are ready; duplicate/partial names get a dropdown;
   unknown names can be ignored or assigned by hand. Add anything Gemini missed.
5. **Confirm** → `Y` is written. Cells already `Y` are skipped.

## What you set up (once)

### 1. Google service account
Google Cloud Console → IAM & Admin → Service Accounts → create one (or reuse yours) →
Keys → Add key → JSON. Enable the **Google Sheets API** for the project.
Then open the attendance sheet → **Share** → paste the service account's
`client_email` → **Editor**.

### 2. Gemini key
Create one at https://aistudio.google.com/apikey

### 3. Environment variables
Copy `.env.local.example` to `.env.local` (local) and add the same names in
Vercel → Project → Settings → Environment Variables.

| Variable | Value |
|---|---|
| `APP_PASSWORD` | a password you choose; staff type it once per device |
| `GEMINI_API_KEY` | your Gemini key |
| `GEMINI_MODEL` | optional, default `gemini-3.5-flash-lite` |
| `GOOGLE_CLIENT_EMAIL` | `client_email` from the JSON key |
| `GOOGLE_PRIVATE_KEY` | `private_key` from the JSON key (line breaks or literal `\n` both work) |
| `GOOGLE_SHEET_ID` | ID from the sheet URL (between `/d/` and `/edit`) |

After changing variables: restart `npm run dev` locally, or **redeploy** on Vercel.

### 4. Run / deploy
```bash
npm install
npm run dev        # http://localhost:3000
```
Deploy: push to GitHub, import the repo in Vercel, add the variables, deploy.

## Sheet layout expected

Row 1 = totals, row 2 = headers (`Name`, `Timing`, `ID`, then day numbers `1`…`30`,
then `Active`), student names from row 3 in column A. The day column is found by
matching the day number in row 2, so column letters are resolved automatically.
Tabs are named `<floor> <Mon><YYYY>`, e.g. `2nd Floor Sep2026`. Create next month's
tab before using it, or type its exact name in the Sheet tab box.
Row 1 totals and the Active column are formulas and update themselves.

## Troubleshooting

- **"Wrong password" / signed out** — `APP_PASSWORD` on the server changed; sign in again.
- **"Google Sheets refused access"** — share the sheet with `GOOGLE_CLIENT_EMAIL` as Editor; check `GOOGLE_SHEET_ID`.
- **"Tab … was not found"** — tab names must match exactly (case and spaces).
- **"Day N was not found in the header row"** — row 2 of that tab has no column with that number.
- **Gemini error 404** — the model name is wrong or retired; set `GEMINI_MODEL`.
- **Photo too large / timeout** — photos are shrunk in the browser before upload; retry with a clearer, smaller photo.

## Security notes

- Secrets are only read by the API routes on the server and are never sent to the browser.
- Every API route requires the `x-app-password` header; without it anyone with the link could write to your sheet and use your Gemini quota.
- Never commit `.env.local` (already in `.gitignore`).
