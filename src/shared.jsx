export const C = {
  blue: "#4f8ef7", gold: "#e8b84b", green: "#52d68a", red: "#f76f6f",
  orange: "#f7934f", purple: "#a78bfa",
  bg: "#07090f", card: "#0d1117", border: "rgba(255,255,255,0.06)",
  text: "#edf0f7", muted: "#5a6880", faint: "#2e3a4a",
};

export const statusColor = {
  Abierto: "#52d68a", "En curso": "#4f8ef7", Finalizado: "#e8b84b", Cerrado: "#6b7a90",
};

export const matchStatusColor = {
  pendiente: "#5a6880", parcial: "#f7934f", conflicto: "#f76f6f", validado: "#52d68a",
};

// ── Tournament types ──────────────────────────────────────────────
export const TOURNAMENT_TYPES = {
  rapido:  { id: "rapido",  label: "Torneo rápido",         icon: "🏃", kBase: 16, color: "#52d68a", desc: "Un día o fin de semana" },
  semanal: { id: "semanal", label: "Torneo semanal",        icon: "🌟", kBase: 24, color: "#4f8ef7", desc: "Duración de una semana, más especial" },
  liga:    { id: "liga",    label: "Liga / Copa temporada", icon: "🏆", kBase: 40, color: "#e8b84b", desc: "Varias jornadas, máximo peso" },
};

// ── ELO ──────────────────────────────────────────────────────────
export const ELO_DEFAULT = 1000;
export const ELO_PROVISIONAL_GAMES = 10;

export function effectiveK(kBase, numTeams = 8, isElim = false, gamesPlayed = 999) {
  const sizeMultiplier = Math.sqrt(Math.max(numTeams, 2) / 8);
  const elimBonus = isElim ? 1.25 : 1.0;
  const provisionalMultiplier = gamesPlayed < ELO_PROVISIONAL_GAMES ? 2.0 : 1.0;
  return Math.round(kBase * sizeMultiplier * elimBonus * provisionalMultiplier);
}

