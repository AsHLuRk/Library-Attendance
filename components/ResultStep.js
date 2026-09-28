export default function ResultStep({ summary, onReset }) {
  return (
    <div className="card">
      <h2>Attendance marked</h2>
      <p className="muted">
        Tab <code>{summary.tabName}</code> · Day <code>{summary.day}</code> (column {summary.colLetter})
      </p>

      <div className="stats">
        <div className="stat">
          <div className="stat-num">{summary.marked.length}</div>
          <div className="stat-label">Marked present</div>
        </div>
        <div className="stat">
          <div className="stat-num">{summary.already.length}</div>
          <div className="stat-label">Already marked</div>
        </div>
      </div>

      {summary.marked.length > 0 && (
        <>
          <h3>Marked (Y written)</h3>
          <ul className="plain-list">
            {summary.marked.map((p) => (
              <li key={p.student.key}>
                {p.student.name}
                <span className="muted small"> — row {p.student.sheetRow}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {summary.already.length > 0 && (
        <>
          <h3>Skipped (already Y)</h3>
          <ul className="plain-list">
            {summary.already.map((p) => (
              <li key={p.student.key}>{p.student.name}</li>
            ))}
          </ul>
        </>
      )}

      <div className="actions">
        <button className="btn primary" onClick={onReset}>Mark another photo</button>
      </div>
    </div>
  );
}
