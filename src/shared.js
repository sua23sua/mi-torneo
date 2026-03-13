export const C = {
  blue: "#388bff", gold: "#d4a03c", green: "#4ade80", red: "#ff6b6b",
  bg: "#080c14", border: "rgba(255,255,255,0.07)", text: "#e8edf4",
  muted: "#6a7890", faint: "#4a5568",
};

export const statusColor = {
  Abierto: "#4ade80", "En curso": "#388bff", Finalizado: "#d4a03c", Cerrado: "#94a3b8",
};

export function getRoundName(totalRounds, roundIdx) {
  if (totalRounds === 1) return "Final";
  const remaining = totalRounds - roundIdx;
  return ["Final", "Semifinal", "Cuartos de final", "Octavos de final", "Ronda 1"][Math.min(remaining - 1, 4)] || `Ronda ${roundIdx + 1}`;
}

export function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

export function buildGroups(teams, groupCount) {
  const shuffled = shuffle(teams);
  const groups = Array.from({ length: groupCount }, (_, i) => ({
    name: String.fromCharCode(65 + i), teams: [], matches: [], standings: [],
  }));
  shuffled.forEach((t, i) => groups[i % groupCount].teams.push(t));
  groups.forEach((g) => {
    g.standings = g.teams.map((t) => ({ name: t, pts: 0, gf: 0, gc: 0, pj: 0, gd: 0 }));
    const matches = [];
    for (let a = 0; a < g.teams.length; a++)
      for (let b = a + 1; b < g.teams.length; b++)
        matches.push({ teamA: g.teams[a], teamB: g.teams[b], scoreA: null, scoreB: null, played: false });
    g.matches = matches;
  });
  return groups;
}

export function applyGroupResult(standings, teamA, teamB, scoreA, scoreB) {
  return standings.map((s) => {
    if (s.name !== teamA && s.name !== teamB) return s;
    const isA = s.name === teamA;
    const gf = isA ? scoreA : scoreB;
    const gc = isA ? scoreB : scoreA;
    const pts = gf > gc ? 3 : gf === gc ? 1 : 0;
    return { ...s, pj: s.pj + 1, gf: s.gf + gf, gc: s.gc + gc, gd: s.gd + gf - gc, pts: s.pts + pts };
  }).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}

/**
 * Smart seeding: 1ºA vs 2ºB, 1ºB vs 2ºA, etc.
 * Best teams (1st place) face worst teams (last qualifier) from OTHER groups.
 */
export function buildSeededElimination(groups, qualify) {
  // collect qualifiers per position
  const byPosition = []; // byPosition[0] = all 1st-place finishers, [1] = all 2nd-place, etc.
  for (let pos = 0; pos < qualify; pos++) {
    byPosition.push(groups.map(g => g.standings[pos]?.name).filter(Boolean));
  }

  const matches = [];
  const numGroups = groups.length;

  // pair 1st of group i vs 2nd of group (i + floor(numGroups/2)) % numGroups
  const firstPlace = byPosition[0] || [];
  const secondPlace = byPosition[1] || [];

  if (secondPlace.length > 0) {
    // Classic seeding: 1st[i] vs 2nd[opposite group]
    for (let i = 0; i < firstPlace.length; i++) {
      const oppIdx = (i + Math.floor(numGroups / 2)) % numGroups;
      const opp = secondPlace[oppIdx] || secondPlace[i];
      if (opp) matches.push({ teamA: firstPlace[i], teamB: opp, scoreA: null, scoreB: null, winner: null });
    }
    // If there are leftover 2nd place teams not yet paired (odd groups), add them
    const paired = new Set(matches.flatMap(m => [m.teamA, m.teamB]));
    const remaining = [...firstPlace, ...secondPlace].filter(t => !paired.has(t));
    for (let i = 0; i < remaining.length - 1; i += 2)
      matches.push({ teamA: remaining[i], teamB: remaining[i + 1], scoreA: null, scoreB: null, winner: null });
  } else {
    // Only first place (liga or single group)
    for (let i = 0; i < firstPlace.length - 1; i += 2)
      matches.push({ teamA: firstPlace[i], teamB: firstPlace[i + 1], scoreA: null, scoreB: null, winner: null });
  }

  // Handle extra qualify slots (3rd place etc.)
  for (let pos = 2; pos < qualify; pos++) {
    const extras = byPosition[pos] || [];
    for (let i = 0; i < extras.length - 1; i += 2)
      matches.push({ teamA: extras[i], teamB: extras[i + 1], scoreA: null, scoreB: null, winner: null });
  }

  return matches;
}

