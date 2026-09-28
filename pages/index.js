import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import Login from "../components/Login";
import SetupStep from "../components/SetupStep";
import ReviewStep from "../components/ReviewStep";
import ResultStep from "../components/ResultStep";
import { apiFetch } from "../lib/api";

const PW_KEY = "lib-attendance-password";
const STEPS = ["setup", "review", "result"];
const STEP_LABELS = { setup: "1. Photo", review: "2. Review", result: "3. Done" };

export default function Home() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [screen, setScreen] = useState("login");
  const [loginError, setLoginError] = useState("");
  const [payload, setPayload] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let pw = "";
    try { pw = localStorage.getItem(PW_KEY) || ""; } catch {}
    setPassword(pw);
    setScreen(pw ? "setup" : "login");
    setReady(true);
  }, []);

  const logout = useCallback((msg = "") => {
    try { localStorage.removeItem(PW_KEY); } catch {}
    setPassword("");
    setPayload(null);
    setSummary(null);
    setLoginError(msg);
    setScreen("login");
  }, []);

  // All calls to our API go through here; a 401 sends the user back to sign in.
  const call = useCallback(
    async (path, opts = {}) => {
      try {
        return await apiFetch(path, { ...opts, password });
      } catch (e) {
        if (e.status === 401) logout("Your password was not accepted. Please sign in again.");
        throw e;
      }
    },
    [password, logout]
  );

  const handleLogin = async (pw) => {
    setLoginError("");
    try {
      await apiFetch("/api/tabs", { password: pw });
    } catch (e) {
      setLoginError(e.status === 401 ? "Wrong password." : e.message);
      return;
    }
    try { localStorage.setItem(PW_KEY, pw); } catch {}
    setPassword(pw);
    setScreen("setup");
  };

  const handleAnalyzed = (p) => {
    setPayload(p);
    setSummary(null);
    setScreen("review");
  };

  const handleConfirm = async (picks) => {
    const { tabName, day, roster } = payload;
    const toWrite = [];
    const already = [];
    for (const p of picks) {
      if (String(p.student.current).toUpperCase() === "Y") already.push(p);
      else toWrite.push(p);
    }
    let colLetter = roster.colLetter;
    if (toWrite.length) {
      const out = await call("/api/mark", {
        method: "POST",
        body: { tabName, day, rows: toWrite.map((p) => p.student.sheetRow) },
      });
      colLetter = out.colLetter || colLetter;
    }
    setSummary({ tabName, day, colLetter, marked: toWrite, already });
    setScreen("result");
  };

  const reset = () => {
    setPayload(null);
    setSummary(null);
    setScreen("setup");
  };

  if (!ready) return null;

  return (
    <div className="app">
      <Head>
        <title>Library Attendance</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <header className="topbar">
        <div className="brand">Library Attendance</div>
        {screen !== "login" && (
          <button className="btn ghost small" onClick={() => logout("")}>Sign out</button>
        )}
      </header>

      {STEPS.includes(screen) && (
        <nav className="stepper">
          {STEPS.map((s) => (
            <span key={s} className={`step ${screen === s ? "active" : ""}`}>
              {STEP_LABELS[s]}
            </span>
          ))}
        </nav>
      )}

      <main className="main">
        {screen === "login" && <Login onLogin={handleLogin} error={loginError} />}
        {screen === "setup" && <SetupStep call={call} onAnalyzed={handleAnalyzed} />}
        {screen === "review" && payload && (
          <ReviewStep payload={payload} onConfirm={handleConfirm} onBack={() => setScreen("setup")} />
        )}
        {screen === "result" && summary && <ResultStep summary={summary} onReset={reset} />}
      </main>
    </div>
  );
}
