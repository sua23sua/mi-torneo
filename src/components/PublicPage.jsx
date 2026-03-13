import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";

const C = { blue: "#388bff", gold: "#d4a03c", green: "#4ade80", red: "#ff6b6b", bg: "#080c14", border: "rgba(255,255,255,0.07)", text: "#e8edf4", muted: "#6a7890", faint: "#4a5568" };
const statusColor = { Abierto: C.green, "En curso": C.blue, Finalizado: C.gold, Cerrado: "#94a3b8" };

const S = {
  wrap: { minHeight: "100vh", background: C.bg, fontFamily: "'Georgia','Times New Roman',serif", color: C.text },
  header: { borderBottom: `1px solid rgba(212,160,60,0.2)`, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, background: "rgba(8,12,20,0.97)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 },
  main: { maxWidth: 960, margin: "0 auto", padding: "48px 24px" },
  card: { border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)", padding: 24, marginBottom: 12 },
  label: { fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.muted, display: "block", marginBottom: 8 },
  btn: (color = C.gold) => ({ padding: "10px 28px", background: color, border: "none", color: color === C.gold ? "#0a0a0f" : "#fff", cursor: "pointer", letterSpacing: 2, textTransform: "uppercase", fontSize: 11, fontWeight: 700, fontFamily: "'Georgia',serif" }),
  btnSm: { padding: "5px 14px", background: "transparent", border: `1px solid rgba(255,255,255,0.15)`, color: C.muted, cursor: "pointer", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontFamily: "'Georgia',serif" },
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

export default function PublicPage({ onLogin }) {
  const [tournaments, setTournaments] = useState([]);
  const [tab, setTab] = useState("torneos");
  const [expandedTId, setExpandedTId] = useState(null);

  useEffect(() => {
    return onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")),
      snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const activeTournaments = tournaments.filter(t => t.status === "En curso" || t.status === "Abierto");
  const palmares = tournaments.filter(t => t.winner && t.status === "Finalizado");

  return (
    <div style={S.wrap}>
      <style>{`table{border-collapse:collapse;width:100%;}`}</style>

      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#0a0a0f" }}>⚔</div>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.gold }}>TournamentOS</span>
          <span style={{ fontSize: 10, letterSpacing: 2, color: C.muted, padding: "2px 8px", border: `1px solid rgba(255,255,255,0.1)`, textTransform: "uppercase" }}>FIFA Clubes Pro</span>
        </div>
        <button style={S.btn()} onClick={onLogin}>Iniciar sesión →</button>
      </header>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "64px 24px 48px", borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
        <p style={{ fontSize: 10, letterSpacing: 5, textTransform: "uppercase", color: C.gold, marginBottom: 16 }}>Plataforma de torneos</p>
        <h1 style={{ fontSize: 42, fontWeight: 700, margin: "0 0 16px", lineHeight: 1.1 }}>Torneos de<br />FIFA Clubes Pro</h1>
        <p style={{ color: C.muted, fontSize: 15, maxWidth: 480, margin: "0 auto 32px" }}>Consulta los torneos en curso, sigue la clasificación en tiempo real y regístrate para competir.</p>
        <button style={S.btn()} onClick={onLogin}>Registrarse y competir →</button>
      </div>

      <main style={S.main}>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 36 }}>
          {["torneos", "palmares"].map(t => (
            <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
              {t === "torneos" ? `Torneos activos (${activeTournaments.length})` : "🏆 Palmarés"}
            </button>
          ))}
        </div>

        {/* TORNEOS ACTIVOS */}
        {tab === "torneos" && (
          <>
            {activeTournaments.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center" }}>
                <p style={{ color: C.faint, marginBottom: 16 }}>No hay torneos activos en este momento.</p>
                <button style={S.btn()} onClick={onLogin}>Inicia sesión para estar al tanto</button>
              </div>
            ) : activeTournaments.map(t => {
              const isExpanded = expandedTId === t.id;
              const hasGroups = t.groups?.length > 0;
              const hasElim = t.eliminationRounds?.length > 0;

              return (
                <div key={t.id} style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "start" }}>
                      <span style={{ fontSize: 28 }}>🎮</span>
                      <div>
                        <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>{t.name}</h3>
                        <p style={{ margin: "0 0 8px", color: C.muted, fontSize: 12 }}>{t.format} · {t.teams?.length || 0} equipos</p>
                        {t.description && <p style={{ margin: "0 0 8px", fontSize: 13, color: "#8a9ab4" }}>{t.description}</p>}
                        <span style={S.tag(statusColor[t.status] || "#94a3b8")}>{t.status}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(hasGroups || hasElim) && (
                        <button style={S.btnSm} onClick={() => setExpandedTId(isExpanded ? null : t.id)}>
                          {isExpanded ? "Ocultar ▲" : "Ver clasificación ▼"}
                        </button>
                      )}
                      <button style={S.btn()} onClick={onLogin}>Inscribirse</button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 24 }}>

                      {hasGroups && (
                        <div style={{ marginBottom: 28 }}>
                          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.blue, marginBottom: 16 }}>Clasificación de grupos</p>
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

                      {hasElim && (
                        <div>
                          <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: C.blue, marginBottom: 16 }}>Cuadro eliminatorio</p>
                          {t.eliminationRounds.map((round, ri) => (
                            <div key={ri} style={{ marginBottom: 20 }}>
                              <p style={{ ...S.label, color: C.gold, marginBottom: 10 }}>{getRoundName(t.eliminationRounds.length, ri)}</p>
                              {round.matches.map((m, mi) => (
                                <div key={mi} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.015)", marginBottom: 6, flexWrap: "wrap" }}>
                                  <span style={{ flex: 1, fontWeight: m.winner === m.teamA ? 700 : 400, color: m.winner === m.teamA ? C.blue : C.text }}>{m.teamA}</span>
                                  {m.winner ? (
                                    <span style={{ fontWeight: 700, letterSpacing: 3, color: C.blue }}>{m.scoreA}—{m.scoreB}</span>
                                  ) : (
                                    <span style={{ color: C.faint, fontSize: 11 }}>pendiente</span>
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
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 24px" }}>🏆 Palmarés</h2>
            {palmares.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: C.faint }}>Aún no hay torneos finalizados.</div>
            ) : (
              <>
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
      </main>
    </div>
  );
}
