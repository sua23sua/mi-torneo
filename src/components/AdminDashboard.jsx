import { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, doc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot,
} from "firebase/firestore";
import { useAuth } from "../AuthContext";

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }

function buildGroups(teams, groupCount) {
  const shuffled = shuffle(teams);
  const groups = Array.from({ length: groupCount }, (_, i) => ({
    name: String.fromCharCode(65 + i),
    teams: [],
    matches: [],
    standings: [],
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

function buildEliminationRound(teams) {
  const shuffled = shuffle(teams);
  const matches = [];
  for (let i = 0; i < shuffled.length; i += 2)
    matches.push({ teamA: shuffled[i], teamB: shuffled[i + 1] || "BYE", scoreA: null, scoreB: null, winner: null });
  return matches;
}

function applyGroupResult(standings, teamA, teamB, scoreA, scoreB) {
  return standings.map((s) => {
    if (s.name !== teamA && s.name !== teamB) return s;
    const isA = s.name === teamA;
    const gf = isA ? scoreA : scoreB;
    const gc = isA ? scoreB : scoreA;
    const pts = gf > gc ? 3 : gf === gc ? 1 : 0;
    return { ...s, pj: s.pj + 1, gf: s.gf + gf, gc: s.gc + gc, gd: s.gd + gf - gc, pts: s.pts + pts };
  }).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}

const C = { blue: "#388bff", gold: "#d4a03c", green: "#4ade80", red: "#ff6b6b", bg: "#080c14", border: "rgba(255,255,255,0.07)", text: "#e8edf4", muted: "#6a7890", faint: "#4a5568" };
const statusColor = { Abierto: C.green, "En curso": C.blue, Finalizado: C.gold, Cerrado: "#94a3b8" };
const roundNames = ["Final", "Final", "Semifinal", "Cuartos", "Octavos", "Ronda 1"];

const S = {
  wrap: { minHeight: "100vh", background: C.bg, fontFamily: "'Georgia','Times New Roman',serif", color: C.text },
  header: { borderBottom: `1px solid rgba(56,139,255,0.15)`, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, background: "rgba(8,12,20,0.95)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 },
  main: { maxWidth: 1040, margin: "0 auto", padding: "36px 24px" },
  card: { border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)", padding: 24, marginBottom: 12 },
  label: { fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.muted, display: "block", marginBottom: 8 },
  input: { width: "100%", padding: "10px 14px", fontSize: 14, background: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.1)`, color: C.text, boxSizing: "border-box", fontFamily: "'Georgia',serif" },
  select: { width: "100%", padding: "10px 14px", fontSize: 14, background: "#0e1420", border: `1px solid rgba(255,255,255,0.1)`, color: C.text, fontFamily: "'Georgia',serif" },
  btn: (color = C.blue) => ({ padding: "10px 24px", background: color, border: "none", color: color === C.gold ? "#0a0a0f" : "#fff", cursor: "pointer", letterSpacing: 2, textTransform: "uppercase", fontSize: 11, fontWeight: 700, fontFamily: "'Georgia',serif" }),
  btnSm: { padding: "5px 12px", background: "transparent", border: `1px solid rgba(255,255,255,0.15)`, color: C.muted, cursor: "pointer", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontFamily: "'Georgia',serif" },
  btnDanger: { padding: "5px 12px", background: "transparent", border: `1px solid rgba(255,100,100,0.3)`, color: C.red, cursor: "pointer", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontFamily: "'Georgia',serif" },
  tag: (color) => ({ fontSize: 9, letterSpacing: 2, padding: "3px 8px", background: `${color}22`, color, border: `1px solid ${color}44`, textTransform: "uppercase" }),
  tab: (active, color = C.blue) => ({ padding: "10px 20px", background: "none", border: "none", borderBottom: active ? `2px solid ${color}` : "2px solid transparent", color: active ? color : C.muted, cursor: "pointer", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Georgia',serif", marginBottom: -1 }),
  th: { fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.muted, padding: "8px 12px", textAlign: "left", borderBottom: `1px solid ${C.border}` },
  td: { padding: "8px 12px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.04)" },
  numInput: { width: 46, padding: "5px 8px", textAlign: "center", background: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.1)`, color: C.text, fontFamily: "'Georgia',serif", fontSize: 13 },
};

export default function AdminDashboard({ onLogout }) {
  const { user, profile } = useAuth();
  const [mainTab, setMainTab] = useState("torneos");
  const [tournaments, setTournaments] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [view, setView] = useState("list");
  const [activeTId, setActiveTId] = useState(null);
  const [notif, setNotif] = useState(null);
  const [form, setForm] = useState({ name: "", format: "Liga", groupCount: 2, qualify: 2, description: "" });
  const [teamInput, setTeamInput] = useState("");
  const [teams, setTeams] = useState([]);
  const [scoreEdit, setScoreEdit] = useState({});

  function showNotif(msg) { setNotif(msg); setTimeout(() => setNotif(null), 2800); }

  useEffect(() => {
    return onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")),
      snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  useEffect(() => {
    return onSnapshot(query(collection(db, "inscriptions"), orderBy("createdAt", "desc")),
      snap => setInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  async function createTournament() {
    if (!form.name.trim() || teams.length < 2) return showNotif("Añade nombre y al menos 2 equipos");
    let groups = null, eliminationRounds = [];

    if (form.format === "Eliminatoria") {
      eliminationRounds = [{ round: 1, matches: buildEliminationRound(teams) }];
    } else if (form.format === "Liga") {
      groups = buildGroups(teams, 1);
    } else {
      groups = buildGroups(teams, parseInt(form.groupCount));
    }

    await addDoc(collection(db, "tournaments"), {
      name: form.name.trim(), description: form.description.trim(),
      sport: "FIFA Clubes Pro", format: form.format,
      groupCount: parseInt(form.groupCount), qualify: parseInt(form.qualify),
      teams, groups, eliminationRounds,
      status: "Abierto", winner: null,
      createdAt: new Date().toISOString(), createdBy: user.uid,
    });
    setForm({ name: "", format: "Liga", groupCount: 2, qualify: 2, description: "" });
    setTeams([]); setView("list");
    showNotif("Torneo creado ✓");
  }

  async function saveGroupResult(t, gi, mi) {
    const key = `g${gi}-m${mi}`;
    const a = parseInt(scoreEdit[key]?.a), b = parseInt(scoreEdit[key]?.b);
    if (isNaN(a) || isNaN(b)) return showNotif("Introduce ambos marcadores");
    const newGroups = t.groups.map((g, idx) => {
      if (idx !== gi) return g;
      const newMatches = g.matches.map((m, i) => i !== mi ? m : { ...m, scoreA: a, scoreB: b, played: true });
      let standings = g.teams.map(t => ({ name: t, pts: 0, gf: 0, gc: 0, pj: 0, gd: 0 }));
      newMatches.forEach(m => { if (m.played) standings = applyGroupResult(standings, m.teamA, m.teamB, m.scoreA, m.scoreB); });
      return { ...g, matches: newMatches, standings };
    });
    await updateDoc(doc(db, "tournaments", t.id), { groups: newGroups });
    setScoreEdit(p => { const n = { ...p }; delete n[key]; return n; });
    showNotif("Resultado guardado ✓");
  }

  async function saveElimResult(t, ri, mi) {
    const key = `e${ri}-m${mi}`;
    const a = parseInt(scoreEdit[key]?.a), b = parseInt(scoreEdit[key]?.b);
    if (isNaN(a) || isNaN(b) || a === b) return showNotif("Introduce marcadores (sin empate en eliminatoria)");
    const newRounds = t.eliminationRounds.map((r, idx) => {
      if (idx !== ri) return r;
      return { ...r, matches: r.matches.map((m, i) => i !== mi ? m : { ...m, scoreA: a, scoreB: b, winner: a > b ? m.teamA : m.teamB }) };
    });
    const currentMatches = newRounds[ri].matches;
    const allDone = currentMatches.every(m => m.winner);
    let finalRounds = newRounds, winner = null;
    if (allDone) {
      const winners = currentMatches.map(m => m.winner).filter(w => w !== "BYE");
      if (winners.length === 1) { winner = winners[0]; }
      else { finalRounds = [...newRounds, { round: newRounds.length + 1, matches: buildEliminationRound(winners) }]; showNotif("¡Nueva ronda generada!"); }
    }
    await updateDoc(doc(db, "tournaments", t.id), { eliminationRounds: finalRounds, ...(winner ? { winner, status: "Finalizado" } : {}) });
    setScoreEdit(p => { const n = { ...p }; delete n[key]; return n; });
    if (winner) showNotif(`🏆 ¡${winner} campeón del torneo!`);
    else if (!allDone) showNotif("Resultado guardado ✓");
  }

  async function generateElimFromGroups(t) {
    const qualify = t.qualify || 2;
    const qualifiers = [];
    t.groups.forEach(g => g.standings.slice(0, qualify).forEach(s => qualifiers.push(s.name)));
    if (qualifiers.length < 2) return showNotif("No hay suficientes clasificados");
    await updateDoc(doc(db, "tournaments", t.id), {
      eliminationRounds: [{ round: 1, matches: buildEliminationRound(qualifiers) }],
      status: "En curso",
    });
    showNotif(`Fase eliminatoria generada con ${qualifiers.length} equipos ✓`);
  }

  async function deleteTournament(id) {
    if (!window.confirm("¿Eliminar este torneo?")) return;
    await deleteDoc(doc(db, "tournaments", id));
    if (activeTId === id) { setActiveTId(null); setView("list"); }
    showNotif("Torneo eliminado");
  }

  async function handleInscription(id, status) {
    await updateDoc(doc(db, "inscriptions", id), { status });
    showNotif(status === "aprobada" ? "Aprobada ✓" : "Rechazada");
  }

  const activeTournament = tournaments.find(t => t.id === activeTId);
  const pendingCount = inscriptions.filter(i => i.status === "pendiente").length;

  function getRoundName(totalRounds, roundIdx) {
    if (totalRounds === 1) return "Final";
    const remaining = totalRounds - roundIdx;
    return ["Final", "Semifinal", "Cuartos de final", "Octavos de final", "Ronda 1"][Math.min(remaining - 1, 4)] || `Ronda ${roundIdx + 1}`;
  }

  return (
    <div style={S.wrap}>
      {notif && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: C.blue, color: "#fff", padding: "10px 28px", zIndex: 1000, letterSpacing: 1, fontSize: 12, fontFamily: "'Georgia',serif", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>{notif}</div>}
      <style>{`input:focus,select:focus{outline:none;border-color:#388bff!important;}input[type=number]::-webkit-inner-spin-button{opacity:1;}input::placeholder{color:rgba(200,212,228,0.2)!important;}table{border-collapse:collapse;width:100%;}`}</style>

      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff" }}>⚔</div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.blue }}>TournamentOS</span>
          <span style={S.tag(C.blue)}>Admin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: C.muted }}>{profile?.name || user?.email}</span>
          <button style={S.btnSm} onClick={onLogout}>Salir</button>
        </div>
      </header>

      <main style={S.main}>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 32 }}>
          {["torneos", "inscripciones"].map(t => (
            <button key={t} style={S.tab(mainTab === t)} onClick={() => { setMainTab(t); setView("list"); }}>
              {t === "torneos" ? "Torneos" : `Inscripciones${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
            </button>
          ))}
        </div>

        {mainTab === "torneos" && (
          <>
            {view === "list" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Torneos · FIFA Clubes Pro</h1>
                  <button style={S.btn()} onClick={() => setView("new")}>+ Nuevo torneo</button>
                </div>
                {tournaments.length === 0 ? (
                  <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: C.faint }}>No hay torneos aún.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 16 }}>
                    {tournaments.map(t => (
                      <div key={t.id} style={{ ...S.card, cursor: "pointer" }} onClick={() => { setActiveTId(t.id); setView("detail"); }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                          <span style={{ fontSize: 22 }}>🎮</span>
                          <span style={S.tag(statusColor[t.status] || "#94a3b8")}>{t.status}</span>
                        </div>
                        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>{t.name}</h3>
                        <p style={{ margin: "0 0 4px", color: C.muted, fontSize: 12 }}>{t.format} · {t.teams?.length || 0} equipos</p>
                        {t.winner && <p style={{ margin: "8px 0 0", color: C.gold, fontSize: 12 }}>🏆 {t.winner}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {view === "new" && (
              <div style={{ maxWidth: 560 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
                  <button style={S.btnSm} onClick={() => setView("list")}>← Volver</button>
                  <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Nuevo Torneo</h1>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div><label style={S.label}>Nombre</label><input style={S.input} placeholder="Copa de Campeones 2026" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                  <div><label style={S.label}>Descripción (opcional)</label><input style={S.input} placeholder="Breve descripción..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
                  <div>
                    <label style={S.label}>Formato</label>
                    <select style={S.select} value={form.format} onChange={e => setForm(p => ({ ...p, format: e.target.value }))}>
                      <option>Liga</option><option>Eliminatoria</option><option>Grupos + Eliminatoria</option>
                    </select>
                  </div>
                  {form.format === "Grupos + Eliminatoria" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div><label style={S.label}>Número de grupos</label><input style={S.input} type="number" min={2} max={8} value={form.groupCount} onChange={e => setForm(p => ({ ...p, groupCount: e.target.value }))} /></div>
                      <div><label style={S.label}>Equipos que pasan por grupo</label><input style={S.input} type="number" min={1} max={4} value={form.qualify} onChange={e => setForm(p => ({ ...p, qualify: e.target.value }))} /></div>
                    </div>
                  )}
                  <div>
                    <label style={S.label}>Equipos ({teams.length})</label>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <input style={{ ...S.input, flex: 1 }} placeholder="Nombre del equipo..." value={teamInput} onChange={e => setTeamInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && teamInput.trim()) { setTeams(p => [...p, teamInput.trim()]); setTeamInput(""); } }} />
                      <button style={{ ...S.btn(), padding: "10px 18px" }} onClick={() => { if (teamInput.trim()) { setTeams(p => [...p, teamInput.trim()]); setTeamInput(""); } }}>+</button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {teams.map(t => (
                        <span key={t} style={{ padding: "4px 10px", background: "rgba(56,139,255,0.1)", border: "1px solid rgba(56,139,255,0.3)", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                          {t} <span onClick={() => setTeams(p => p.filter(x => x !== t))} style={{ cursor: "pointer", color: C.red, fontSize: 10 }}>✕</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <button style={{ ...S.btn(), padding: 14 }} onClick={createTournament}>Crear Torneo →</button>
                </div>
              </div>
            )}

            {view === "detail" && activeTournament && (() => {
              const t = activeTournament;
              const hasGroups = t.groups?.length > 0;
              const hasElim = t.eliminationRounds?.length > 0;
              const groupsDone = hasGroups && t.groups.every(g => g.matches.every(m => m.played));
              const tInscriptions = inscriptions.filter(i => i.tournamentId === t.id && i.status === "pendiente");

              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                    <button style={S.btnSm} onClick={() => setView("list")}>← Volver</button>
                    <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{t.name}</h1>
                    <span style={S.tag(statusColor[t.status] || "#94a3b8")}>{t.status}</span>
                    {t.winner && <span style={{ color: C.gold }}>🏆 {t.winner}</span>}
                  </div>
                  <p style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>FIFA Clubes Pro · {t.format} · {t.teams?.length} equipos</p>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
                    {["Abierto", "En curso", "Finalizado", "Cerrado"].map(s => (
                      <button key={s} style={{ ...S.btnSm, borderColor: t.status === s ? (statusColor[s] || "#fff") : undefined, color: t.status === s ? (statusColor[s] || "#fff") : undefined }}
                        onClick={() => updateDoc(doc(db, "tournaments", t.id), { status: s })}>{s}</button>
                    ))}
                    <button style={S.btnDanger} onClick={() => deleteTournament(t.id)}>Eliminar torneo</button>
                  </div>

                  {tInscriptions.length > 0 && (
                    <div style={{ ...S.card, marginBottom: 24 }}>
                      <p style={S.label}>Solicitudes pendientes ({tInscriptions.length})</p>
                      {tInscriptions.map(i => (
                        <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <span style={{ fontSize: 13 }}>{i.userName} — <strong>{i.teamName}</strong></span>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button style={{ ...S.btnSm, borderColor: "rgba(74,222,128,0.4)", color: C.green }} onClick={() => handleInscription(i.id, "aprobada")}>Aprobar</button>
                            <button style={S.btnDanger} onClick={() => handleInscription(i.id, "rechazada")}>Rechazar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* GROUPS */}
                  {hasGroups && (
                    <div style={{ marginBottom: 32 }}>
                      <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.blue, marginBottom: 16 }}>
                        Fase de grupos {t.format === "Grupos + Eliminatoria" && `· ${t.qualify} clasificado${t.qualify > 1 ? "s" : ""} por grupo`}
                      </p>
                      {t.groups.map((g, gi) => (
                        <div key={gi} style={{ ...S.card, marginBottom: 20 }}>
                          <p style={{ ...S.label, color: C.gold, marginBottom: 14 }}>Grupo {g.name}</p>
                          <table style={{ marginBottom: 20 }}>
                            <thead><tr>{["#", "Equipo", "PJ", "PTS", "GF", "GC", "DG"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                            <tbody>
                              {g.standings.map((s, si) => (
                                <tr key={s.name} style={{ background: si < (t.qualify || 2) && t.format === "Grupos + Eliminatoria" ? "rgba(56,139,255,0.06)" : "transparent" }}>
                                  <td style={{ ...S.td, color: si < (t.qualify || 2) && t.format === "Grupos + Eliminatoria" ? C.blue : C.faint }}>{si + 1}</td>
                                  <td style={{ ...S.td, fontWeight: 600 }}>{s.name}</td>
                                  <td style={S.td}>{s.pj}</td>
                                  <td style={{ ...S.td, fontWeight: 700 }}>{s.pts}</td>
                                  <td style={S.td}>{s.gf}</td>
                                  <td style={S.td}>{s.gc}</td>
                                  <td style={{ ...S.td, color: s.gd >= 0 ? C.green : C.red }}>{s.gd > 0 ? "+" : ""}{s.gd}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p style={S.label}>Partidos</p>
                          {g.matches.map((m, mi) => {
                            const key = `g${gi}-m${mi}`;
                            return (
                              <div key={mi} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap" }}>
                                <span style={{ minWidth: 120, fontWeight: m.played && m.scoreA > m.scoreB ? 700 : 400 }}>{m.teamA}</span>
                                <span style={{ color: C.faint, fontSize: 11 }}>vs</span>
                                <span style={{ minWidth: 120, fontWeight: m.played && m.scoreB > m.scoreA ? 700 : 400 }}>{m.teamB}</span>
                                {m.played ? (
                                  <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 700, letterSpacing: 3, color: C.gold }}>{m.scoreA} — {m.scoreB}</span>
                                ) : (
                                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.a ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], a: e.target.value } }))} style={S.numInput} />
                                    <span style={{ color: C.faint }}>—</span>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.b ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], b: e.target.value } }))} style={S.numInput} />
                                    <button style={S.btnSm} onClick={() => saveGroupResult(t, gi, mi)}>OK</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      {t.format === "Grupos + Eliminatoria" && groupsDone && !hasElim && (
                        <button style={{ ...S.btn(C.gold), color: "#0a0a0f" }} onClick={() => generateElimFromGroups(t)}>
                          Generar fase eliminatoria →
                        </button>
                      )}
                    </div>
                  )}

                  {/* ELIMINATION */}
                  {hasElim && (
                    <div>
                      <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.blue, marginBottom: 16 }}>Fase eliminatoria</p>
                      {t.eliminationRounds.map((round, ri) => (
                        <div key={ri} style={{ marginBottom: 28 }}>
                          <p style={{ ...S.label, color: C.gold, marginBottom: 12 }}>{getRoundName(t.eliminationRounds.length, ri)}</p>
                          {round.matches.map((m, mi) => {
                            const key = `e${ri}-m${mi}`;
                            return (
                              <div key={mi} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", flexWrap: "wrap", marginBottom: 8 }}>
                                <span style={{ minWidth: 130, fontWeight: m.winner === m.teamA ? 700 : 400, color: m.winner === m.teamA ? C.blue : C.text }}>{m.teamA}</span>
                                <span style={{ color: C.faint, fontSize: 11 }}>vs</span>
                                <span style={{ minWidth: 130, fontWeight: m.winner === m.teamB ? 700 : 400, color: m.winner === m.teamB ? C.blue : C.text }}>{m.teamB}</span>
                                {m.winner ? (
                                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                                    <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3, color: C.blue }}>{m.scoreA} — {m.scoreB}</span>
                                    <span style={S.tag(C.green)}>✓ {m.winner}</span>
                                  </div>
                                ) : (
                                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.a ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], a: e.target.value } }))} style={S.numInput} />
                                    <span style={{ color: C.faint }}>—</span>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.b ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], b: e.target.value } }))} style={S.numInput} />
                                    <button style={S.btnSm} onClick={() => saveElimResult(t, ri, mi)}>OK</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {mainTab === "inscripciones" && (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 24px" }}>Todas las inscripciones</h1>
            {inscriptions.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: C.faint }}>No hay inscripciones.</div>
            ) : inscriptions.map(i => {
              const tournament = tournaments.find(t => t.id === i.tournamentId);
              return (
                <div key={i.id} style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{i.userName} — <span style={{ color: C.muted, fontWeight: 400 }}>{i.teamName}</span></p>
                    <p style={{ margin: 0, fontSize: 11, color: C.faint }}>{tournament?.name || "—"} · {new Date(i.createdAt).toLocaleDateString("es-ES")}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={S.tag(i.status === "aprobada" ? C.green : i.status === "rechazada" ? C.red : C.gold)}>{i.status}</span>
                    {i.status === "pendiente" && (
                      <>
                        <button style={{ ...S.btnSm, borderColor: "rgba(74,222,128,0.4)", color: C.green }} onClick={() => handleInscription(i.id, "aprobada")}>Aprobar</button>
                        <button style={S.btnDanger} onClick={() => handleInscription(i.id, "rechazada")}>Rechazar</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
