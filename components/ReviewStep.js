import { useMemo, useState } from 'react';
import { dedupeNames, matchNames, normalizeName } from '../lib/matcher.js';

function meta(s) {
  const bits = [s.timing, s.id].filter(Boolean).join(' · ');
  return bits ? ` (${bits})` : '';
}

function StudentOption({ s }) {
  const already = String(s.current).toUpperCase() === 'Y';
  return (
    <span>
      {s.name}
      {meta(s)}
      {already ? '  [already marked]' : ''}
    </span>
  );
}

export default function ReviewStep({ payload, onConfirm, onBack }) {
  const students = payload.roster.students;

  const seedDetected = useMemo(
    () =>
      dedupeNames([
        ...payload.result.auto.map((a) => a.detected),
        ...payload.result.conflicts.map((c) => c.detected),
        ...payload.result.unmatched,
      ]),
    [payload]
  );

  const [base, setBase] = useState(seedDetected);
  const [added, setAdded] = useState([]);
  const [addText, setAddText] = useState('');
  const [removedAuto, setRemovedAuto] = useState([]);
  const [choices, setChoices] = useState({}); // normDetected -> studentKey | 'ignore'
  const [assigns, setAssigns] = useState({}); // normDetected -> studentKey | 'ignore'
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const allDetected = useMemo(() => dedupeNames([...base, ...added]), [base, added]);
  const match = useMemo(() => matchNames(allDetected, students), [allDetected, students]);

  const keyOf = (s) => normalizeName(s);
  const byKey = (k) => students.find((s) => s.key === k);

  const removeDetected = (detected) => {
    const k = keyOf(detected);
    setBase((b) => b.filter((n) => keyOf(n) !== k));
    setAdded((a) => a.filter((n) => keyOf(n) !== k));
  };

  const addName = () => {
    const t = addText.trim();
    if (!t) return;
    setAdded((a) => [...a, t]);
    setAddText('');
  };

  const confirm = async () => {
    setError('');
    const picks = [];
    for (const a of match.auto) {
      if (!removedAuto.includes(keyOf(a.detected))) picks.push({ detected: a.detected, student: a.row });
    }
    for (const c of match.conflicts) {
      const k = keyOf(c.detected);
      const ch = choices[k] !== undefined ? choices[k] : c.candidates[0].key;
      if (ch !== 'ignore') {
        const s = byKey(ch);
        if (s) picks.push({ detected: c.detected, student: s });
      }
    }
    for (const u of match.unmatched) {
      const asg = assigns[keyOf(u)];
      if (asg !== undefined && asg !== 'ignore') {
        const s = byKey(asg);
        if (s) picks.push({ detected: u, student: s });
      }
    }
    const seen = new Set();
    const final = picks.filter((p) => {
      if (seen.has(p.student.key)) return false;
      seen.add(p.student.key);
      return true;
    });
    if (!final.length) {
      setError('Nothing to mark. Pick at least one student, or go back.');
      return;
    }
    try {
      setBusy('Writing to Google Sheets…');
      await onConfirm(final);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy('');
    }
  };

  const rosterOptions = (list) =>
    list.map((s) => (
      <option key={s.key} value={s.key}>
        {s.name}
        {meta(s)}
        {String(s.current).toUpperCase() === 'Y' ? '  [already marked]' : ''}
      </option>
    ));

  return (
    <div className="card">
      <h2>Review matches</h2>
      <p className="muted">
        Tab <code>{payload.tabName}</code> · Day <code>{payload.day}</code> (column {payload.roster.colLetter}) ·{' '}
        {allDetected.length} names from photo
      </p>
      {error && <div className="msg err">{error}</div>}

      <h3>
        <span className="badge ok">Auto matched</span> {match.auto.length}
      </h3>
      {match.auto.length === 0 && <p className="muted small">None.</p>}
      {match.auto.map((a) => {
        const k = keyOf(a.detected);
        const removed = removedAuto.includes(k);
        return (
          <div className={`row-card ${removed ? 'dim' : ''}`} key={k}>
            <div>
              <div className="detected">"{a.detected}"</div>
              <div className="muted small">
                → {a.row.name}
                {meta(a.row)}
                {String(a.row.current).toUpperCase() === 'Y' ? ' · already marked' : ''}
              </div>
            </div>
            <button className="link" onClick={() => removeDetected(a.detected)}>remove</button>
          </div>
        );
      })}

      <h3>
        <span className="badge warn">Needs your decision</span> {match.conflicts.length}
      </h3>
      <p className="muted small">Same or partial name matched more than one row. Pick the right one, or Ignore.</p>
      {match.conflicts.length === 0 && <p className="muted small">None.</p>}
      {match.conflicts.map((c) => {
        const k = keyOf(c.detected);
        const val = choices[k] !== undefined ? choices[k] : c.candidates[0].key;
        return (
          <div className="row-card" key={k}>
            <div className="detected">"{c.detected}" <span className="muted small">({c.candidates.length} matches)</span></div>
            <div className="row-actions">
              <select
                value={val}
                onChange={(e) =>
                  setChoices({ ...choices, [k]: e.target.value === 'ignore' ? 'ignore' : Number(e.target.value) })
                }
              >
                {rosterOptions(c.candidates)}
                <option value="ignore">Ignore</option>
              </select>
              <button className="link" onClick={() => removeDetected(c.detected)}>remove</button>
            </div>
          </div>
        );
      })}

      <h3>
        <span className="badge gray">Not in sheet</span> {match.unmatched.length}
      </h3>
      <p className="muted small">No roster match. Ignore, or assign to a student manually.</p>
      <div className="add-row">
        <input
          type="text"
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          placeholder="Add a name Gemini missed…"
          onKeyDown={(e) => { if (e.key === 'Enter') addName(); }}
        />
        <button className="btn" onClick={addName}>Add</button>
      </div>
      {match.unmatched.length === 0 && <p className="muted small">None.</p>}
      {match.unmatched.map((u) => {
        const k = keyOf(u);
        return (
          <div className="row-card" key={k}>
            <div className="detected">"{u}"</div>
            <div className="row-actions">
              <select
                value={assigns[k] !== undefined ? assigns[k] : 'ignore'}
                onChange={(e) =>
                  setAssigns({ ...assigns, [k]: e.target.value === 'ignore' ? 'ignore' : Number(e.target.value) })
                }
              >
                <option value="ignore">Ignore</option>
                {rosterOptions(students)}
              </select>
              <button className="link" onClick={() => removeDetected(u)}>remove</button>
            </div>
          </div>
        );
      })}

      <div className="actions">
        <button className="btn ghost" onClick={onBack} disabled={!!busy}>Back</button>
        <button className="btn primary" onClick={confirm} disabled={!!busy}>
          {busy || 'Confirm and mark attendance'}
        </button>
      </div>
    </div>
  );
}
