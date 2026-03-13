import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { useAuth } from "../AuthContext";
import { C, S, statusColor, getRoundName } from "../shared";

const catColor = { Noticia: C.blue, Resultado: C.green, Convocatoria: C.gold, Aviso: C.red };

const NORMATIVA = [
  { titulo: "1. Participación", texto: "Todos los equipos participantes deben estar registrados y haber recibido confirmación de inscripción antes del inicio del torneo." },
  { titulo: "2. Formato de juego", texto: "Los partidos se jugarán en FIFA Clubes Pro con la configuración oficial. Cualquier modificación debe ser acordada por ambos equipos y validada por un administrador." },
  { titulo: "3. Puntualidad", texto: "Los equipos disponen de 10 minutos desde la hora acordada para presentarse. El incumplimiento puede suponer derrota por incomparecencia (0-3)." },
  { titulo: "4. Conducta", texto: "Se espera comportamiento deportivo y respetuoso. Actitudes antideportivas, insultos o trampas pueden ser sancionadas con expulsión." },
  { titulo: "5. Resultados", texto: "Los resultados deben ser reportados por ambos equipos. En caso de discrepancia, la organización tomará la decisión final." },
  { titulo: "6. Fase de grupos", texto: "Clasificación por puntos (3V/1E/0D), diferencia de goles y goles a favor. En empate entre equipos, se aplica el resultado directo." },
  { titulo: "7. Eliminatoria", texto: "No se permiten empates en rondas eliminatorias. En caso de igualdad se jugarán penaltis." },
  { titulo: "8. Modificaciones", texto: "La organización se reserva el derecho de modificar el formato en casos excepcionales, comunicándolo con antelación." },
];