export function buildEliminationRound(teams) {
  const shuffled = shuffle(teams);
  const matches = [];
  for (let i = 0; i < shuffled.length; i += 2)
    matches.push({ teamA: shuffled[i], teamB: shuffled[i + 1] || "BYE", scoreA: null, scoreB: null, winner: null });
  return matches;
}

export const S = {
  wrap: { minHeight: "100vh", background: "#080c14", fontFamily: "'Georgia','Times New Roman',serif", color: "#e8edf4" },
  header: {
    borderBottom: "1px solid rgba(56,139,255,0.15)", padding: "0 clamp(16px,4vw,32px)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    height: 60, background: "rgba(8,12,20,0.95)", backdropFilter: "blur(12px)",
    position: "sticky", top: 0, zIndex: 100,
  },
  main: { maxWidth: 1040, margin: "0 auto", padding: "clamp(20px,4vw,40px) clamp(16px,4vw,32px)" },
  card: { border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", padding: "clamp(16px,3vw,24px)", marginBottom: 12 },
  label: { fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#6a7890", display: "block", marginBottom: 8 },
  input: { width: "100%", padding: "10px 14px", fontSize: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#e8edf4", boxSizing: "border-box", fontFamily: "'Georgia',serif" },
  textarea: { width: "100%", padding: "10px 14px", fontSize: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#e8edf4", boxSizing: "border-box", fontFamily: "'Georgia',serif", minHeight: 100, resize: "vertical" },
  select: { width: "100%", padding: "10px 14px", fontSize: 14, background: "#0e1420", border: "1px solid rgba(255,255,255,0.1)", color: "#e8edf4", fontFamily: "'Georgia',serif" },
  btn: (color = "#388bff") => ({ padding: "10px 20px", background: color, border: "none", color: color === "#d4a03c" ? "#0a0a0f" : "#fff", cursor: "pointer", letterSpacing: 2, textTransform: "uppercase", fontSize: 11, fontWeight: 700, fontFamily: "'Georgia',serif", whiteSpace: "nowrap" }),
  btnSm: { padding: "5px 12px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "#6a7890", cursor: "pointer", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontFamily: "'Georgia',serif", whiteSpace: "nowrap" },
  btnDanger: { padding: "5px 12px", background: "transparent", border: "1px solid rgba(255,100,100,0.3)", color: "#ff6b6b", cursor: "pointer", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontFamily: "'Georgia',serif" },
  tag: (color) => ({ fontSize: 9, letterSpacing: 2, padding: "3px 8px", background: `${color}22`, color, border: `1px solid ${color}44`, textTransform: "uppercase" }),
  tab: (active, color = "#388bff") => ({ padding: "10px clamp(12px,2vw,20px)", background: "none", border: "none", borderBottom: active ? `2px solid ${color}` : "2px solid transparent", color: active ? color : "#6a7890", cursor: "pointer", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Georgia',serif", marginBottom: -1, whiteSpace: "nowrap" }),
  th: { fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#6a7890", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.07)" },
  td: { padding: "8px 10px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.04)" },
  numInput: { width: 44, padding: "5px 6px", textAlign: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#e8edf4", fontFamily: "'Georgia',serif", fontSize: 13 },
};
