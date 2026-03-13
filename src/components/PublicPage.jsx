import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { C, S, statusColor, getRoundName } from "../shared";

const catColor = { Noticia: C.blue, Resultado: C.green, Convocatoria: C.gold, Aviso: C.red };

const NORMATIVA = [
  { titulo: "1. Participación", texto: "Todos los equipos participantes deben estar registrados en la plataforma y haber recibido confirmación de inscripción por parte de la organización antes del inicio del torneo." },
  { titulo: "2. Formato de juego", texto: "Los partidos se jugarán en FIFA Clubes Pro con la configuración oficial establecida por la organización. Cualquier modificación debe ser acordada por ambos equipos y validada por un administrador." },
  { titulo: "3. Puntualidad", texto: "Los equipos disponen de 10 minutos desde la hora acordada para presentarse al partido. El incumplimiento puede suponer la derrota por incomparecencia (0-3)." },
  { titulo: "4. Conducta", texto: "Se espera un comportamiento deportivo y respetuoso en todo momento. Actitudes antideportivas, insultos o trampas podrán ser sancionadas con expulsión del torneo." },
  { titulo: "5. Resultados", texto: "Los resultados deben ser reportados por ambos equipos a través de la plataforma o comunicados a la organización. En caso de discrepancia, la organización tomará la decisión final." },
  { titulo: "6. Fase de grupos", texto: "En torneos con fase de grupos, la clasificación se determina por puntos (3V/1E/0D), diferencia de goles y goles a favor. En caso de empate entre equipos, se aplica el resultado directo." },
  { titulo: "7. Fase eliminatoria", texto: "En rondas eliminatorias no se permiten empates. En caso de igualdad al finalizar el tiempo reglamentario, se jugarán penaltis para determinar el clasificado." },
  { titulo: "8. Modificaciones", texto: "La organización se reserva el derecho de modificar el formato o las normas del torneo en casos excepcionales, comunicándolo con antelación a los equipos participantes." },
];