export function expectedScore(eloA, eloB) {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

export function calcEloChange(eloA, eloB, result, kBase, numTeams, isElim, gamesPlayedA) {
  const K = effectiveK(kBase, numTeams, isElim, gamesPlayedA);
  return Math.round(K * (result - expectedScore(eloA, eloB)));
}

export function eloLabel(elo) {
  if (elo >= 1400) return { label: "Élite",  color: "#f7d060" };
  if (elo >= 1250) return { label: "Oro",    color: C.gold };
  if (elo >= 1100) return { label: "Plata",  color: "#94a3b8" };
  if (elo >= 950)  return { label: "Bronce", color: "#b87333" };
  return                  { label: "Hierro", color: C.muted };
}

export function eloTierIcon(elo) {
  return { Élite: "💎", Oro: "🥇", Plata: "🥈", Bronce: "🥉", Hierro: "⚙️" }[eloLabel(elo).label] || "⚙️";
}

// ── Helpers ───────────────────────────────────────────────────────
export function getRoundName(totalRounds, roundIdx) {
  if (totalRounds === 1) return "Final";
  const remaining = totalRounds - roundIdx;
  return ["Final", "Semifinal", "Cuartos de final", "Octavos de final", "Ronda 1"][Math.min(remaining - 1, 4)] || `Ronda ${roundIdx + 1}`;
}

export function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

export function formatDatetime(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export function isTournamentActive(t) {
  if (t.status === "Abierto" || t.status === "En curso") return true;
  if (t.status === "Finalizado" || t.status === "Cerrado") {
    const updated = t.finishedAt || t.createdAt;
    return (Date.now() - new Date(updated).getTime()) < 14 * 24 * 60 * 60 * 1000;
  }
  return false;
}

// ── Match builders ────────────────────────────────────────────────
export function makeMatch(teamA, teamB, leg = 1, matchday = 1) {
  return { teamA, teamB, leg, matchday, scoreA: null, scoreB: null, played: false, reportByA: null, reportByB: null, matchStatus: "pendiente", winner: null };
}

export function makeElimMatch(teamA, teamB) {
  return { teamA, teamB, scoreA: null, scoreB: null, winner: null, reportByA: null, reportByB: null, matchStatus: "pendiente" };
}

function roundRobinMatchdays(teams) {
  const list = [...teams];
  if (list.length % 2 !== 0) list.push("BYE");
  const total = list.length, rounds = total - 1;
  const matchdays = [], t = [...list];
  for (let r = 0; r < rounds; r++) {
    const day = [];
    for (let i = 0; i < total / 2; i++) {
      const a = t[i], b = t[total - 1 - i];
      if (a !== "BYE" && b !== "BYE") day.push({ teamA: a, teamB: b });
    }
    matchdays.push(day);
    t.splice(1, 0, t.pop());
  }
  return matchdays;
}

export function buildGroups(teams, groupCount, legs = 1) {
  const shuffled = shuffle(teams);
  const groups = Array.from({ length: groupCount }, (_, i) => ({
    name: String.fromCharCode(65 + i), teams: [], matches: [], standings: [], legs,
  }));
  shuffled.forEach((t, i) => groups[i % groupCount].teams.push(t));
  groups.forEach((g) => {
    g.standings = g.teams.map((t) => ({ name: t, pts: 0, gf: 0, gc: 0, pj: 0, gd: 0 }));
    const days = roundRobinMatchdays(g.teams);
    const matches = [];
    days.forEach((day, di) => day.forEach(({ teamA, teamB }) => matches.push(makeMatch(teamA, teamB, 1, di + 1))));
    if (legs === 2) days.forEach((day, di) => day.forEach(({ teamA, teamB }) => matches.push(makeMatch(teamB, teamA, 2, days.length + di + 1))));
    g.matches = matches;
    g.totalMatchdays = legs === 2 ? days.length * 2 : days.length;
  });
  return groups;
}

export function applyGroupResult(standings, teamA, teamB, scoreA, scoreB) {
  return standings.map((s) => {
    if (s.name !== teamA && s.name !== teamB) return s;
    const isA = s.name === teamA;
    const gf = isA ? scoreA : scoreB, gc = isA ? scoreB : scoreA;
    const pts = gf > gc ? 3 : gf === gc ? 1 : 0;
    return { ...s, pj: s.pj + 1, gf: s.gf + gf, gc: s.gc + gc, gd: s.gd + gf - gc, pts: s.pts + pts };
  }).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}

export function buildSeededElimination(groups, qualify) {
  const byPosition = [];
  for (let pos = 0; pos < qualify; pos++) byPosition.push(groups.map(g => g.standings[pos]?.name).filter(Boolean));
  const matches = [], numGroups = groups.length;
  const firstPlace = byPosition[0] || [], secondPlace = byPosition[1] || [];
  if (secondPlace.length > 0) {
    for (let i = 0; i < firstPlace.length; i++) {
      const opp = secondPlace[(i + Math.floor(numGroups / 2)) % numGroups] || secondPlace[i];
      if (opp) matches.push(makeElimMatch(firstPlace[i], opp));
    }
    const paired = new Set(matches.flatMap(m => [m.teamA, m.teamB]));
    const remaining = [...firstPlace, ...secondPlace].filter(t => !paired.has(t));
    for (let i = 0; i < remaining.length - 1; i += 2) matches.push(makeElimMatch(remaining[i], remaining[i + 1]));
  } else {
    for (let i = 0; i < firstPlace.length - 1; i += 2) matches.push(makeElimMatch(firstPlace[i], firstPlace[i + 1]));
  }
  for (let pos = 2; pos < qualify; pos++) {
    const extras = byPosition[pos] || [];
    for (let i = 0; i < extras.length - 1; i += 2) matches.push(makeElimMatch(extras[i], extras[i + 1]));
  }
  return matches;
}

export function buildEliminationRound(teams) {
  const shuffled = shuffle(teams);
  const matches = [];
  for (let i = 0; i < shuffled.length; i += 2) matches.push(makeElimMatch(shuffled[i], shuffled[i + 1] || "BYE"));
  return matches;
}

export function computeMatchStatus(match, side, scoreA, scoreB) {
  const other = side === "A" ? match.reportByB : match.reportByA;
  if (!other) return "parcial";
  return (other.scoreA === scoreA && other.scoreB === scoreB) ? "validado" : "conflicto";
}

// ── UI Components ─────────────────────────────────────────────────
export function TeamLogo({ name, logoUrl, size = 28 }) {
  if (!name) return null;
  if (logoUrl) {
    return <img src={logoUrl} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0, background: "#1a2030", display: "block" }} onError={e => { e.target.style.display = "none"; }} />;
  }
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: `hsl(${hue},45%,28%)`, border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(size * 0.38, 10), fontWeight: 700, color: "#e8edf4", fontFamily: "'Georgia',serif" }}>{name.charAt(0).toUpperCase()}</div>;
}

export function EloBar({ elo }) {
  const pct = Math.min(100, Math.max(0, ((elo - 600) / 900) * 100));
  const { color } = eloLabel(elo);
  return <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} /></div>;
}

export function BottomNav({ tabs, active, onChange, color = C.gold }) {
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
      background: "rgba(7,9,15,0.97)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderTop: "1px solid rgba(255,255,255,0.06)",
      display: "flex", alignItems: "stretch",
      // Home indicator safe area
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 3, padding: "10px 2px 10px",
          background: "none", border: "none", cursor: "pointer",
          color: active === t.id ? color : C.muted,
          fontFamily: "'Georgia',serif", transition: "color .15s",
          minWidth: 0, position: "relative",
          // 44pt minimum touch target
          minHeight: 44,
          WebkitTapHighlightColor: "transparent",
        }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</span>
          <span style={{ fontSize: 9, letterSpacing: 0.4, textTransform: "uppercase", lineHeight: 1, whiteSpace: "nowrap" }}>{t.label}</span>
          {t.badge > 0 && (
            <span style={{ position: "absolute", top: 6, right: "calc(50% - 18px)", fontSize: 8, background: C.red, color: "#fff", borderRadius: 10, padding: "1px 5px", fontFamily: "sans-serif", minWidth: 14, textAlign: "center" }}>{t.badge}</span>
          )}
        </button>
      ))}
    </nav>
  );
}

