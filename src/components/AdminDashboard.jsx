import { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot, where
} from "firebase/firestore";
import { useAuth } from "../AuthContext";

function generateBracket(teams) {
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  const matches = [];
  for (let i = 0; i < shuffled.length - 1; i += 2) {
    matches.push({ teamA: shuffled[i], teamB: shuffled[i + 1] || "BYE", scoreA: null, scoreB: null, winner: null });
  }
  return matches;
}

const S = {
  wrap: { minHeight: "100vh", background: "#080c14", fontFamily: "'Georgia','Times New Roman',serif", color: "#e8edf4" },
  header: {
    borderBottom: "1px solid rgba(56,139,255,0.15)", padding: "0 32px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    height: 60, background: "rgba(8,12,20,0.9)", backdropFilter: "blur(12px)",
    position: "sticky", top: 0, zIndex: 100,
  },
  logo: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: { width: 30, height: 30, background: "#388bff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff" },
  logoText: { fontSize: 16, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#388bff" },
  badge: { fontSize: 9, letterSpacing: 2, padding: "3px 8px", background: "rgba(56,139,255,0.15)", color: "#388bff", border: "1px solid rgba(56,139,255,0.3)", textTransform: "uppercase" },
  main: { maxWidth: 1000, margin: "0 auto", padding: "36px 32px" },
  sectionTitle: { fontSize: 10, letterSpacing: 4, textTransform: "uppercase", color: "#388bff", marginBottom: 8 },
  h1: { fontSize: 28, fontWeight: 700, margin: "0 0 32px", lineHeight: 1.1 },
  card: { border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", padding: 24, marginBottom: 16 },
  label: { fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#6a7890", display: "block", marginBottom: 8 },
  input: { width: "100%", padding: "10px 14px", fontSize: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#e8edf4", boxSizing: "border-box", fontFamily: "'Georgia',serif" },
  select: { width: "100%", padding: "10px 14px", fontSize: 14, background: "#0e1420", border: "1px solid rgba(255,255,255,0.1)", color: "#e8edf4", fontFamily: "'Georgia',serif" },
  btn: { padding: "10px 24px", background: "#388bff", border: "none", color: "#fff", cursor: "pointer", letterSpacing: 2, textTransform: "uppercase", fontSize: 11, fontWeight: 700, fontFamily: "'Georgia',serif" },
  btnSm: { padding: "6px 14px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "#c8d4e4", cursor: "pointer", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontFamily: "'Georgia',serif" },
  btnDanger: { padding: "6px 14px", background: "transparent", border: "1px solid rgba(255,80,80,0.3)", color: "#ff8080", cursor: "pointer", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontFamily: "'Georgia',serif" },
  tag: (color) => ({ fontSize: 9, letterSpacing: 2, padding: "3px 8px", background: `${color}22`, color, border: `1px solid ${color}44`, textTransform: "uppercase" }),
  tab: (active) => ({ padding: "10px 24px", background: "none", border: "none", borderBottom: active ? "2px solid #388bff" : "2px solid transparent", color: active ? "#388bff" : "#6a7890", cursor: "pointer", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Georgia',serif", marginBottom: -1 }),
};

export default function AdminDashboard({ onLogout }) {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState("torneos");
  const [tournaments, setTournaments] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [activeTournament, setActiveTournament] = useState(null);
  const [form, setForm] = useState({ name: "", sport: "Fútbol", format: "Eliminatoria", maxTeams: 8, description: "" });
  const [teamInput, setTeamInput] = useState("");
  const [teams, setTeams] = useState([]);
  const [scores, setScores] = useState({});
  const [notif, setNotif] = useState(null);
  const [view, setView] = useState("list");

  const sports = ["Fútbol", "Baloncesto", "Tenis", "Voleibol", "Pádel", "Rugby", "Otro"];
  const formats = ["Eliminatoria", "Liga", "Grupos + Eliminatoria"];

  function showNotif(msg) { setNotif(msg); setTimeout(() => setNotif(null), 2500); }

  useEffect(() => {
    const q = query(collection(db, "tournaments"), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  useEffect(() => {
    const q = query(collection(db, "inscriptions"), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => setInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  async function createTournament() {
    if (!form.name.trim()) return showNotif("Añade un nombre");
    const bracket = teams.length >= 2 ? generateBracket(teams) : [];
    await addDoc(collection(db, "tournaments"), {
      ...form, teams, bracket,
      status: "Abierto",
      createdAt: new Date().toISOString(),
      createdBy: user.uid,
    });
    setForm({ name: "", sport: "Fútbol", format: "Eliminatoria", maxTeams: 8, description: "" });
    setTeams([]);
    setView("list");
    showNotif("Torneo creado ✓");
  }

  async function deleteTournament(id) {
    await deleteDoc(doc(db, "tournaments", id));
    if (activeTournament?.id === id) setActiveTournament(null);
    showNotif("Torneo eliminado");
  }

  async function updateStatus(id, status) {
    await updateDoc(doc(db, "tournaments", id), { status });
    showNotif(`Estado actualizado: ${status}`);
  }

  async function handleInscription(id, status) {
    await updateDoc(doc(db, "inscriptions", id), { status });
    showNotif(status === "aprobada" ? "Inscripción aprobada ✓" : "Inscripción rechazada");
  }

  function getScore(tid, idx, field) { return scores[`${tid}-${idx}-${field}`] ?? ""; }
  function setScore(tid, idx, field, val) { setScores(p => ({ ...p, [`${tid}-${idx}-${field}`]: val })); }

  async function confirmScore(tournament, idx) {
    const a = parseInt(getScore(tournament.id, idx, "a"));
    const b = parseInt(getScore(tournament.id, idx, "b"));
    if (isNaN(a) || isNaN(b)) return showNotif("Introduce ambos marcadores");
    const newBracket = tournament.bracket.map((m, i) => i !== idx ? m : {
      ...m, scoreA: a, scoreB: b, winner: a > b ? m.teamA : b > a ? m.teamB : "Empate"
    });
    await updateDoc(doc(db, "tournaments", tournament.id), { bracket: newBracket });
    showNotif("Resultado guardado ✓");
  }

  const pendingInscriptions = inscriptions.filter(i => i.status === "pendiente");
  const sportEmoji = { Fútbol: "⚽", Baloncesto: "🏀", Tenis: "🎾", Voleibol: "🏐", Pádel: "🏓", Rugby: "🏉" };
  const statusColor = { Abierto: "#4ade80", "En curso": "#388bff", Finalizado: "#facc15", Cerrado: "#94a3b8" };

  return (
    <div style={S.wrap}>
      {notif && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#388bff", color: "#fff", padding: "10px 24px", zIndex: 1000, letterSpacing: 1, fontSize: 12, fontFamily: "'Georgia',serif", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
          {notif}
        </div>
      )}
      <style>{`input:focus,select:focus{outline:none;border-color:#388bff!important;}input::placeholder{color:rgba(200,212,228,0.25)!important;}`}</style>

      <header style={S.header}>
        <div style={S.logo}>
          <div style={S.logoIcon}>⚔</div>
          <span style={S.logoText}>TournamentOS</span>
          <span style={S.badge}>Admin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 12, color: "#6a7890" }}>{profile?.name || user?.email}</span>
          <button style={S.btnSm} onClick={onLogout}>Salir</button>
        </div>
      </header>

      <main style={S.main}>
        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 32 }}>
          {["torneos", "inscripciones"].map(t => (
            <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
              {t === "torneos" ? "Torneos" : `Inscripciones ${pendingInscriptions.length > 0 ? `(${pendingInscriptions.length})` : ""}`}
            </button>
          ))}
        </div>

        {/* TORNEOS TAB */}
        {tab === "torneos" && (
          <>
            {view === "list" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <div>
                    <p style={S.sectionTitle}>Panel de administración</p>
                    <h1 style={{ ...S.h1, marginBottom: 0 }}>Torneos</h1>
                  </div>
                  <button style={S.btn} onClick={() => setView("new")}>+ Nuevo torneo</button>
                </div>

                {tournaments.length === 0 ? (
                  <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: "48px", textAlign: "center" }}>
                    <p style={{ color: "#4a5568" }}>No hay torneos. Crea el primero.</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
                    {tournaments.map(t => (
                      <div key={t.id} style={{ ...S.card, cursor: "pointer" }}
                        onClick={() => { setActiveTournament(t); setView("detail"); }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                          <span style={{ fontSize: 22 }}>{sportEmoji[t.sport] || "🏆"}</span>
                          <span style={S.tag(statusColor[t.status] || "#94a3b8")}>{t.status}</span>
                        </div>
                        <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>{t.name}</h3>
                        <p style={{ margin: "0 0 16px", color: "#6a7890", fontSize: 12 }}>{t.sport} · {t.format}</p>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "#4a5568" }}>{t.teams?.length || 0} equipos</span>
                          <button onClick={e => { e.stopPropagation(); deleteTournament(t.id); }} style={S.btnDanger}>Eliminar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {view === "new" && (
              <div style={{ maxWidth: 560 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
                  <button style={S.btnSm} onClick={() => setView("list")}>← Volver</button>
                  <h1 style={{ ...S.h1, marginBottom: 0 }}>Nuevo Torneo</h1>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div>
                    <label style={S.label}>Nombre</label>
                    <input style={S.input} placeholder="Copa de Campeones 2026" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <label style={S.label}>Descripción (opcional)</label>
                    <input style={S.input} placeholder="Describe el torneo..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={S.label}>Deporte</label>
                      <select style={S.select} value={form.sport} onChange={e => setForm(p => ({ ...p, sport: e.target.value }))}>
                        {sports.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Formato</label>
                      <select style={S.select} value={form.format} onChange={e => setForm(p => ({ ...p, format: e.target.value }))}>
                        {formats.map(f => <option key={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={S.label}>Máximo de equipos</label>
                    <input style={S.input} type="number" value={form.maxTeams} onChange={e => setForm(p => ({ ...p, maxTeams: parseInt(e.target.value) }))} />
                  </div>
                  <div>
                    <label style={S.label}>Equipos ({teams.length})</label>
                    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                      <input style={{ ...S.input, flex: 1 }} placeholder="Nombre del equipo..." value={teamInput}
                        onChange={e => setTeamInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && teamInput.trim()) { setTeams(p => [...p, teamInput.trim()]); setTeamInput(""); } }} />
                      <button style={{ ...S.btn, padding: "10px 20px" }} onClick={() => { if (teamInput.trim()) { setTeams(p => [...p, teamInput.trim()]); setTeamInput(""); } }}>+</button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {teams.map(t => (
                        <span key={t} style={{ padding: "4px 12px", background: "rgba(56,139,255,0.1)", border: "1px solid rgba(56,139,255,0.3)", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                          {t} <span onClick={() => setTeams(p => p.filter(x => x !== t))} style={{ cursor: "pointer", color: "#ff8080", fontSize: 10 }}>✕</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <button style={{ ...S.btn, padding: 14 }} onClick={createTournament}>Crear Torneo →</button>
                </div>
              </div>
            )}

            {view === "detail" && activeTournament && (() => {
              const t = tournaments.find(x => x.id === activeTournament.id) || activeTournament;
              const tournamentInscriptions = inscriptions.filter(i => i.tournamentId === t.id);
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
                    <button style={S.btnSm} onClick={() => setView("list")}>← Volver</button>
                    <div>
                      <h1 style={{ ...S.h1, marginBottom: 4 }}>{t.name}</h1>
                      <p style={{ margin: 0, color: "#6a7890", fontSize: 12 }}>{t.sport} · {t.format} · {t.teams?.length || 0} equipos</p>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                      {["Abierto", "En curso", "Finalizado", "Cerrado"].map(s => (
                        <button key={s} style={{ ...S.btnSm, borderColor: t.status === s ? statusColor[s] : undefined, color: t.status === s ? statusColor[s] : undefined }}
                          onClick={() => updateStatus(t.id, s)}>{s}</button>
                      ))}
                    </div>
                  </div>

                  {/* Inscriptions for this tournament */}
                  {tournamentInscriptions.length > 0 && (
                    <div style={{ ...S.card, marginBottom: 24 }}>
                      <p style={S.label}>Solicitudes de inscripción ({tournamentInscriptions.length})</p>
                      {tournamentInscriptions.map(i => (
                        <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <div>
                            <span style={{ fontSize: 13 }}>{i.userName}</span>
                            <span style={{ fontSize: 11, color: "#6a7890", marginLeft: 12 }}>{i.teamName}</span>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={S.tag(i.status === "aprobada" ? "#4ade80" : i.status === "rechazada" ? "#ff8080" : "#facc15")}>{i.status}</span>
                            {i.status === "pendiente" && (
                              <>
                                <button style={{ ...S.btnSm, borderColor: "rgba(74,222,128,0.3)", color: "#4ade80" }} onClick={() => handleInscription(i.id, "aprobada")}>Aprobar</button>
                                <button style={S.btnDanger} onClick={() => handleInscription(i.id, "rechazada")}>Rechazar</button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bracket */}
                  {t.bracket?.length > 0 ? (
                    <div>
                      <p style={S.label}>Partidos</p>
                      {t.bracket.map((match, idx) => (
                        <div key={idx} style={{ ...S.card, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "14px 20px" }}>
                          <span style={{ fontSize: 11, color: "#4a5568", letterSpacing: 2, minWidth: 60 }}>Partido {idx + 1}</span>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, minWidth: 200 }}>
                            <span style={{ fontWeight: match.winner === match.teamA ? 700 : 400, color: match.winner === match.teamA ? "#388bff" : "#e8edf4", minWidth: 100 }}>{match.teamA}</span>
                            <span style={{ color: "#4a5568", fontSize: 12 }}>vs</span>
                            <span style={{ fontWeight: match.winner === match.teamB ? 700 : 400, color: match.winner === match.teamB ? "#388bff" : "#e8edf4", minWidth: 100 }}>{match.teamB}</span>
                          </div>
                          {match.winner ? (
                            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 4, color: "#388bff" }}>{match.scoreA} — {match.scoreB}</span>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <input type="number" min={0} value={getScore(t.id, idx, "a")} onChange={e => setScore(t.id, idx, "a", e.target.value)}
                                placeholder="0" style={{ width: 50, padding: "6px 10px", fontSize: 14, textAlign: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#e8edf4", fontFamily: "'Georgia',serif" }} />
                              <span style={{ color: "#4a5568" }}>—</span>
                              <input type="number" min={0} value={getScore(t.id, idx, "b")} onChange={e => setScore(t.id, idx, "b", e.target.value)}
                                placeholder="0" style={{ width: 50, padding: "6px 10px", fontSize: 14, textAlign: "center", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#e8edf4", fontFamily: "'Georgia',serif" }} />
                              <button style={S.btnSm} onClick={() => confirmScore(t, idx)}>OK</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 32, textAlign: "center", color: "#4a5568", fontSize: 13 }}>
                      No hay partidos generados. Añade equipos al crear el torneo.
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {/* INSCRIPCIONES TAB */}
        {tab === "inscripciones" && (
          <>
            <h1 style={S.h1}>Todas las inscripciones</h1>
            {inscriptions.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: "#4a5568" }}>No hay inscripciones todavía.</div>
            ) : (
              inscriptions.map(i => {
                const tournament = tournaments.find(t => t.id === i.tournamentId);
                return (
                  <div key={i.id} style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{i.userName} <span style={{ color: "#6a7890", fontWeight: 400 }}>— {i.teamName}</span></p>
                      <p style={{ margin: 0, fontSize: 11, color: "#4a5568" }}>{tournament?.name || i.tournamentId} · {new Date(i.createdAt).toLocaleDateString("es-ES")}</p>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={S.tag(i.status === "aprobada" ? "#4ade80" : i.status === "rechazada" ? "#ff8080" : "#facc15")}>{i.status}</span>
                      {i.status === "pendiente" && (
                        <>
                          <button style={{ ...S.btnSm, borderColor: "rgba(74,222,128,0.3)", color: "#4ade80" }} onClick={() => handleInscription(i.id, "aprobada")}>Aprobar</button>
                          <button style={S.btnDanger} onClick={() => handleInscription(i.id, "rechazada")}>Rechazar</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </main>
    </div>
  );
}
