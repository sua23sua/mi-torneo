export const C = {
  blue: "#4f8ef7", gold: "#e8b84b", green: "#52d68a", red: "#f76f6f",
  bg: "#07090f", card: "#0d1117", border: "rgba(255,255,255,0.06)",
  text: "#edf0f7", muted: "#5a6880", faint: "#2e3a4a",
};

export const statusColor = {
  Abierto: "#52d68a", "En curso": "#4f8ef7", Finalizado: "#e8b84b", Cerrado: "#6b7a90",
};

export function getRoundName(totalRounds, roundIdx) {
  if (totalRounds === 1) return "Final";
  const remaining = totalRounds - roundIdx;
  return ["Final", "Semifinal", "Cuartos de final", "Octavos de final", "Ronda 1"][Math.min(remaining - 1, 4)] || `Ronda ${roundIdx + 1}`;
}

export function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

export function buildGroups(teams, groupCount, legs = 1) {
  const shuffled = shuffle(teams);
  const groups = Array.from({ length: groupCount }, (_, i) => ({
    name: String.fromCharCode(65 + i), teams: [], matches: [], standings: [], legs,
  }));
  shuffled.forEach((t, i) => groups[i % groupCount].teams.push(t));
  groups.forEach((g) => {
    g.standings = g.teams.map((t) => ({ name: t, pts: 0, gf: 0, gc: 0, pj: 0, gd: 0 }));
    const matches = [];
    for (let a = 0; a < g.teams.length; a++) {
      for (let b = a + 1; b < g.teams.length; b++) {
        matches.push({ teamA: g.teams[a], teamB: g.teams[b], scoreA: null, scoreB: null, played: false, leg: 1 });
        if (legs === 2) {
          matches.push({ teamA: g.teams[b], teamB: g.teams[a], scoreA: null, scoreB: null, played: false, leg: 2 });
        }
      }
    }
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

export function buildSeededElimination(groups, qualify) {
  const byPosition = [];
  for (let pos = 0; pos < qualify; pos++) {
    byPosition.push(groups.map(g => g.standings[pos]?.name).filter(Boolean));
  }
  const matches = [];
  const numGroups = groups.length;
  const firstPlace = byPosition[0] || [];
  const secondPlace = byPosition[1] || [];
  if (secondPlace.length > 0) {
    for (let i = 0; i < firstPlace.length; i++) {
      const oppIdx = (i + Math.floor(numGroups / 2)) % numGroups;
      const opp = secondPlace[oppIdx] || secondPlace[i];
      if (opp) matches.push({ teamA: firstPlace[i], teamB: opp, scoreA: null, scoreB: null, winner: null });
    }
    const paired = new Set(matches.flatMap(m => [m.teamA, m.teamB]));
    const remaining = [...firstPlace, ...secondPlace].filter(t => !paired.has(t));
    for (let i = 0; i < remaining.length - 1; i += 2)
      matches.push({ teamA: remaining[i], teamB: remaining[i + 1], scoreA: null, scoreB: null, winner: null });
  } else {
    for (let i = 0; i < firstPlace.length - 1; i += 2)
      matches.push({ teamA: firstPlace[i], teamB: firstPlace[i + 1], scoreA: null, scoreB: null, winner: null });
  }
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

export function TeamLogo({ name, logoUrl, size = 28 }) {
  if (!name) return null;
  if (logoUrl) {
    return (
      <img src={logoUrl} alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0, background: "#1a2030" }}
        onError={e => { e.target.style.display = "none"; }} />
    );
  }
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `hsl(${hue},45%,28%)`, border: "1px solid rgba(255,255,255,0.1)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.max(size * 0.38, 10), fontWeight: 700, color: "#e8edf4",
      fontFamily: "'Georgia',serif",
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Shared UI tokens ──────────────────────────────────────────────
export const S = {
  wrap: { minHeight: "100vh", background: C.bg, fontFamily: "'Georgia','Times New Roman',serif", color: C.text },
  header: {
    padding: "0 clamp(16px,4vw,32px)", display: "flex", alignItems: "center",
    justifyContent: "space-between", height: 58,
    background: "rgba(7,9,15,0.97)", backdropFilter: "blur(16px)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    position: "sticky", top: 0, zIndex: 100,
  },
  main: { maxWidth: 1080, margin: "0 auto", padding: "clamp(24px,4vw,44px) clamp(16px,4vw,32px)" },
  card: {
    border: "1px solid rgba(255,255,255,0.06)", background: C.card,
    borderRadius: 10, padding: "clamp(16px,3vw,24px)", marginBottom: 12,
  },
  cardHover: { cursor: "pointer", transition: "border-color .15s,background .15s" },
  label: { fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.muted, display: "block", marginBottom: 8 },
  input: {
    width: "100%", padding: "11px 14px", fontSize: 14, borderRadius: 7,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
    color: C.text, boxSizing: "border-box", fontFamily: "'Georgia',serif",
    transition: "border-color .15s",
  },
  textarea: {
    width: "100%", padding: "11px 14px", fontSize: 14, borderRadius: 7,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
    color: C.text, boxSizing: "border-box", fontFamily: "'Georgia',serif",
    minHeight: 100, resize: "vertical",
  },
  select: {
    width: "100%", padding: "11px 14px", fontSize: 14, borderRadius: 7,
    background: "#0d1117", border: "1px solid rgba(255,255,255,0.09)",
    color: C.text, fontFamily: "'Georgia',serif",
  },
  btn: (color = "#4f8ef7") => ({
    padding: "10px 22px", background: color, border: "none", borderRadius: 7,
    color: color === "#e8b84b" ? "#07090f" : "#fff",
    cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase",
    fontSize: 11, fontWeight: 700, fontFamily: "'Georgia',serif",
    whiteSpace: "nowrap", transition: "opacity .15s, transform .1s",
  }),
  btnSm: {
    padding: "6px 14px", background: "transparent", borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.13)", color: C.muted,
    cursor: "pointer", fontSize: 10, letterSpacing: 1, textTransform: "uppercase",
    fontFamily: "'Georgia',serif", whiteSpace: "nowrap",
  },
  btnDanger: {
    padding: "6px 14px", background: "transparent", borderRadius: 6,
    border: "1px solid rgba(247,111,111,0.3)", color: "#f76f6f",
    cursor: "pointer", fontSize: 10, letterSpacing: 1, textTransform: "uppercase",
    fontFamily: "'Georgia',serif",
  },
  tag: (color) => ({
    fontSize: 9, letterSpacing: 2, padding: "3px 9px", borderRadius: 20,
    background: `${color}1a`, color, border: `1px solid ${color}40`,
    textTransform: "uppercase", display: "inline-block", whiteSpace: "nowrap",
  }),
  tab: (active, color = "#4f8ef7") => ({
    padding: "12px clamp(12px,2vw,22px)", background: "none", border: "none",
    borderBottom: active ? `2px solid ${color}` : "2px solid transparent",
    color: active ? color : C.muted, cursor: "pointer",
    fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
    fontFamily: "'Georgia',serif", marginBottom: -1, whiteSpace: "nowrap",
    transition: "color .15s",
  }),
  th: {
    fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.muted,
    padding: "10px 12px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  td: { padding: "10px 12px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.03)" },
  numInput: {
    width: 46, padding: "6px 4px", textAlign: "center", borderRadius: 6,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    color: C.text, fontFamily: "'Georgia',serif", fontSize: 13,
  },
  divider: { height: 1, background: "rgba(255,255,255,0.05)", margin: "20px 0" },
  sectionTitle: { fontSize: 10, letterSpacing: 4, textTransform: "uppercase", color: C.blue, marginBottom: 16 },
};
