import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { useAuth } from "../AuthContext";

const C = { blue: "#388bff", gold: "#d4a03c", green: "#4ade80", red: "#ff6b6b", bg: "#080c14", border: "rgba(255,255,255,0.07)", text: "#e8edf4", muted: "#6a7890", faint: "#4a5568" };
const statusColor = { Abierto: C.green, "En curso": C.blue, Finalizado: C.gold, Cerrado: "#94a3b8" };
const roundNames = ["Final", "Semifinal", "Cuartos de final", "Octavos de final", "Ronda 1"];

const S = {
  wrap: { minHeight: "100vh", background: C.bg, fontFamily: "'Georgia','Times New Roman',serif", color: C.text },
  header: { borderBottom: `1px solid rgba(212,160,60,0.15)`, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, background: "rgba(8,12,20,0.95)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 },
  main: { maxWidth: 960, margin: "0 auto", padding: "36px 24px" },
  card: { border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)", padding: 24, marginBottom: 12 },
  label: { fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.muted, display: "block", marginBottom: 8 },
  input: { width: "100%", padding: "10px 14px", fontSize: 14, background: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.1)`, color: C.text, boxSizing: "border-box", fontFamily: "'Georgia',serif" },
  btn: (color = C.gold) => ({ padding: "10px 24px", background: color, border: "none", color: color === C.gold ? "#0a0a0f" : "#fff", cursor: "pointer", letterSpacing: 2, textTransform: "uppercase", fontSize: 11, fontWeight: 700, fontFamily: "'Georgia',serif" }),
  btnSm: { padding: "5px 12px", background: "transparent", border: `1px solid rgba(255,255,255,0.15)`, color: C.muted, cursor: "pointer", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontFamily: "'Georgia',serif" },
  tag: (color) => ({ fontSize: 9, letterSpacing: 2, padding: "3px 8px", background: `${color}22`, color, border: `1px solid ${color}44`, textTransform: "uppercase" }),
  tab: (active, color = C.gold) => ({ padding: "10px 20px", background: "none", border: "none", borderBottom: active ? `2px solid ${color}` : "2px solid transparent", color: active ? color : C.muted, cursor: "pointer", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Georgia',serif", marginBottom: -1 }),
  th: { fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.muted, padding: "8px 12px", textAlign: "left", borderBottom: `1px solid ${C.border}` },
  td: { padding: "8px 12px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.04)" },
};

function getRoundName(totalRounds, roundIdx) {
  if (totalRounds === 1) return "Final";
  const remaining = totalRounds - roundIdx;
  return ["Final", "Semifinal", "Cuartos de final", "Octavos de final", "Ronda 1"][Math.min(remaining - 1, 4)] || `Ronda ${roundIdx + 1}`;
}

export default function UserDashboard({ onLogout }) {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState("torneos");
  const [tournaments, setTournaments] = useState([]);
  const [myInscriptions, setMyInscriptions] = useState([]);
  const [expandedTId, setExpandedTId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [teamName, setTeamName] = useState("");
  const [notif, setNotif] = useState(null);

  function showNotif(msg) { setNotif(msg); setTimeout(() => setNotif(null), 2500); }

  useEffect(() => {
    return onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")),
      snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, "inscriptions"), where("userId", "==", user.uid)),
      snap => setMyInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);

  async function inscribirse() {
    if (!teamName.trim()) return showNotif("Escribe el nombre de tu equipo");
    if (myInscriptions.find(i => i.tournamentId === selectedTournament.id)) return showNotif("Ya estás inscrito");
    await addDoc(collection(db, "inscriptions"), {
      tournamentId: selectedTournament.id,
      tournamentName: selectedTournament.name,
      userId: user.uid,
      userName: profile?.name || user.email,
      teamName: teamName.trim(),
      status: "pendiente",
      createdAt: new Date().toISOString(),
    });
    setTeamName(""); setShowModal(false);
    showNotif("Solicitud enviada, pendiente de aprobación ✓");
  }

  // Palmarés: finished tournaments with a winner
  const palmares = tournaments.filter(t => t.winner && t.status === "Finalizado");
  // Active tournaments (en curso or abierto)
  const activeTournaments = tournaments.filter(t => t.status === "En curso" || t.status === "Abierto");

  return (
    <div style={S.wrap}>
      {notif && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: C.gold, color: "#0a0a0f", padding: "10px 28px", zIndex: 1000, letterSpacing: 1, fontSize: 12, fontFamily: "'Georgia',serif", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>{notif}</div>}

      {showModal && selectedTournament && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#0e1420", border: `1px solid rgba(212,160,60,0.3)`, padding: 40, maxWidth: 400, width: "90%" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 20 }}>Inscribirse</h3>
            <p style={{ margin: "0 0 24px", color: C.muted, fontSize: 13 }}>{selectedTournament.name}</p>
            <label style={S.label}>Nombre de tu equipo</label>
            <input style={{ ...S.input, marginBottom: 20 }} placeholder="Ej: Los Campeones" value={teamName} onChange={e => setTeamName(e.target.value)} onKeyDown={e => e.key === "Enter" && inscribirse()} />
            <div style={{ display: "flex", gap: 12 }}>
              <button style={S.btn()} onClick={inscribirse}>Enviar solicitud</button>
              <button style={S.btnSm} onClick={() => setShowModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`input:focus{outline:none;border-color:#d4a03c!important;}input::placeholder{color:rgba(200,212,228,0.2)!important;}table{border-collapse:collapse;width:100%;}`}</style>

      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#0a0a0f" }}>⚔</div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.gold }}>TournamentOS</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: C.muted }}>{profile?.name || user?.email}</span>
          <button style={S.btnSm} onClick={onLogout}>Salir</button>
        </div>
      </header>

      <main style={S.main}>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 32 }}>
          {["torneos", "palmares", "mis-inscripciones"].map(t => (
            <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
              {t === "torneos" ? "Torneos" : t === "palmares" ? "🏆 Palmarés" : "Mis inscripciones"}
            </button>
          ))}
        </div>

        {/* TORNEOS */}
        {tab === "torneos" && (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 24px" }}>Torneos · FIFA Clubes Pro</h1>
            {tournaments.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: C.faint }}>No hay torneos disponibles.</div>
            ) : tournaments.map(t => {
              const myInsc = myInscriptions.find(i => i.tournamentId === t.id);
              const isExpanded = expandedTId === t.id;
              const hasGroups = t.groups?.length > 0;
              const hasElim = t.eliminationRounds?.length > 0;

              return (
                <div key={t.id} style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", gap: 16, alignItems: "start" }}>
                      <span style={{ fontSize: 26 }}>🎮</span>
                      <div>
                        <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>{t.name}</h3>
                        <p style={{ margin: "0 0 8px", color: C.muted, fontSize: 12 }}>{t.format} · {t.teams?.length || 0} equipos</p>
                        {t.description && <p style={{ margin: "0 0 8px", fontSize: 13, color: "#8a9ab4" }}>{t.description}</p>}
                        {t.winner && <p style={{ margin: "0 0 8px", color: C.gold, fontSize: 13 }}>🏆 Campeón: <strong>{t.winner}</strong></p>}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={S.tag(statusColor[t.status] || "#94a3b8")}>{t.status}</span>
                          {myInsc && <span style={S.tag(myInsc.status === "aprobada" ? C.green : myInsc.status === "rechazada" ? C.red : C.gold)}>
                            {myInsc.status === "aprobada" ? "✓ Inscrito" : myInsc.status === "rechazada" ? "Rechazado" : "Pendiente"}
                          </span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {!myInsc && t.status === "Abierto" && (
                        <button style={S.btn()} onClick={() => { setSelectedTournament(t); setShowModal(true); }}>Inscribirse</button>
                      )}
                      {(hasGroups || hasElim) && (
                        <button style={S.btnSm} onClick={() => setExpandedTId(isExpanded ? null : t.id)}>
                          {isExpanded ? "Ocultar ▲" : "Ver torneo ▼"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded view */}
                  {isExpanded && (
                    <div style={{ marginTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 24 }}>

                      {/* Groups */}
                      {hasGroups && (
                        <div style={{ marginBottom: 28 }}>
                          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.blue, marginBottom: 16 }}>Fase de grupos</p>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 20 }}>
                            {t.groups.map((g, gi) => (
                              <div key={gi}>
                                <p style={{ ...S.label, color: C.gold, marginBottom: 10 }}>Grupo {g.name}</p>
                                <table>
                                  <thead><tr>{["#", "Equipo", "PJ", "PTS", "DG"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                                  <tbody>
                                    {g.standings.map((s, si) => (
                                      <tr key={s.name} style={{ background: si < (t.qualify || 2) && t.format === "Grupos + Eliminatoria" ? "rgba(56,139,255,0.05)" : "transparent" }}>
                                        <td style={{ ...S.td, color: si < (t.qualify || 2) && t.format === "Grupos + Eliminatoria" ? C.blue : C.faint }}>{si + 1}</td>
                                        <td style={{ ...S.td, fontWeight: 600 }}>{s.name}</td>
                                        <td style={S.td}>{s.pj}</td>
                                        <td style={{ ...S.td, fontWeight: 700 }}>{s.pts}</td>
                                        <td style={{ ...S.td, color: s.gd >= 0 ? C.green : C.red }}>{s.gd > 0 ? "+" : ""}{s.gd}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <div style={{ marginTop: 12 }}>
                                  {g.matches.map((m, mi) => (
                                    <div key={mi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12 }}>
                                      <span style={{ flex: 1, fontWeight: m.played && m.scoreA > m.scoreB ? 700 : 400 }}>{m.teamA}</span>
                                      {m.played ? (
                                        <span style={{ fontWeight: 700, letterSpacing: 2, color: C.gold, minWidth: 40, textAlign: "center" }}>{m.scoreA}—{m.scoreB}</span>
                                      ) : (
                                        <span style={{ color: C.faint, minWidth: 40, textAlign: "center" }}>vs</span>
                                      )}
                                      <span style={{ flex: 1, textAlign: "right", fontWeight: m.played && m.scoreB > m.scoreA ? 700 : 400 }}>{m.teamB}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Elimination */}
                      {hasElim && (
                        <div>
                          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.blue, marginBottom: 16 }}>Fase eliminatoria</p>
                          {t.eliminationRounds.map((round, ri) => (
                            <div key={ri} style={{ marginBottom: 20 }}>
                              <p style={{ ...S.label, color: C.gold, marginBottom: 10 }}>{getRoundName(t.eliminationRounds.length, ri)}</p>
                              {round.matches.map((m, mi) => (
                                <div key={mi} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.015)", marginBottom: 6, flexWrap: "wrap" }}>
                                  <span style={{ flex: 1, fontWeight: m.winner === m.teamA ? 700 : 400, color: m.winner === m.teamA ? C.blue : C.text }}>{m.teamA}</span>
                                  {m.winner ? (
                                    <span style={{ fontWeight: 700, letterSpacing: 3, color: C.blue, minWidth: 50, textAlign: "center" }}>{m.scoreA}—{m.scoreB}</span>
                                  ) : (
                                    <span style={{ color: C.faint, minWidth: 50, textAlign: "center", fontSize: 11 }}>pendiente</span>
                                  )}
                                  <span style={{ flex: 1, textAlign: "right", fontWeight: m.winner === m.teamB ? 700 : 400, color: m.winner === m.teamB ? C.blue : C.text }}>{m.teamB}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* PALMARES */}
        {tab === "palmares" && (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 8px" }}>🏆 Palmarés</h1>
            <p style={{ color: C.muted, fontSize: 13, marginBottom: 28 }}>Historial de campeones de todos los torneos</p>
            {palmares.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: C.faint }}>
                Aún no hay torneos finalizados.
              </div>
            ) : (
              <>
                {/* Winner count table */}
                {(() => {
                  const counts = {};
                  palmares.forEach(t => { counts[t.winner] = (counts[t.winner] || 0) + 1; });
                  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                  return (
                    <div style={{ ...S.card, marginBottom: 28 }}>
                      <p style={S.label}>Ranking de campeones</p>
                      <table>
                        <thead><tr>{["#", "Equipo", "Títulos"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                        <tbody>
                          {sorted.map(([name, count], i) => (
                            <tr key={name}>
                              <td style={{ ...S.td, color: i === 0 ? C.gold : C.faint }}>{i === 0 ? "👑" : i + 1}</td>
                              <td style={{ ...S.td, fontWeight: 700, color: i === 0 ? C.gold : C.text }}>{name}</td>
                              <td style={{ ...S.td, color: C.gold, fontWeight: 700 }}>{"🏆".repeat(Math.min(count, 5))} {count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Tournament list */}
                <p style={S.label}>Historial de torneos</p>
                {palmares.map(t => (
                  <div key={t.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 28 }}>🏆</span>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>{t.name}</h3>
                      <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>{t.format} · {t.teams?.length} equipos · {new Date(t.createdAt).toLocaleDateString("es-ES")}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ margin: "0 0 2px", color: C.gold, fontWeight: 700, fontSize: 15 }}>{t.winner}</p>
                      <p style={{ margin: 0, color: C.faint, fontSize: 11 }}>Campeón</p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {/* MIS INSCRIPCIONES */}
        {tab === "mis-inscripciones" && (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 24px" }}>Mis inscripciones</h1>
            {myInscriptions.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: C.faint }}>
                Aún no te has inscrito en ningún torneo.
              </div>
            ) : myInscriptions.map(i => {
              const tournament = tournaments.find(t => t.id === i.tournamentId);
              const myMatches = [];
              tournament?.groups?.forEach(g => g.matches.forEach(m => {
                if (m.teamA === i.teamName || m.teamB === i.teamName) myMatches.push({ ...m, phase: "Grupos" });
              }));
              tournament?.eliminationRounds?.forEach((r, ri) => r.matches.forEach(m => {
                if (m.teamA === i.teamName || m.teamB === i.teamName) myMatches.push({ ...m, phase: getRoundName(tournament.eliminationRounds.length, ri) });
              }));

              return (
                <div key={i.id} style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: myMatches.length > 0 ? 16 : 0, flexWrap: "wrap", gap: 12 }}>
                    <div>
                      <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>{i.tournamentName}</h3>
                      <p style={{ margin: "0 0 6px", color: C.muted, fontSize: 12 }}>Equipo: <strong style={{ color: C.text }}>{i.teamName}</strong> · {new Date(i.createdAt).toLocaleDateString("es-ES")}</p>
                    </div>
                    <span style={S.tag(i.status === "aprobada" ? C.green : i.status === "rechazada" ? C.red : C.gold)}>
                      {i.status === "aprobada" ? "✓ Aprobado" : i.status === "rechazada" ? "Rechazado" : "Pendiente"}
                    </span>
                  </div>

                  {myMatches.length > 0 && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14 }}>
                      <p style={S.label}>Tus partidos</p>
                      {myMatches.map((m, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, color: C.faint, minWidth: 80, letterSpacing: 1 }}>{m.phase}</span>
                          <span style={{ flex: 1, fontWeight: (m.teamA === i.teamName) ? 700 : 400, color: m.teamA === i.teamName ? C.gold : C.text }}>{m.teamA}</span>
                          {(m.played || m.winner) ? (
                            <span style={{ fontWeight: 700, letterSpacing: 2, color: C.gold }}>{m.scoreA}—{m.scoreB}</span>
                          ) : (
                            <span style={{ color: C.faint, fontSize: 11 }}>vs</span>
                          )}
                          <span style={{ flex: 1, textAlign: "right", fontWeight: m.teamB === i.teamName ? 700 : 400, color: m.teamB === i.teamName ? C.gold : C.text }}>{m.teamB}</span>
                          {(m.played || m.winner) && (() => {
                            const won = (m.winner && m.winner === i.teamName) || (!m.winner && ((m.teamA === i.teamName && m.scoreA > m.scoreB) || (m.teamB === i.teamName && m.scoreB > m.scoreA)));
                            const drew = !m.winner && m.scoreA === m.scoreB;
                            return <span style={S.tag(won ? C.green : drew ? C.gold : C.red)}>{won ? "Victoria" : drew ? "Empate" : "Derrota"}</span>;
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}
