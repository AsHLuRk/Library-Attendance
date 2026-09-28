import { useEffect, useState } from "react";
import { matchNames } from "../lib/matcher.js";
import { fileToResizedBase64 } from "../lib/image.js";

const pad = (n) => String(n).padStart(2, "0");

// Local date (not UTC), so early-morning use in India does not pick "yesterday".
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// '2026-09-28' -> 'Sep2026' (matches tab names like "1st Floor Sep2026")
function monthLabel(iso) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" }) + y;
}

const FLOOR_KEY = "lib-attendance-floor";

export default function SetupStep({ call, onAnalyzed }) {
  const [floor, setFloor] = useState("1st Floor");
  const [date, setDate] = useState(todayISO());
  const [tabOverride, setTabOverride] = useState(null); // null = automatic
  const [tabs, setTabs] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // Remember the last floor used on this device.
  useEffect(() => {
    try {
      const f = localStorage.getItem(FLOOR_KEY);
      if (f === "1st Floor" || f === "2nd Floor") setFloor(f);
    } catch {}
  }, []);

  // Real tab names, used for suggestions and a "tab not found" warning.
  useEffect(() => {
    let alive = true;
    call("/api/tabs")
      .then((d) => alive && setTabs(d.tabs))
      .catch(() => {});
    return () => { alive = false; };
  }, [call]);

  const day = date ? Number(date.split("-")[2]) : NaN;
  const autoTab = date ? `${floor} ${monthLabel(date)}` : "";
  const tabName = (tabOverride !== null ? tabOverride : autoTab).trim();
  const tabMissing = tabs && tabName && !tabs.includes(tabName);

  const changeFloor = (f) => {
    setFloor(f);
    try { localStorage.setItem(FLOOR_KEY, f); } catch {}
  };

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const analyze = async () => {
    setError("");
    if (!date || !Number.isInteger(day)) return setError("Please choose a date.");
    if (!tabName) return setError("Please enter the sheet tab name.");
    if (!file) return setError("Please choose a photo first.");
    try {
      setBusy("Preparing photo…");
      const image = await fileToResizedBase64(file);
      setBusy("Reading the sheet and the photo…");
      const { roster, names } = await call("/api/analyze", {
        method: "POST",
        body: { tabName, day, image },
      });
      const result = matchNames(names, roster.students);
      onAnalyzed({ tabName, day, roster, result, preview });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="card">
      <h2>Mark attendance from photo</h2>
      {error && <div className="msg err">{error}</div>}

      <div className="grid2">
        <label className="field">
          <span>Floor</span>
          <select value={floor} onChange={(e) => changeFloor(e.target.value)}>
            <option value="1st Floor">1st Floor (Girls)</option>
            <option value="2nd Floor">2nd Floor (Boys)</option>
          </select>
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <label className="field">
        <span>
          Sheet tab{" "}
          <span className="muted">
            {tabOverride === null ? "(automatic — you can edit it)" : "(edited)"}
          </span>
        </span>
        <input
          type="text"
          list="tab-list"
          value={tabOverride !== null ? tabOverride : autoTab}
          onChange={(e) => setTabOverride(e.target.value)}
          placeholder="e.g. 1st Floor Sep2026"
        />
        <datalist id="tab-list">
          {(tabs || []).map((t) => <option key={t} value={t} />)}
        </datalist>
      </label>
      {tabOverride !== null && (
        <button className="link" onClick={() => setTabOverride(null)}>
          Reset to automatic ({autoTab})
        </button>
      )}
      {tabMissing && (
        <div className="msg err">
          There is no tab named “{tabName}” in the spreadsheet. Pick one from the suggestions or fix the name.
        </div>
      )}
      {!tabMissing && Number.isInteger(day) && (
        <p className="muted small">
          Will mark column for day <code>{day}</code> in <code>{tabName || "…"}</code>.
        </p>
      )}

      <label className="field">
        <span>Attendance photo</span>
        <input type="file" accept="image/*" onChange={onFile} />
      </label>
      {preview && <img className="preview-img" src={preview} alt="Attendance preview" />}

      <div className="actions">
        <button className="btn primary" onClick={analyze} disabled={!!busy}>
          {busy || "Analyze photo and match"}
        </button>
      </div>
      {busy && <p className="muted small">This can take 10-30 seconds. Do not close the tab.</p>}
    </div>
  );
}