export default function PublicPage({ onLogin }) {
  const [tournaments, setTournaments] = useState([]);
  const [news, setNews] = useState([]);
  const [tab, setTab] = useState("torneos");
  const [expandedTId, setExpandedTId] = useState(null);
  const [expandedNews, setExpandedNews] = useState(null);
  const [normativaOpen, setNormativaOpen] = useState(false);

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")), snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(query(collection(db, "news"), orderBy("createdAt", "desc")), snap => setNews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); };
  }, []);

  const activeTournaments = tournaments.filter(t => t.status === "En curso" || t.status === "Abierto");
  const palmares = tournaments.filter(t => t.winner && t.status === "Finalizado");

  return (
    <div style={S.wrap}>
      <style>{`table{border-collapse:collapse;width:100%;}* {box-sizing:border-box;}`}</style>

      {/* Header */}
      <header style={{ ...S.header, borderBottomColor: "rgba(212,160,60,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#0a0a0f", flexShrink: 0 }}>⚔</div>
          <span style={{ fontSize: "clamp(13px,3vw,17px)", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.gold }}>TournamentOS</span>
        </div>
        <button style={{ ...S.btn(C.gold), color: "#0a0a0f", padding: "8px 16px", fontSize: 11 }} onClick={onLogin}>Entrar →</button>
      </header>

      {/* Normativa banner */}
      <div style={{ background: "rgba(212,160,60,0.06)", borderBottom: "1px solid rgba(212,160,60,0.2)" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "0 clamp(16px,4vw,32px)" }}>
          <button onClick={() => setNormativaOpen(p => !p)} style={{ width: "100%", background: "none", border: "none", color: C.text, cursor: "pointer", padding: "14px 0", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'Georgia',serif" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16 }}>📋</span>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>Normativa del torneo</span>
            </span>
            <span style={{ fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>{normativaOpen ? "Ocultar ▲" : "Ver ▼"}</span>
          </button>
          {normativaOpen && (
            <div style={{ paddingBottom: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,320px),1fr))", gap: 16 }}>
                {NORMATIVA.map((n, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(212,160,60,0.15)", padding: "16px 18px" }}>
                    <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 13, color: C.gold }}>{n.titulo}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#8a9ab4", lineHeight: 1.7 }}>{n.texto}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "clamp(32px,6vw,64px) clamp(16px,4vw,24px) clamp(24px,4vw,48px)", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(212,160,60,0.06) 0%, transparent 70%)" }}>
        <p style={{ fontSize: 10, letterSpacing: 5, textTransform: "uppercase", color: C.gold, marginBottom: 12 }}>Plataforma de torneos</p>
        <h1 style={{ fontSize: "clamp(24px,6vw,42px)", fontWeight: 700, margin: "0 0 14px", lineHeight: 1.1 }}>Torneos de<br />FIFA Clubes Pro</h1>
        <p style={{ color: C.muted, fontSize: "clamp(13px,2vw,15px)", maxWidth: 480, margin: "0 auto 28px" }}>Sigue la clasificación en tiempo real, consulta los resultados e inscríbete para competir.</p>
        <button style={{ ...S.btn(C.gold), color: "#0a0a0f", padding: "12px 28px", fontSize: 12 }} onClick={onLogin}>Registrarse y competir →</button>
      </div>

      <main style={S.main}>
        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 28, overflowX: "auto" }}>
          {["torneos", "noticias", "palmares"].map(t => (
            <button key={t} style={{ ...S.tab(tab === t, C.gold) }} onClick={() => setTab(t)}>
              {t === "torneos" ? `Torneos (${activeTournaments.length})` : t === "noticias" ? `Noticias${news.length > 0 ? ` (${news.length})` : ""}` : "🏆 Palmarés"}
            </button>
          ))}
        </div>

        {/* TORNEOS */}
        {tab === "torneos" && (
          <>
            {activeTournaments.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center" }}>
                <p style={{ color: C.faint, marginBottom: 16 }}>No hay torneos activos ahora mismo.</p>
                <button style={{ ...S.btn(C.gold), color: "#0a0a0f" }} onClick={onLogin}>Inicia sesión para estar al tanto</button>
              </div>
            ) : activeTournaments.map(t => {
              const isExpanded = expandedTId === t.id;
              const hasGroups = t.groups?.length > 0;
              const hasElim = t.eliminationRounds?.length > 0;
              return (
                <div key={t.id} style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "start", flex: 1 }}>
                      <span style={{ fontSize: 24, flexShrink: 0 }}>🎮</span>
                      <div>
                        <h3 style={{ margin: "0 0 4px", fontSize: "clamp(15px,3vw,18px)" }}>{t.name}</h3>
                        <p style={{ margin: "0 0 8px", color: C.muted, fontSize: 12 }}>{t.format} · {t.teams?.length || 0} equipos</p>
                        {t.description && <p style={{ margin: "0 0 8px", fontSize: 13, color: "#8a9ab4" }}>{t.description}</p>}
                        <span style={S.tag(statusColor[t.status] || "#94a3b8")}>{t.status}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {(hasGroups || hasElim) && (
                        <button style={S.btnSm} onClick={() => setExpandedTId(isExpanded ? null : t.id)}>
                          {isExpanded ? "Ocultar ▲" : "Ver ▼"}
                        </button>
                      )}
                      <button style={{ ...S.btn(C.gold), color: "#0a0a0f", padding: "7px 14px", fontSize: 10 }} onClick={onLogin}>Inscribirse</button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 20 }}>
                      {hasGroups && (
                        <div style={{ marginBottom: 24 }}>
                          <p style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.blue, marginBottom: 14 }}>Clasificación de grupos</p>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,260px),1fr))", gap: 18 }}>
                            {t.groups.map((g, gi) => (
                              <div key={gi}>
                                <p style={{ ...S.label, color: C.gold, marginBottom: 8 }}>Grupo {g.name}</p>
                                <div style={{ overflowX: "auto" }}>
                                  <table style={{ minWidth: 220 }}>
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
                                      <span style={{ flex: 1, fontWeight: m.played && m.scoreA > m.scoreB ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
                                      {m.played ? <span style={{ fontWeight: 700, letterSpacing: 2, color: C.gold, flexShrink: 0 }}>{m.scoreA}—{m.scoreB}</span> : <span style={{ color: C.faint, flexShrink: 0 }}>vs</span>}
                                      <span style={{ flex: 1, textAlign: "right", fontWeight: m.played && m.scoreB > m.scoreA ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
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
                          <p style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.blue, marginBottom: 14 }}>Cuadro eliminatorio</p>
                          {t.eliminationRounds.map((round, ri) => (
                            <div key={ri} style={{ marginBottom: 16 }}>
                              <p style={{ ...S.label, color: C.gold, marginBottom: 8 }}>{getRoundName(t.eliminationRounds.length, ri)}</p>
                              {round.matches.map((m, mi) => (
                                <div key={mi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(255,255,255,0.015)", marginBottom: 6 }}>
                                  <span style={{ flex: 1, fontWeight: m.winner === m.teamA ? 700 : 400, color: m.winner === m.teamA ? C.blue : C.text, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
                                  {m.winner ? <span style={{ fontWeight: 700, letterSpacing: 3, color: C.blue, flexShrink: 0, fontSize: 13 }}>{m.scoreA}—{m.scoreB}</span> : <span style={{ color: C.faint, fontSize: 11, flexShrink: 0 }}>pdte</span>}
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
            <h2 style={{ fontSize: "clamp(18px,4vw,24px)", fontWeight: 700, margin: "0 0 20px" }}>Noticias</h2>
            {news.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: C.faint }}>No hay noticias publicadas.</div>
            ) : news.map(n => (
              <div key={n.id} style={{ ...S.card, cursor: "pointer" }} onClick={() => setExpandedNews(expandedNews === n.id ? null : n.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={S.tag(catColor[n.category] || C.blue)}>{n.category}</span>
                    <h3 style={{ margin: 0, fontSize: "clamp(14px,3vw,16px)" }}>{n.title}</h3>
                  </div>
                  <span style={{ color: C.faint, fontSize: 18, flexShrink: 0 }}>{expandedNews === n.id ? "▲" : "▼"}</span>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: C.faint }}>{new Date(n.createdAt).toLocaleDateString("es-ES")}</p>
                {expandedNews === n.id && (
                  <p style={{ margin: "12px 0 0", fontSize: 14, color: "#9aa8bc", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{n.body}</p>
                )}
              </div>
            ))}
          </>
        )}

        {/* PALMARES */}
        {tab === "palmares" && (
          <>
            <h2 style={{ fontSize: "clamp(18px,4vw,24px)", fontWeight: 700, margin: "0 0 20px" }}>🏆 Palmarés</h2>
            {palmares.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: C.faint }}>Aún no hay torneos finalizados.</div>
            ) : (
              <>
                {(() => {
                  const counts = {};
                  palmares.forEach(t => { counts[t.winner] = (counts[t.winner] || 0) + 1; });
                  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                  return (
                    <div style={{ ...S.card, marginBottom: 24 }}>
                      <p style={S.label}>Ranking de campeones</p>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ minWidth: 240 }}>
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
                    </div>
                  );
                })()}
                {palmares.map(t => (
                  <div key={t.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 24, flexShrink: 0 }}>🏆</span>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t.name}</h3>
                      <p style={{ margin: 0, color: C.muted, fontSize: 11 }}>{t.format} · {t.teams?.length} equipos · {new Date(t.createdAt).toLocaleDateString("es-ES")}</p>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ margin: "0 0 2px", color: C.gold, fontWeight: 700, fontSize: 14 }}>{t.winner}</p>
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