export default function UserDashboard({ onLogout }) {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState("torneos");
  const [tournaments, setTournaments] = useState([]);
  const [myInscriptions, setMyInscriptions] = useState([]);
  const [news, setNews] = useState([]);
  const [expandedTId, setExpandedTId] = useState(null);
  const [expandedNews, setExpandedNews] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [teamName, setTeamName] = useState("");
  const [notif, setNotif] = useState(null);
  const [normativaOpen, setNormativaOpen] = useState(false);

  function showNotif(msg) { setNotif(msg); setTimeout(() => setNotif(null), 2500); }

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")), snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(query(collection(db, "news"), orderBy("createdAt", "desc")), snap => setNews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, "inscriptions"), where("userId", "==", user.uid)), snap => setMyInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);

  async function inscribirse() {
    if (!teamName.trim()) return showNotif("Escribe el nombre de tu equipo");
    if (myInscriptions.find(i => i.tournamentId === selectedTournament.id)) return showNotif("Ya estás inscrito");
    await addDoc(collection(db, "inscriptions"), {
      tournamentId: selectedTournament.id, tournamentName: selectedTournament.name,
      userId: user.uid, userName: profile?.name || user.email,
      teamName: teamName.trim(), status: "pendiente", createdAt: new Date().toISOString(),
    });
    setTeamName(""); setShowModal(false);
    showNotif("Solicitud enviada, pendiente de aprobación ✓");
  }

  const tabs = ["torneos", "noticias", "palmares", "mis-inscripciones"];

  return (
    <div style={S.wrap}>
      {notif && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: C.gold, color: "#0a0a0f", padding: "10px 28px", zIndex: 1000, letterSpacing: 1, fontSize: 12, fontFamily: "'Georgia',serif", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", maxWidth: "90vw", textAlign: "center" }}>{notif}</div>}

      {showModal && selectedTournament && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#0e1420", border: `1px solid rgba(212,160,60,0.3)`, padding: "clamp(24px,5vw,40px)", maxWidth: 400, width: "100%" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 20 }}>Inscribirse</h3>
            <p style={{ margin: "0 0 24px", color: C.muted, fontSize: 13 }}>{selectedTournament.name}</p>
            <label style={S.label}>Nombre de tu equipo</label>
            <input style={{ ...S.input, marginBottom: 20 }} placeholder="Ej: Los Campeones" value={teamName} onChange={e => setTeamName(e.target.value)} onKeyDown={e => e.key === "Enter" && inscribirse()} />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button style={{ ...S.btn(C.gold), color: "#0a0a0f" }} onClick={inscribirse}>Enviar solicitud</button>
              <button style={S.btnSm} onClick={() => setShowModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`input:focus{outline:none;border-color:#d4a03c!important;}input::placeholder{color:rgba(200,212,228,0.2)!important;}table{border-collapse:collapse;width:100%;}*{box-sizing:border-box;}`}</style>

      {/* Normativa banner */}
      <div style={{ background: "rgba(212,160,60,0.05)", borderBottom: "1px solid rgba(212,160,60,0.15)" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "0 clamp(16px,4vw,32px)" }}>
          <button onClick={() => setNormativaOpen(p => !p)} style={{ width: "100%", background: "none", border: "none", color: C.text, cursor: "pointer", padding: "12px 0", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'Georgia',serif" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span>📋</span>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>Normativa del torneo</span>
            </span>
            <span style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>{normativaOpen ? "Ocultar ▲" : "Ver ▼"}</span>
          </button>
          {normativaOpen && (
            <div style={{ paddingBottom: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,300px),1fr))", gap: 14 }}>
                {NORMATIVA.map((n, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(212,160,60,0.12)", padding: "14px 16px" }}>
                    <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 12, color: C.gold }}>{n.titulo}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#8a9ab4", lineHeight: 1.6 }}>{n.texto}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <header style={{ ...S.header, borderBottomColor: "rgba(212,160,60,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#0a0a0f", flexShrink: 0 }}>⚔</div>
          <span style={{ fontSize: "clamp(12px,3vw,16px)", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.gold }}>TournamentOS</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.muted, maxWidth: "20vw", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.name || user?.email}</span>
          <button style={S.btnSm} onClick={onLogout}>Salir</button>
        </div>
      </header>

      <main style={S.main}>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 24, overflowX: "auto" }}>
          {tabs.map(t => (
            <button key={t} style={{ ...S.tab(tab === t, C.gold) }} onClick={() => setTab(t)}>
              {t === "torneos" ? "Torneos" : t === "noticias" ? "Noticias" : t === "palmares" ? "🏆 Palmarés" : "Mis inscripciones"}
            </button>
          ))}
        </div>

        {/* TORNEOS */}
        {tab === "torneos" && (
          <>
            <h1 style={{ fontSize: "clamp(18px,4vw,26px)", fontWeight: 700, margin: "0 0 20px" }}>Torneos · FIFA Clubes Pro</h1>
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
                    <div style={{ display: "flex", gap: 12, alignItems: "start", flex: 1 }}>
                      <span style={{ fontSize: 24, flexShrink: 0 }}>🎮</span>
                      <div>
                        <h3 style={{ margin: "0 0 4px", fontSize: "clamp(14px,3vw,17px)" }}>{t.name}</h3>
                        <p style={{ margin: "0 0 8px", color: C.muted, fontSize: 12 }}>{t.format} · {t.teams?.length || 0} equipos</p>
                        {t.description && <p style={{ margin: "0 0 8px", fontSize: 13, color: "#8a9ab4" }}>{t.description}</p>}
                        {t.winner && <p style={{ margin: "0 0 8px", color: C.gold, fontSize: 13 }}>🏆 <strong>{t.winner}</strong></p>}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={S.tag(statusColor[t.status] || "#94a3b8")}>{t.status}</span>
                          {myInsc && <span style={S.tag(myInsc.status === "aprobada" ? C.green : myInsc.status === "rechazada" ? C.red : C.gold)}>
                            {myInsc.status === "aprobada" ? "✓ Inscrito" : myInsc.status === "rechazada" ? "Rechazado" : "Pendiente"}
                          </span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
                      {!myInsc && t.status === "Abierto" && (
                        <button style={{ ...S.btn(C.gold), color: "#0a0a0f", padding: "8px 14px", fontSize: 10 }} onClick={() => { setSelectedTournament(t); setShowModal(true); }}>Inscribirse</button>
                      )}
                      {(hasGroups || hasElim) && (
                        <button style={S.btnSm} onClick={() => setExpandedTId(isExpanded ? null : t.id)}>
                          {isExpanded ? "Ocultar ▲" : "Ver ▼"}
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 20 }}>
                      {hasGroups && (
                        <div style={{ marginBottom: 24 }}>
                          <p style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.blue, marginBottom: 14 }}>Clasificación de grupos</p>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,250px),1fr))", gap: 16 }}>
                            {t.groups.map((g, gi) => (
                              <div key={gi}>
                                <p style={{ ...S.label, color: C.gold, marginBottom: 8 }}>Grupo {g.name}</p>
                                <div style={{ overflowX: "auto" }}>
                                  <table style={{ minWidth: 200 }}>
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
                                </div>
                                <div style={{ marginTop: 10 }}>
                                  {g.matches.map((m, mi) => (
                                    <div key={mi} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12 }}>
                                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: m.played && m.scoreA > m.scoreB ? 700 : 400 }}>{m.teamA}</span>
                                      {m.played ? <span style={{ fontWeight: 700, letterSpacing: 2, color: C.gold, flexShrink: 0 }}>{m.scoreA}—{m.scoreB}</span> : <span style={{ color: C.faint, flexShrink: 0 }}>vs</span>}
                                      <span style={{ flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: m.played && m.scoreB > m.scoreA ? 700 : 400 }}>{m.teamB}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {hasElim && (
                        <div>
                          <p style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.blue, marginBottom: 12 }}>Cuadro eliminatorio</p>
                          {t.eliminationRounds.map((round, ri) => (
                            <div key={ri} style={{ marginBottom: 16 }}>
                              <p style={{ ...S.label, color: C.gold, marginBottom: 8 }}>{getRoundName(t.eliminationRounds.length, ri)}</p>
                              {round.matches.map((m, mi) => (
                                <div key={mi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "rgba(255,255,255,0.015)", marginBottom: 5 }}>
                                  <span style={{ flex: 1, fontWeight: m.winner === m.teamA ? 700 : 400, color: m.winner === m.teamA ? C.blue : C.text, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
                                  {m.winner ? <span style={{ fontWeight: 700, letterSpacing: 2, color: C.blue, flexShrink: 0 }}>{m.scoreA}—{m.scoreB}</span> : <span style={{ color: C.faint, fontSize: 11, flexShrink: 0 }}>pdte</span>}
                                  <span style={{ flex: 1, textAlign: "right", fontWeight: m.winner === m.teamB ? 700 : 400, color: m.winner === m.teamB ? C.blue : C.text, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
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

        {/* NOTICIAS */}
        {tab === "noticias" && (
          <>
            <h1 style={{ fontSize: "clamp(18px,4vw,24px)", fontWeight: 700, margin: "0 0 20px" }}>Noticias</h1>
            {news.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: C.faint }}>No hay noticias publicadas.</div>
            ) : news.map(n => (
              <div key={n.id} style={{ ...S.card, cursor: "pointer" }} onClick={() => setExpandedNews(expandedNews === n.id ? null : n.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={S.tag(catColor[n.category] || C.blue)}>{n.category}</span>
                    <h3 style={{ margin: 0, fontSize: "clamp(13px,3vw,15px)" }}>{n.title}</h3>
                  </div>
                  <span style={{ color: C.faint, fontSize: 16, flexShrink: 0 }}>{expandedNews === n.id ? "▲" : "▼"}</span>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: C.faint }}>{new Date(n.createdAt).toLocaleDateString("es-ES")}</p>
                {expandedNews === n.id && <p style={{ margin: "10px 0 0", fontSize: 14, color: "#9aa8bc", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{n.body}</p>}
              </div>
            ))}
          </>
        )}

        {/* PALMARES */}
        {tab === "palmares" && (
          <>
            <h1 style={{ fontSize: "clamp(18px,4vw,24px)", fontWeight: 700, margin: "0 0 20px" }}>🏆 Palmarés</h1>
            {(() => {
              const palmares = tournaments.filter(t => t.winner && t.status === "Finalizado");
              if (palmares.length === 0) return <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: C.faint }}>Aún no hay torneos finalizados.</div>;
              const counts = {};
              palmares.forEach(t => { counts[t.winner] = (counts[t.winner] || 0) + 1; });
              const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
              return (
                <>
                  <div style={{ ...S.card, marginBottom: 20 }}>
                    <p style={S.label}>Ranking de campeones</p>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ minWidth: 220 }}>
                        <thead><tr>{["#", "Equipo", "Títulos"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                        <tbody>{sorted.map(([name, count], i) => (
                          <tr key={name}>
                            <td style={{ ...S.td, color: i === 0 ? C.gold : C.faint }}>{i === 0 ? "👑" : i + 1}</td>
                            <td style={{ ...S.td, fontWeight: 700, color: i === 0 ? C.gold : C.text }}>{name}</td>
                            <td style={{ ...S.td, color: C.gold, fontWeight: 700 }}>{"🏆".repeat(Math.min(count, 5))} {count}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                  {palmares.map(t => (
                    <div key={t.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 22, flexShrink: 0 }}>🏆</span>
                      <div style={{ flex: 1, minWidth: 100 }}>
                        <h3 style={{ margin: "0 0 2px", fontSize: 14 }}>{t.name}</h3>
                        <p style={{ margin: 0, color: C.muted, fontSize: 11 }}>{t.format} · {new Date(t.createdAt).toLocaleDateString("es-ES")}</p>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <p style={{ margin: "0 0 2px", color: C.gold, fontWeight: 700, fontSize: 14 }}>{t.winner}</p>
                        <p style={{ margin: 0, color: C.faint, fontSize: 11 }}>Campeón</p>
                      </div>
                    </div>
                  ))}
                </>
              );
            })()}
          </>
        )}

        {/* MIS INSCRIPCIONES */}
        {tab === "mis-inscripciones" && (
          <>
            <h1 style={{ fontSize: "clamp(18px,4vw,24px)", fontWeight: 700, margin: "0 0 20px" }}>Mis inscripciones</h1>
            {myInscriptions.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: C.faint }}>Aún no te has inscrito.</div>
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: myMatches.length > 0 ? 14 : 0, flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <h3 style={{ margin: "0 0 4px", fontSize: "clamp(14px,3vw,17px)" }}>{i.tournamentName}</h3>
                      <p style={{ margin: "0 0 4px", color: C.muted, fontSize: 12 }}>Equipo: <strong style={{ color: C.text }}>{i.teamName}</strong></p>
                      <p style={{ margin: 0, color: C.faint, fontSize: 11 }}>{new Date(i.createdAt).toLocaleDateString("es-ES")}</p>
                    </div>
                    <span style={S.tag(i.status === "aprobada" ? C.green : i.status === "rechazada" ? C.red : C.gold)}>
                      {i.status === "aprobada" ? "✓ Aprobado" : i.status === "rechazada" ? "Rechazado" : "Pendiente"}
                    </span>
                  </div>
                  {myMatches.length > 0 && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
                      <p style={S.label}>Tus partidos</p>
                      {myMatches.map((m, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, color: C.faint, minWidth: 70, letterSpacing: 1 }}>{m.phase}</span>
                          <span style={{ flex: 1, fontWeight: m.teamA === i.teamName ? 700 : 400, color: m.teamA === i.teamName ? C.gold : C.text, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
                          {(m.played || m.winner) ? <span style={{ fontWeight: 700, letterSpacing: 2, color: C.gold, flexShrink: 0 }}>{m.scoreA}—{m.scoreB}</span> : <span style={{ color: C.faint, fontSize: 11, flexShrink: 0 }}>vs</span>}
                          <span style={{ flex: 1, textAlign: "right", fontWeight: m.teamB === i.teamName ? 700 : 400, color: m.teamB === i.teamName ? C.gold : C.text, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
                          {(m.played || m.winner) && (() => {
                            const won = (m.winner && m.winner === i.teamName) || (!m.winner && ((m.teamA === i.teamName && m.scoreA > m.scoreB) || (m.teamB === i.teamName && m.scoreB > m.scoreA)));
                            const drew = !m.winner && m.scoreA === m.scoreB;
                            return <span style={S.tag(won ? C.green : drew ? C.gold : C.red)}>{won ? "V" : drew ? "E" : "D"}</span>;
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
