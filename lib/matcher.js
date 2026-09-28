// Pure name-matching logic: detected names (from Gemini) -> roster rows.
//
// Rules:
// - Exactly one candidate AND exact match            -> auto-mark
// - One or more candidates but not exact / several  -> user picks (conflict)
// - No candidates                                   -> unmatched (ignore or manual assign)

export function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function dedupeNames(names) {
  const seen = new Set();
  const out = [];
  for (const n of names) {
    const k = normalizeName(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(String(n).trim());
  }
  return out;
}

// Returns candidates sorted best-first: [{ row, score }]
export function findCandidates(detected, roster) {
  const d = normalizeName(detected);
  if (!d) return [];
  const dTokens = d.split(' ');
  const scored = [];
  for (const row of roster) {
    const rn = normalizeName(row.name);
    if (!rn) continue;
    let score = 0;
    if (rn === d) {
      score = 100;
    } else if (rn.includes(d) || d.includes(rn)) {
      score = 80;
    } else {
      const rTokens = new Set(rn.split(' '));
      let inter = 0;
      for (const t of dTokens) if (rTokens.has(t)) inter++;
      const overlap = inter / Math.max(dTokens.length, rTokens.size);
      if (overlap >= 0.5) score = Math.round(overlap * 60);
    }
    if (score > 0) scored.push({ row, score });
  }
  scored.sort((a, b) => b.score - a.score || a.row.sheetRow - b.row.sheetRow);
  // If we have a strong candidate (exact or substring match), drop the loose
  // token-overlap guesses so the picker only shows genuinely similar rows.
  if (scored.some((c) => c.score >= 80)) {
    return scored.filter((c) => c.score >= 80);
  }
  return scored;
}

export function matchNames(detectedNames, roster) {
  const auto = [];
  const conflicts = [];
  const unmatched = [];
  for (const detected of dedupeNames(detectedNames)) {
    const cands = findCandidates(detected, roster);
    if (cands.length === 1 && cands[0].score === 100) {
      auto.push({ detected, row: cands[0].row });
    } else if (cands.length > 0) {
      conflicts.push({ detected, candidates: cands.map((c) => c.row) });
    } else {
      unmatched.push(detected);
    }
  }
  return { auto, conflicts, unmatched };
}
