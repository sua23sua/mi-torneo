import { useState } from "react";
import { db } from "../firebase";
import { doc, updateDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { C, S, TeamLogo, matchStatusColor, getRoundName, applyGroupResult, computeMatchStatus, formatDatetime, calcEloChange, ELO_DEFAULT, TOURNAMENT_TYPES, buildEliminationRound } from "../shared.jsx";

const CUP_COLORS = { Oro: C.gold, Plata: "#94a3b8", Bronce: "#b87333", Cobre: C.muted };

// ── Collect all matchdays from all tournament formats ─────────────
export function collectMatchdays(tournaments) {
  const result = [];
  tournaments.forEach(t => {
    if (t.status !== "En curso" && t.status !== "Abierto") return;
    const schedule = t.matchdaySchedule || {};
    const numTeams = t.teams?.length || 8;
    const ttype = t.tournamentType || "rapido";

    // ── Standard groups (Liga, Grupos+Elim, Swiss group) ──
    t.groups?.forEach((g, gi) => {
      const byDay = {};
      (g.matches || []).forEach((m, mi) => { const day = m.matchday || 1; if (!byDay[day]) byDay[day] = []; byDay[day].push({ ...m, _mi: mi }); });
      Object.entries(byDay).sort((a, b) => +a[0] - +b[0]).forEach(([day, matches]) => {
        const schedKey = `g_${gi}_d_${day}`;
        const isSwiss = g.isSwiss;
        result.push({
          key: `t_${t.id}_${schedKey}`,
          tournamentId: t.id, tournamentName: t.name,
          tournamentType: ttype, numTeams,
          groupName: isSwiss ? "Único" : g.name,
          matchdayNum: +day,
          datetime: schedule[schedKey] || null,
          label: isSwiss ? `Jornada ${day} · Grupo Único` : `Jornada ${day} · Grupo ${g.name}`,
          phase: isSwiss ? "Grupo Único" : `Grupo ${g.name}`,
          type: "group", gi, schedKey, matches, isElim: false,
        });
      });
    });

    // ── Elimination rounds ──
    t.eliminationRounds?.forEach((round, ri) => {
      const schedKey = `elim_${ri}`;
      result.push({
        key: `t_${t.id}_${schedKey}`,
        tournamentId: t.id, tournamentName: t.name,
        tournamentType: ttype, numTeams,
        groupName: null, matchdayNum: null,
        datetime: schedule[schedKey] || null,
        label: getRoundName(t.eliminationRounds.length, ri),
        phase: getRoundName(t.eliminationRounds.length, ri),
        type: "elim", ri, schedKey,
        matches: (round.matches || []).map((m, mi) => ({ ...m, _mi: mi })),
        isElim: true,
      });
    });

    // ── Swiss cups ──
    t.swissCups?.forEach((cup, ci) => {
      cup.rounds?.forEach((round, ri) => {
        const schedKey = `cup_${ci}_r_${ri}`;
        result.push({
          key: `t_${t.id}_${schedKey}`,
          tournamentId: t.id, tournamentName: t.name,
          tournamentType: ttype, numTeams,
          groupName: null, matchdayNum: null,
          datetime: schedule[schedKey] || null,
          label: `Copa ${cup.name} · ${getRoundName(cup.rounds.length, ri)}`,
          phase: `Copa ${cup.name}`,
          type: "swissCup", ci, ri, schedKey, cupName: cup.name,
          matches: (round.matches || []).map((m, mi) => ({ ...m, _mi: mi })),
          isElim: true,
        });
      });
    });

    // ── Division groups ──
    t.divisions?.forEach((div, di) => {
      div.groups?.forEach((g, gi) => {
        const byDay = {};
        (g.matches || []).forEach((m, mi) => { const day = m.matchday || 1; if (!byDay[day]) byDay[day] = []; byDay[day].push({ ...m, _mi: mi }); });
        Object.entries(byDay).sort((a, b) => +a[0] - +b[0]).forEach(([day, matches]) => {
          const schedKey = `div_${di}_g_${gi}_d_${day}`;
          result.push({
            key: `t_${t.id}_${schedKey}`,
            tournamentId: t.id, tournamentName: t.name,
            tournamentType: ttype, numTeams: div.teams?.length || 8,
            groupName: g.name,
            matchdayNum: +day,
            datetime: schedule[schedKey] || null,
            label: div.groups.length > 1
              ? `${div.name} · Jornada ${day} · Grupo ${g.name}`
              : `${div.name} · Jornada ${day}`,
            phase: div.name,
            type: "division", di, gi, schedKey, divName: div.name,
            matches, isElim: false,
          });
        });
      });
    });
  });
  return result;
}

// ── Current season ─────────────────────────────────────────────────
function currentSeason() {
  const now = new Date(); const year = now.getFullYear(); const month = now.getMonth() + 1;
  return month >= 8 ? `${year}-${String(year + 1).slice(2)}` : `${year - 1}-${String(year).slice(2)}`;
}

// ── Update player stats ────────────────────────────────────────────
async function updatePlayerStats(inscriptions, teamName, eaPlayerStats) {
  if (!eaPlayerStats?.length) return;
  const insc = inscriptions.find(i => i.teamName === teamName);
  if (!insc?.teamId) return;
  try {
    const q = query(collection(db, "players"), where("teamId", "==", insc.teamId));
    const snap = await getDocs(q);
    const season = currentSeason();
    for (const playerDoc of snap.docs) {
      const player = { id: playerDoc.id, ...playerDoc.data() };
      const eaStat = eaPlayerStats.find(s => s.proName.toLowerCase() === (player.proName || "").toLowerCase());
      if (!eaStat) continue;
      const current = player.stats || { global: { pj: 0, goles: 0, asistencias: 0, mvp: 0, media: 0, mediaCount: 0 }, byTeam: {}, bySeason: {} };
      const g = current.global || { pj: 0, goles: 0, asistencias: 0, mvp: 0, media: 0, mediaCount: 0 };
      g.pj += 1; g.goles += eaStat.goals; g.asistencias += eaStat.assists; g.mvp += eaStat.mom ? 1 : 0; g.media += parseFloat(eaStat.ratingAve) || 0; g.mediaCount = (g.mediaCount || 0) + 1;
      const bt = current.byTeam || {};
      if (!bt[insc.teamId]) bt[insc.teamId] = { pj: 0, goles: 0, asistencias: 0, mvp: 0, media: 0, mediaCount: 0, teamName };
      const t = bt[insc.teamId]; t.pj += 1; t.goles += eaStat.goals; t.asistencias += eaStat.assists; t.mvp += eaStat.mom ? 1 : 0; t.media += parseFloat(eaStat.ratingAve) || 0; t.mediaCount = (t.mediaCount || 0) + 1;
      const bs = current.bySeason || {};
      if (!bs[season]) bs[season] = { pj: 0, goles: 0, asistencias: 0, mvp: 0, media: 0, mediaCount: 0 };
      const s = bs[season]; s.pj += 1; s.goles += eaStat.goals; s.asistencias += eaStat.assists; s.mvp += eaStat.mom ? 1 : 0; s.media += parseFloat(eaStat.ratingAve) || 0; s.mediaCount = (s.mediaCount || 0) + 1;
      await updateDoc(doc(db, "players", player.id), { stats: { global: g, byTeam: bt, bySeason: bs } });
    }
  } catch (e) { console.error("Player stats update failed:", e); }
}

async function fetchEAMatchStats(teamId, matchId) {
  if (!teamId || !matchId) return null;
  try {
    const teamSnap = await getDoc(doc(db, "teams", teamId));
    if (!teamSnap.exists()) return null;
    const { eaClubId, eaPlatform } = teamSnap.data();
    if (!eaClubId || !eaPlatform) return null;
    const res = await fetch(`/api/proclubs?action=matchStats&clubId=${eaClubId}&platform=${eaPlatform}&matchId=${matchId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function updateTeamElo(inscriptions, teamNameA, teamNameB, scoreA, scoreB, tournamentType, numTeams, isElim) {
  const inscA = inscriptions.find(i => i.teamName === teamNameA && i.teamId);
  const inscB = inscriptions.find(i => i.teamName === teamNameB && i.teamId);
  if (!inscA?.teamId || !inscB?.teamId) return null;
  try {
    const [snapA, snapB] = await Promise.all([getDoc(doc(db, "teams", inscA.teamId)), getDoc(doc(db, "teams", inscB.teamId))]);
    const teamA = snapA.exists() ? snapA.data() : {};
    const teamB = snapB.exists() ? snapB.data() : {};
    const eloA = teamA.elo ?? ELO_DEFAULT, eloB = teamB.elo ?? ELO_DEFAULT;
    const statsA = teamA.stats || { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, gd: 0, titulos: 0 };
    const statsB = teamB.stats || { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, gd: 0, titulos: 0 };
    const kBase = TOURNAMENT_TYPES[tournamentType]?.kBase ?? 16;
    const resultA = scoreA > scoreB ? 1 : scoreA === scoreB ? 0.5 : 0;
    const changeA = calcEloChange(eloA, eloB, resultA, kBase, numTeams, isElim, statsA.pj);
    const changeB = calcEloChange(eloB, eloA, 1 - resultA, kBase, numTeams, isElim, statsB.pj);
    await Promise.all([
      snapA.exists() && updateDoc(doc(db, "teams", inscA.teamId), { elo: Math.max(100, eloA + changeA), lastEloChange: changeA, stats: { ...statsA, pj: statsA.pj + 1, pg: statsA.pg + (resultA === 1 ? 1 : 0), pe: statsA.pe + (resultA === 0.5 ? 1 : 0), pp: statsA.pp + (resultA === 0 ? 1 : 0), gf: statsA.gf + scoreA, gc: statsA.gc + scoreB, gd: statsA.gd + scoreA - scoreB } }),
      snapB.exists() && updateDoc(doc(db, "teams", inscB.teamId), { elo: Math.max(100, eloB + changeB), lastEloChange: changeB, stats: { ...statsB, pj: statsB.pj + 1, pg: statsB.pg + (resultA === 0 ? 1 : 0), pe: statsB.pe + (resultA === 0.5 ? 1 : 0), pp: statsB.pp + (resultA === 1 ? 1 : 0), gf: statsB.gf + scoreB, gc: statsB.gc + scoreA, gd: statsB.gd + scoreB - scoreA } }),
    ]);
    return { teamAId: inscA.teamId, teamBId: inscB.teamId };
  } catch (e) { console.error("ELO update failed:", e); return null; }
}

async function addTitle(inscriptions, teamName) {
  const insc = inscriptions.find(i => i.teamName === teamName && i.teamId);
  if (!insc?.teamId) return;
  try {
    const snap = await getDoc(doc(db, "teams", insc.teamId));
    if (snap.exists()) { const stats = snap.data().stats || { titulos: 0 }; await updateDoc(doc(db, "teams", insc.teamId), { stats: { ...stats, titulos: (stats.titulos || 0) + 1 } }); }
  } catch (e) { console.error("Title update failed:", e); }
}

// ── Save match update — handles all formats ───────────────────────
async function saveMatchUpdate(tournaments, inscriptions, day, matchWithMi, updates, eaMatchId = null) {
  const t = tournaments.find(t => t.id === day.tournamentId);
  if (!t) return;
  const isValidated = updates.matchStatus === "validado";

  if (day.type === "group") {
    const newGroups = t.groups.map((g, gi) => {
      if (gi !== day.gi) return g;
      const newMatches = g.matches.map((m, mi) => mi !== matchWithMi._mi ? m : { ...m, ...updates });
      let standings = g.standings;
      if (isValidated) {
        standings = g.teams.map(t => ({ name: t, pts: 0, gf: 0, gc: 0, pj: 0, gd: 0 }));
        newMatches.forEach(m => { if (m.played) standings = applyGroupResult(standings, m.teamA, m.teamB, m.scoreA, m.scoreB); });
      }
      return { ...g, matches: newMatches, standings };
    });
    await updateDoc(doc(db, "tournaments", t.id), { groups: newGroups });

  } else if (day.type === "elim") {
    const newRounds = t.eliminationRounds.map((r, ri) => ri !== day.ri ? r : { ...r, matches: r.matches.map((m, mi) => mi !== matchWithMi._mi ? m : { ...m, ...updates }) });
    const round = newRounds[day.ri];
    const allDone = round.matches.every(m => m.matchStatus === "validado");
    let finalRounds = newRounds, winner = null;
    if (allDone) {
      const winners = round.matches.map(m => m.winner).filter(w => w && w !== "BYE");
      if (winners.length === 1) { winner = winners[0]; await addTitle(inscriptions, winner); }
      else if (winners.length > 1) finalRounds = [...newRounds, { round: newRounds.length + 1, matches: buildEliminationRound(winners) }];
    }
    await updateDoc(doc(db, "tournaments", t.id), { eliminationRounds: finalRounds, ...(winner ? { winner, status: "Finalizado", finishedAt: new Date().toISOString() } : {}) });

  } else if (day.type === "swissCup") {
    const newCups = t.swissCups.map((cup, ci) => {
      if (ci !== day.ci) return cup;
      const newRounds = cup.rounds.map((r, ri) => ri !== day.ri ? r : { ...r, matches: r.matches.map((m, mi) => mi !== matchWithMi._mi ? m : { ...m, ...updates }) });
      const round = newRounds[day.ri];
      const allDone = round.matches.every(m => m.matchStatus === "validado");
      let finalRounds = newRounds, cupWinner = null;
      if (allDone) {
        const winners = round.matches.map(m => m.winner).filter(w => w && w !== "BYE");
        if (winners.length === 1) { cupWinner = winners[0]; }
        else if (winners.length > 1) finalRounds = [...newRounds, { round: newRounds.length + 1, matches: buildEliminationRound(winners) }];
      }
      return { ...cup, rounds: finalRounds, ...(cupWinner ? { winner: cupWinner } : {}) };
    });
    // Check if all cups finished
    const allCupsDone = newCups.every(c => c.winner);
    const goldWinner = newCups[0]?.winner;
    await updateDoc(doc(db, "tournaments", t.id), { swissCups: newCups, ...(allCupsDone && goldWinner ? { winner: goldWinner, status: "Finalizado", finishedAt: new Date().toISOString() } : {}) });

  } else if (day.type === "division") {
    const newDivisions = t.divisions.map((div, di) => {
      if (di !== day.di) return div;
      const newGroups = div.groups.map((g, gi) => {
        if (gi !== day.gi) return g;
        const newMatches = g.matches.map((m, mi) => mi !== matchWithMi._mi ? m : { ...m, ...updates });
        let standings = g.standings;
        if (isValidated) {
          standings = g.teams.map(t => ({ name: t, pts: 0, gf: 0, gc: 0, pj: 0, gd: 0 }));
          newMatches.forEach(m => { if (m.played) standings = applyGroupResult(standings, m.teamA, m.teamB, m.scoreA, m.scoreB); });
        }
        return { ...g, matches: newMatches, standings };
      });
      return { ...div, groups: newGroups };
    });
    await updateDoc(doc(db, "tournaments", t.id), { divisions: newDivisions });
  }

  if (isValidated && updates.scoreA != null) {
    const teamIds = await updateTeamElo(inscriptions, matchWithMi.teamA, matchWithMi.teamB, updates.scoreA, updates.scoreB, day.tournamentType, day.numTeams, day.isElim);
    if (eaMatchId && teamIds) {
      const [statsA, statsB] = await Promise.all([fetchEAMatchStats(teamIds.teamAId, eaMatchId), fetchEAMatchStats(teamIds.teamBId, eaMatchId)]);
      if (statsA) await updatePlayerStats(inscriptions, matchWithMi.teamA, statsA);
      if (statsB) await updatePlayerStats(inscriptions, matchWithMi.teamB, statsB);
    }
  }
}

// ── RivalContact popup ────────────────────────────────────────────
function RivalContact({ name, inscriptions, logoMap, onClose }) {
  const insc = inscriptions.find(i => i.teamName === name);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ ...S.card, maxWidth: 320, width: "100%", padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <TeamLogo name={name} logoUrl={logoMap[name]} size={52} />
          <div><h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>{name}</h3>{insc?.userName && <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>{insc.userName}</p>}</div>
        </div>
        {insc?.phone && <a href={`https://wa.me/${insc.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.25)", borderRadius: 10, marginBottom: 10, textDecoration: "none", color: C.text }}><span style={{ fontSize: 22 }}>💬</span><div><p style={{ margin: "0 0 1px", fontSize: 13, fontWeight: 600, color: "#25d366" }}>WhatsApp</p><p style={{ margin: 0, fontSize: 12, color: C.muted }}>{insc.phone}</p></div><span style={{ marginLeft: "auto" }}>→</span></a>}
        {insc?.twitter && <a href={`https://x.com/${insc.twitter.replace("@", "")}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, marginBottom: 10, textDecoration: "none", color: C.text }}><span style={{ fontSize: 20 }}>𝕏</span><div><p style={{ margin: "0 0 1px", fontSize: 13 }}>X / Twitter</p><p style={{ margin: 0, fontSize: 12, color: C.muted }}>{insc.twitter}</p></div><span style={{ marginLeft: "auto" }}>→</span></a>}
        {insc?.managerId && <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, marginBottom: 10 }}><p style={{ margin: "0 0 1px", fontSize: 11, color: C.muted }}>ID MANAGER</p><p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{insc.managerId}</p></div>}
        {!insc?.phone && !insc?.twitter && <p style={{ color: C.faint, fontSize: 13, textAlign: "center" }}>Sin datos de contacto.</p>}
        <button style={{ ...S.btnSm, width: "100%", marginTop: 8 }} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

// ── EA Match Picker ───────────────────────────────────────────────
function EAMatchPicker({ myTeamInsc, onSelect }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  async function loadMatches() {
    if (!myTeamInsc?.teamId) return;
    setLoading(true); setError(null);
    try {
      const teamSnap = await getDoc(doc(db, "teams", myTeamInsc.teamId));
      if (!teamSnap.exists()) { setError("Equipo no encontrado"); setLoading(false); return; }
      const { eaClubId, eaPlatform } = teamSnap.data();
      if (!eaClubId || !eaPlatform) { setError("Vincula tu club de EA FC en 'Mi equipo' primero."); setLoading(false); return; }
      const res = await fetch(`/api/proclubs?action=matches&clubId=${eaClubId}&platform=${eaPlatform}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMatches(data); setLoaded(true);
      if (!data.length) setError("No se encontraron amistosos recientes.");
    } catch { setError("No se pudo conectar con EA FC."); }
    setLoading(false);
  }

  function timeAgo(ts) {
    if (!ts) return "";
    const diff = Date.now() - ts * 1000;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `Hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    return hrs < 24 ? `Hace ${hrs}h` : `Hace ${Math.floor(hrs / 24)}d`;
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ ...S.label, margin: 0 }}>Detectar desde EA FC 26</p>
        <button style={{ ...S.btnInline(C.blue), padding: "8px 14px", fontSize: 10, opacity: loading ? 0.6 : 1 }} onClick={() => { setLoaded(false); setMatches([]); loadMatches(); }} disabled={loading}>{loading ? "Cargando..." : loaded ? "🔄 Actualizar" : "🎮 Cargar partidos"}</button>
      </div>
      {error && <div style={{ padding: "10px 12px", background: "rgba(247,111,111,0.08)", border: "1px solid rgba(247,111,111,0.2)", borderRadius: 8, marginBottom: 8 }}><p style={{ margin: 0, fontSize: 12, color: C.red }}>{error}</p></div>}
      {loaded && matches.length > 0 && (
        <div>
          <p style={{ margin: "0 0 8px", fontSize: 11, color: C.muted }}>Selecciona el partido jugado:</p>
          {matches.map((m, i) => (
            <button key={i} onClick={() => onSelect(m.scoreA, m.scoreB, m.matchId)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "rgba(79,142,247,0.07)", border: "1px solid rgba(79,142,247,0.2)", borderRadius: 10, cursor: "pointer", fontFamily: "'Georgia',serif", textAlign: "left", marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600 }}>{m.myName} <span style={{ color: C.gold, fontWeight: 700 }}>{m.scoreA}–{m.scoreB}</span> {m.oppName}</p>
                {m.timestamp && <p style={{ margin: 0, fontSize: 11, color: C.muted }}>{timeAgo(m.timestamp)}</p>}
              </div>
              <span style={{ color: C.blue, fontSize: 11 }}>Usar →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const statusLabel = { pendiente: "Sin jugar", parcial: "Esperando", conflicto: "Conflicto", validado: "Validado" };
const statusIcon  = { pendiente: "⏳", parcial: "🕐", conflicto: "⚠️", validado: "✓" };

export default function MatchesPanel({ tournaments, inscriptions, currentUser, isAdmin, logoMap, myTeamNames: myTeamNamesProp }) {
  const [filter, setFilter] = useState("todos");
  const [expandedDays, setExpandedDays] = useState({});
  const [reportMatch, setReportMatch] = useState(null);
  const [reportDay, setReportDay] = useState(null);
  const [rScoreA, setRScoreA] = useState(""); const [rScoreB, setRScoreB] = useState("");
  const [rMatchId, setRMatchId] = useState(null);
  const [adminEdit, setAdminEdit] = useState(null); const [adminEditDay, setAdminEditDay] = useState(null);
  const [aScoreA, setAScoreA] = useState(""); const [aScoreB, setAScoreB] = useState("");
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState(null);
  const [rivalPopup, setRivalPopup] = useState(null);

  function showNotif(msg, color = C.blue) { setNotif({ msg, color }); setTimeout(() => setNotif(null), 3500); }
  function toggleDay(key) { setExpandedDays(p => ({ ...p, [key]: !p[key] })); }

  const myTeamNames = myTeamNamesProp || new Set();
  const allDays = collectMatchdays(tournaments);

  const filteredDays = allDays.map(day => {
    let matches = day.matches;
    if (filter === "mis") matches = matches.filter(m => myTeamNames.has(m.teamA) || myTeamNames.has(m.teamB));
    if (filter === "pendiente") matches = matches.filter(m => (m.matchStatus || "pendiente") !== "validado");
    if (filter === "conflicto") matches = matches.filter(m => m.matchStatus === "conflicto");
    if (filter === "validado") matches = matches.filter(m => m.matchStatus === "validado");
    return { ...day, matches };
  }).filter(day => day.matches.length > 0);

  async function submitReport(day, match) {
    const sA = parseInt(rScoreA), sB = parseInt(rScoreB);
    if (isNaN(sA) || isNaN(sB)) return showNotif("Introduce ambos marcadores", C.red);
    setSaving(true);
    const side = myTeamNames.has(match.teamA) ? "A" : "B";
    const report = { scoreA: sA, scoreB: sB, userId: currentUser.uid, userName: currentUser.displayName || currentUser.email, at: new Date().toISOString(), eaMatchId: rMatchId || null };
    const newStatus = computeMatchStatus(match, side, sA, sB);
    await saveMatchUpdate(tournaments, inscriptions, day, match, { ...(side === "A" ? { reportByA: report } : { reportByB: report }), matchStatus: newStatus, ...(newStatus === "validado" ? { scoreA: sA, scoreB: sB, played: true, winner: sA > sB ? match.teamA : sA < sB ? match.teamB : null } : {}) }, newStatus === "validado" ? rMatchId : null);
    setReportMatch(null); setReportDay(null); setRScoreA(""); setRScoreB(""); setRMatchId(null);
    if (newStatus === "validado") showNotif("¡Validado! ELO y stats actualizados ✓", C.green);
    else if (newStatus === "parcial") showNotif("Resultado enviado ✓ Esperando al rival", C.orange);
    else showNotif("⚠️ Resultados en conflicto. Un admin resolverá.", C.red);
    setSaving(false);
  }

  async function adminValidate(day, match, forceSA, forceSB, eaMatchId = null) {
    const sA = parseInt(forceSA ?? aScoreA), sB = parseInt(forceSB ?? aScoreB);
    if (isNaN(sA) || isNaN(sB)) return showNotif("Introduce ambos marcadores", C.red);
    setSaving(true);
    const report = { scoreA: sA, scoreB: sB, userId: currentUser.uid, userName: "Admin", at: new Date().toISOString() };
    await saveMatchUpdate(tournaments, inscriptions, day, match, { reportByA: report, reportByB: report, matchStatus: "validado", scoreA: sA, scoreB: sB, played: true, winner: sA > sB ? match.teamA : sA < sB ? match.teamB : null }, eaMatchId);
    setAdminEdit(null); setAdminEditDay(null); setAScoreA(""); setAScoreB("");
    showNotif("Validado ✓ ELO y stats actualizados", C.green);
    setSaving(false);
  }

  function getMyInscForMatch(match) {
    const myTeamName = [...myTeamNames].find(n => n === match.teamA || n === match.teamB);
    if (!myTeamName) return null;
    return inscriptions.find(i => i.teamName === myTeamName && i.userId === currentUser?.uid);
  }

  const canReport = !isAdmin && myTeamNames.size > 0;
  const FILTERS = [{ id: "todos", label: "Todos" }, ...(canReport ? [{ id: "mis", label: "Mis partidos" }] : []), { id: "pendiente", label: "Pendientes" }, ...(isAdmin ? [{ id: "conflicto", label: "Conflictos" }] : []), { id: "validado", label: "Validados" }];

  // Phase label colors
  function phaseColor(day) {
    if (day.cupName) return CUP_COLORS[day.cupName] || C.muted;
    if (day.type === "division") return C.purple;
    if (day.isElim) return C.gold;
    return C.blue;
  }

  return (
    <div>
      {notif && <div style={{ position: "fixed", top: 16, left: 16, right: 16, background: notif.color, color: [C.green, C.gold, C.orange].includes(notif.color) ? "#07090f" : "#fff", padding: "13px 16px", zIndex: 9999, fontSize: 13, fontFamily: "'Georgia',serif", borderRadius: 10, textAlign: "center", fontWeight: 600 }}>{notif.msg}</div>}
      {rivalPopup && <RivalContact name={rivalPopup} inscriptions={inscriptions} logoMap={logoMap} onClose={() => setRivalPopup(null)} />}

      {/* Report modal */}
      {reportMatch && reportDay && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 400, overflowY: "auto" }}>
          <div style={{ maxWidth: 420, margin: "0 auto", padding: "24px 16px 40px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div><h3 style={{ margin: "0 0 3px", fontSize: 17, fontWeight: 700 }}>Reportar resultado</h3><p style={{ margin: 0, color: C.muted, fontSize: 12 }}>{reportDay.tournamentName} · {reportDay.label}</p></div>
              <button style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22 }} onClick={() => { setReportMatch(null); setReportDay(null); setRMatchId(null); }}>✕</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, textAlign: "center" }}><TeamLogo name={reportMatch.teamA} logoUrl={logoMap[reportMatch.teamA]} size={40} /><p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 600 }}>{reportMatch.teamA}</p></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" min={0} max={99} placeholder="0" value={rScoreA} onChange={e => setRScoreA(e.target.value)} style={{ ...S.numInput, width: 58, padding: 12, fontSize: 22 }} />
                <span style={{ color: C.faint, fontSize: 20 }}>–</span>
                <input type="number" min={0} max={99} placeholder="0" value={rScoreB} onChange={e => setRScoreB(e.target.value)} style={{ ...S.numInput, width: 58, padding: 12, fontSize: 22 }} />
              </div>
              <div style={{ flex: 1, textAlign: "center" }}><TeamLogo name={reportMatch.teamB} logoUrl={logoMap[reportMatch.teamB]} size={40} /><p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 600 }}>{reportMatch.teamB}</p></div>
            </div>
            {rMatchId && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(82,214,138,0.08)", border: "1px solid rgba(82,214,138,0.2)", borderRadius: 8, marginBottom: 12 }}>
                <span>🎮</span><p style={{ margin: 0, fontSize: 12, color: C.green }}>Partido EA detectado · Stats incluidas</p>
                <button style={{ marginLeft: "auto", background: "none", border: "none", color: C.faint, cursor: "pointer" }} onClick={() => { setRMatchId(null); setRScoreA(""); setRScoreB(""); }}>✕</button>
              </div>
            )}
            {canReport && !rMatchId && (() => { const myInsc = getMyInscForMatch(reportMatch); return <EAMatchPicker myTeamInsc={myInsc} onSelect={(sA, sB, matchId) => { const amA = myTeamNames.has(reportMatch.teamA); setRScoreA(String(amA ? sA : sB)); setRScoreB(String(amA ? sB : sA)); setRMatchId(matchId || null); }} />; })()}
            {(reportMatch.reportByA || reportMatch.reportByB) && (
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
                <p style={{ ...S.label, marginBottom: 6 }}>Reportes existentes</p>
                {reportMatch.reportByA && <p style={{ margin: "0 0 3px", fontSize: 12, color: C.muted }}><strong style={{ color: C.text }}>{reportMatch.teamA}</strong>: {reportMatch.reportByA.scoreA}–{reportMatch.reportByA.scoreB}</p>}
                {reportMatch.reportByB && <p style={{ margin: 0, fontSize: 12, color: C.muted }}><strong style={{ color: C.text }}>{reportMatch.teamB}</strong>: {reportMatch.reportByB.scoreA}–{reportMatch.reportByB.scoreB}</p>}
              </div>
            )}
            <button style={{ ...S.btn(), opacity: saving ? 0.6 : 1 }} onClick={() => submitReport(reportDay, reportMatch)} disabled={saving}>{saving ? "Enviando..." : "Enviar resultado →"}</button>
          </div>
        </div>
      )}

      {/* Admin validate modal */}
      {adminEdit && adminEditDay && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ ...S.card, maxWidth: 380, width: "100%", padding: 24 }}>
            <h3 style={{ margin: "0 0 4px" }}>Validar resultado</h3>
            <p style={{ margin: "0 0 16px", color: C.muted, fontSize: 13 }}>{adminEditDay.tournamentName} · {adminEditDay.label}</p>
            {(adminEdit.reportByA || adminEdit.reportByB) && (
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
                <p style={{ ...S.label, marginBottom: 8 }}>Reportes recibidos</p>
                {adminEdit.reportByA && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><p style={{ margin: 0, fontSize: 12, color: C.muted }}><strong style={{ color: C.text }}>{adminEdit.teamA}</strong>: {adminEdit.reportByA.scoreA}–{adminEdit.reportByA.scoreB}</p><button style={{ ...S.btnInline(C.green), padding: "6px 12px", fontSize: 10 }} onClick={() => adminValidate(adminEditDay, adminEdit, adminEdit.reportByA.scoreA, adminEdit.reportByA.scoreB, adminEdit.reportByA.eaMatchId)}>✓</button></div>}
                {adminEdit.reportByB && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><p style={{ margin: 0, fontSize: 12, color: C.muted }}><strong style={{ color: C.text }}>{adminEdit.teamB}</strong>: {adminEdit.reportByB.scoreA}–{adminEdit.reportByB.scoreB}</p><button style={{ ...S.btnInline(C.green), padding: "6px 12px", fontSize: 10 }} onClick={() => adminValidate(adminEditDay, adminEdit, adminEdit.reportByB.scoreA, adminEdit.reportByB.scoreB, adminEdit.reportByB.eaMatchId)}>✓</button></div>}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}><p style={{ margin: "0 0 6px", fontSize: 11, color: C.muted }}>{adminEdit.teamA}</p><input type="number" min={0} max={99} placeholder="0" value={aScoreA} onChange={e => setAScoreA(e.target.value)} style={{ ...S.numInput, width: 58, padding: 12, fontSize: 22 }} /></div>
              <span style={{ color: C.faint, fontSize: 22, marginTop: 20 }}>–</span>
              <div style={{ textAlign: "center" }}><p style={{ margin: "0 0 6px", fontSize: 11, color: C.muted }}>{adminEdit.teamB}</p><input type="number" min={0} max={99} placeholder="0" value={aScoreB} onChange={e => setAScoreB(e.target.value)} style={{ ...S.numInput, width: 58, padding: 12, fontSize: 22 }} /></div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...S.btn(C.blue), flex: 1, opacity: saving ? 0.6 : 1 }} onClick={() => adminValidate(adminEditDay, adminEdit)} disabled={saving}>{saving ? "..." : "Guardar y validar →"}</button>
              <button style={S.btnSm} onClick={() => { setAdminEdit(null); setAdminEditDay(null); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {FILTERS.map(f => <button key={f.id} onClick={() => setFilter(f.id)} style={{ ...S.btnSm, flexShrink: 0, borderColor: filter === f.id ? C.blue : undefined, color: filter === f.id ? C.blue : undefined, background: filter === f.id ? "rgba(79,142,247,0.08)" : undefined }}>{f.label}</button>)}
      </div>

      {filteredDays.length === 0
        ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: C.faint }}>No hay partidos en esta categoría.</div>
        : filteredDays.map(day => {
          const isOpen = expandedDays[day.key] !== false;
          const validatedCount = day.matches.filter(m => m.matchStatus === "validado").length;
          const conflictCount  = day.matches.filter(m => m.matchStatus === "conflicto").length;
          const hasMyMatch = day.matches.some(m => myTeamNames.has(m.teamA) || myTeamNames.has(m.teamB));
          const pc = phaseColor(day);

          return (
            <div key={day.key} style={{ marginBottom: 10 }}>
              <div onClick={() => toggleDay(day.key)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: isOpen ? "12px 12px 0 0" : 12, cursor: "pointer" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{day.label}</span>
                    <span style={{ fontSize: 10, color: pc, letterSpacing: 1, textTransform: "uppercase" }}>{day.tournamentName}</span>
                    {hasMyMatch && <span style={{ ...S.tag(C.gold), fontSize: 8 }}>Tu partido</span>}
                    {conflictCount > 0 && <span style={{ ...S.tag(C.red), fontSize: 8 }}>⚠️ {conflictCount}</span>}
                  </div>
                  {day.datetime ? <p style={{ margin: "3px 0 0", fontSize: 11, color: C.blue }}>🕐 {formatDatetime(day.datetime)}</p> : <p style={{ margin: "3px 0 0", fontSize: 11, color: C.faint }}>Sin fecha</p>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: C.muted }}>{validatedCount}/{day.matches.length} ✓</span>
                  <span style={{ color: C.faint, fontSize: 14 }}>{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>

              {isOpen && (
                <div style={{ border: "1px solid rgba(255,255,255,0.07)", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
                  {day.matches.map((m, idx) => {
                    const st = m.matchStatus || "pendiente";
                    const stColor = matchStatusColor[st] || C.muted;
                    const canUserReport = canReport && (myTeamNames.has(m.teamA) || myTeamNames.has(m.teamB)) && st !== "validado";
                    const alreadyReported = (myTeamNames.has(m.teamA) && m.reportByA?.userId === currentUser?.uid) || (myTeamNames.has(m.teamB) && m.reportByB?.userId === currentUser?.uid);
                    const isMyMatch = myTeamNames.has(m.teamA) || myTeamNames.has(m.teamB);
                    const rivalName = isMyMatch ? (myTeamNames.has(m.teamA) ? m.teamB : m.teamA) : null;

                    return (
                      <div key={idx} style={{ padding: "14px", borderBottom: idx < day.matches.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", background: isMyMatch ? "rgba(232,184,75,0.03)" : "transparent" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 9, color: C.faint }}>{m.leg === 2 ? "Vuelta" : ""}</span>
                          <span style={S.tag(stColor)}>{statusIcon[st]} {statusLabel[st]}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0, cursor: (rivalName === m.teamA || isAdmin) ? "pointer" : "default" }} onClick={() => { if (rivalName === m.teamA || isAdmin) setRivalPopup(m.teamA); }}>
                            <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={32} />
                            <span style={{ fontSize: 14, fontWeight: myTeamNames.has(m.teamA) ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
                            {(rivalName === m.teamA || isAdmin) && <span style={{ fontSize: 10, color: C.faint }}>ℹ</span>}
                          </div>
                          <div style={{ flexShrink: 0, minWidth: 56, textAlign: "center" }}>
                            {st === "validado" ? <span style={{ fontWeight: 700, fontSize: 20, color: pc, letterSpacing: 2 }}>{m.scoreA}–{m.scoreB}</span> : <span style={{ fontSize: 13, color: C.faint }}>vs</span>}
                          </div>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", minWidth: 0, cursor: (rivalName === m.teamB || isAdmin) ? "pointer" : "default" }} onClick={() => { if (rivalName === m.teamB || isAdmin) setRivalPopup(m.teamB); }}>
                            {(rivalName === m.teamB || isAdmin) && <span style={{ fontSize: 10, color: C.faint }}>ℹ</span>}
                            <span style={{ fontSize: 14, fontWeight: myTeamNames.has(m.teamB) ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
                            <TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={32} />
                          </div>
                        </div>

                        {st === "parcial" && (
                          <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(247,147,79,0.08)", borderRadius: 8, border: "1px solid rgba(247,147,79,0.2)" }}>
                            {m.reportByA && <p style={{ margin: "0 0 2px", fontSize: 11, color: C.muted }}>{m.teamA}: <strong style={{ color: C.text }}>{m.reportByA.scoreA}–{m.reportByA.scoreB}</strong></p>}
                            {m.reportByB && <p style={{ margin: 0, fontSize: 11, color: C.muted }}>{m.teamB}: <strong style={{ color: C.text }}>{m.reportByB.scoreA}–{m.reportByB.scoreB}</strong></p>}
                            {!m.reportByA && <p style={{ margin: 0, fontSize: 11, color: C.faint }}>Falta reporte de {m.teamA}</p>}
                            {!m.reportByB && <p style={{ margin: 0, fontSize: 11, color: C.faint }}>Falta reporte de {m.teamB}</p>}
                          </div>
                        )}
                        {st === "conflicto" && (
                          <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(247,111,111,0.07)", borderRadius: 8, border: "1px solid rgba(247,111,111,0.2)" }}>
                            {m.reportByA && <p style={{ margin: "0 0 2px", fontSize: 11, color: C.muted }}>{m.teamA}: <strong style={{ color: C.text }}>{m.reportByA.scoreA}–{m.reportByA.scoreB}</strong></p>}
                            {m.reportByB && <p style={{ margin: 0, fontSize: 11, color: C.muted }}>{m.teamB}: <strong style={{ color: C.text }}>{m.reportByB.scoreA}–{m.reportByB.scoreB}</strong></p>}
                            <p style={{ margin: "5px 0 0", fontSize: 10, color: C.red }}>Un admin debe resolver este conflicto</p>
                          </div>
                        )}

                        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                          {canUserReport && <button style={{ ...S.btnInline(alreadyReported ? C.orange : C.blue), flex: 1 }} onClick={() => { setReportMatch(m); setReportDay(day); setRScoreA(""); setRScoreB(""); setRMatchId(null); }}>{alreadyReported ? "Modificar" : "Reportar resultado"}</button>}
                          {isAdmin && st !== "validado" && <button style={{ ...S.btnInline(st === "conflicto" ? C.red : C.blue), flex: 1 }} onClick={() => { setAdminEdit(m); setAdminEditDay(day); setAScoreA(m.scoreA != null ? String(m.scoreA) : ""); setAScoreB(m.scoreB != null ? String(m.scoreB) : ""); }}>{st === "conflicto" ? "⚠️ Resolver" : st === "parcial" ? "Validar" : "Introducir resultado"}</button>}
                          {isAdmin && st === "validado" && <button style={S.btnSm} onClick={() => { setAdminEdit(m); setAdminEditDay(day); setAScoreA(String(m.scoreA)); setAScoreB(String(m.scoreB)); }}>Editar</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
