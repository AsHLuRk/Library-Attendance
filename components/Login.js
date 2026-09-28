import { useState } from "react";

export default function Login({ onLogin, error }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!pw.trim()) return;
    setBusy(true);
    try {
      await onLogin(pw.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Sign in</h2>
      <p className="muted">Enter the library password to continue. You will only need to do this once on this device.</p>
      {error && <div className="msg err">{error}</div>}
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          autoComplete="current-password"
        />
      </label>
      <div className="actions">
        <button className="btn primary" onClick={submit} disabled={busy || !pw.trim()}>
          {busy ? "Checking…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