export const S = {
  wrap: {
    minHeight: "100dvh", // dynamic viewport — Safari toolbar aware
    background: C.bg,
    fontFamily: "'Georgia','Times New Roman',serif",
    color: C.text,
  },

  // Top bar — sits below Dynamic Island via padding-top in body
  topBar: {
    padding: "0 16px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    // 54px content + safe area inset handled by body padding-top
    height: 54,
    background: "rgba(7,9,15,0.97)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    position: "sticky", top: 0, zIndex: 100,
  },

  // Main content — bottom padding accounts for nav + home indicator
  main: {
    maxWidth: 390, // iPhone 17 logical width
    margin: "0 auto",
    padding: "20px 16px",
    // Bottom: nav height (64px) + safe area bottom (up to 34pt on iPhone 17)
    paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
  },

  card: {
    border: "1px solid rgba(255,255,255,0.06)",
    background: C.card, borderRadius: 16, // slightly larger radius for modern iOS feel
    padding: 16, marginBottom: 10,
  },
  label: { fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.muted, display: "block", marginBottom: 7 },
  input: {
    width: "100%", padding: "14px", fontSize: 16, // 16px prevents iOS auto-zoom
    borderRadius: 12, background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.09)", color: C.text,
    boxSizing: "border-box", fontFamily: "'Georgia',serif",
    WebkitAppearance: "none", appearance: "none",
    // 44pt touch target
    minHeight: 44,
  },
  textarea: {
    width: "100%", padding: "14px", fontSize: 16,
    borderRadius: 12, background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.09)", color: C.text,
    boxSizing: "border-box", fontFamily: "'Georgia',serif",
    minHeight: 110, resize: "vertical",
    WebkitAppearance: "none", appearance: "none",
  },
  select: {
    width: "100%", padding: "14px", fontSize: 16,
    borderRadius: 12, background: "#0d1117",
    border: "1px solid rgba(255,255,255,0.09)", color: C.text,
    fontFamily: "'Georgia',serif",
    WebkitAppearance: "none", appearance: "none",
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%235a6880' stroke-width='1.5' fill='none'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center", paddingRight: 36,
    minHeight: 44,
  },
  btn: (color = "#4f8ef7") => ({
    padding: "15px 20px", background: color, border: "none", borderRadius: 12,
    color: color === "#e8b84b" ? "#07090f" : "#fff",
    cursor: "pointer", letterSpacing: 1, textTransform: "uppercase",
    fontSize: 14, fontWeight: 700, fontFamily: "'Georgia',serif",
    whiteSpace: "nowrap", WebkitTapHighlightColor: "transparent",
    width: "100%", minHeight: 52, // generous touch target
    WebkitAppearance: "none",
  }),
  btnInline: (color = "#4f8ef7") => ({
    padding: "11px 18px", background: color, border: "none", borderRadius: 10,
    color: color === "#e8b84b" ? "#07090f" : "#fff",
    cursor: "pointer", letterSpacing: 1, textTransform: "uppercase",
    fontSize: 12, fontWeight: 700, fontFamily: "'Georgia',serif",
    whiteSpace: "nowrap", WebkitTapHighlightColor: "transparent",
    flexShrink: 0, minHeight: 44,
  }),
  btnSm: {
    padding: "9px 14px", background: "transparent", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.13)", color: C.muted,
    cursor: "pointer", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    fontFamily: "'Georgia',serif", whiteSpace: "nowrap",
    WebkitTapHighlightColor: "transparent", flexShrink: 0, minHeight: 44,
  },
  btnDanger: {
    padding: "9px 14px", background: "transparent", borderRadius: 10,
    border: "1px solid rgba(247,111,111,0.3)", color: "#f76f6f",
    cursor: "pointer", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
    fontFamily: "'Georgia',serif", WebkitTapHighlightColor: "transparent",
    minHeight: 44,
  },
  tag: (color) => ({
    fontSize: 9, letterSpacing: 1.5, padding: "4px 10px", borderRadius: 20,
    background: `${color}1a`, color, border: `1px solid ${color}40`,
    textTransform: "uppercase", display: "inline-block", whiteSpace: "nowrap",
  }),
  th: { fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: C.muted, padding: "10px 8px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  td: { padding: "11px 8px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.03)" },
  numInput: {
    width: 52, padding: "10px 4px", textAlign: "center", borderRadius: 10,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
    color: C.text, fontFamily: "'Georgia',serif", fontSize: 20,
    WebkitAppearance: "none", appearance: "none", minHeight: 44,
  },
  sectionTitle: { fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.blue, margin: "0 0 14px" },
  pageTitle: { fontSize: 24, fontWeight: 700, margin: "0 0 4px" },
  pageSubtitle: { fontSize: 14, color: C.muted, margin: "0 0 20px" },
};
