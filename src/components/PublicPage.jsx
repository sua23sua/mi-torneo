import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { C, S, statusColor, getRoundName, TeamLogo } from "../shared";

const catColor = { Noticia: C.blue, Resultado: C.green, Convocatoria: C.gold, Aviso: C.red };

const NORMATIVA = [
  { titulo: "1. Participación", texto: "Todos los equipos deben estar registrados y haber recibido confirmación de inscripción antes del inicio del torneo." },
  { titulo: "2. Formato de juego", texto: "Los partidos se jugarán en FIFA Clubes Pro con la configuración oficial establecida por la organización." },
  { titulo: "3. Puntualidad", texto: "10 minutos de margen desde la hora acordada. El incumplimiento puede suponer derrota por incomparecencia (0-3)." },
  { titulo: "4. Conducta", texto: "Se espera comportamiento deportivo y respetuoso. Las infracciones pueden conllevar expulsión del torneo." },
  { titulo: "5. Resultados", texto: "Deben ser reportados por ambos equipos. En caso de discrepancia, la organización decide." },
  { titulo: "6. Fase de grupos", texto: "Clasificación por puntos (3V/1E/0D), diferencia de goles y goles a favor. Empate directo en caso de igualdad." },
  { titulo: "7. Eliminatoria", texto: "No se permiten empates. En caso de igualdad al final del tiempo reglamentario se juegan penaltis." },
  { titulo: "8. Modificaciones", texto: "La organización se reserva el derecho a modificar el formato en casos excepcionales, comunicándolo con antelación." },
];

export default function PublicPage({ onLogin }) {
  const [tournaments, setTournaments] = useState([]);
  const [news, setNews] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [tab, setTab] = useState("torneos");
  const [expandedTId, setExpandedTId] = useState(null);
  const [expandedNews, setExpandedNews] = useState(null);
  const [normativaOpen, setNormativaOpen] = useState(false);

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")), snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(query(collection(db, "news"), orderBy("createdAt", "desc")), snap => setNews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u3 = onSnapshot(query(collection(db, "inscriptions"), orderBy("createdAt", "desc")), snap => setInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); u3(); };
  }, []);

  const logoMap = {};
  inscriptions.forEach(i => { if (i.teamName && i.logoUrl) logoMap[i.teamName] = i.logoUrl; });

  const activeTournaments = tournaments.filter(t => t.status === "En curso" || t.status === "Abierto");
  const palmares = tournaments.filter(t => t.winner && t.status === "Finalizado");

  function TRow({ name, size = 22 }) {
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><TeamLogo name={name} logoUrl={logoMap[name]} size={size} /><span>{name}</span></span>;
  }

  return (
    <div style={S.wrap}>
      <style>{`table{border-collapse:collapse;width:100%;}*{box-sizing:border-box;}.hover-card:hover{border-color:rgba(232,184,75,0.3)!important;}.btn-h:hover{opacity:0.85;transform:translateY(-1px);}`}</style>

      {/* Normativa */}
      <div style={{ background: "rgba(232,184,75,0.04)", borderBottom: "1px solid rgba(232,184,75,0.12)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 clamp(16px,4vw,32px)" }}>
          <button onClick={() => setNormativaOpen(p => !p)} style={{ width: "100%", background: "none", border: "none", color: C.text, cursor: "pointer", padding: "13px 0", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'Georgia',serif" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}><span>📋</span><span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>Normativa del torneo</span></span>
            <span style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>{normativaOpen ? "Ocultar ▲" : "Ver ▼"}</span>
          </button>
          {normativaOpen && (
            <div style={{ paddingBottom: 22 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,280px),1fr))", gap: 12 }}>
                {NORMATIVA.map((n, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(232,184,75,0.1)", borderRadius: 8, padding: "13px 15px" }}>
                    <p style={{ margin: "0 0 5px", fontWeight: 700, fontSize: 12, color: C.gold }}>{n.titulo}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#7a8aa4", lineHeight: 1.65 }}>{n.texto}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Header */}
      <header style={{ ...S.header, borderBottomColor: "rgba(232,184,75,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#e8b84b,#c9952a)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#07090f" }}>⚔</div>
          <span style={{ fontSize: "clamp(13px,3vw,17px)", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.gold }}>TournamentOS</span>
        </div>
        <button className="btn-h" style={{ ...S.btn(C.gold), color: "#07090f", padding: "8px 18px", fontSize: 11, transition: "opacity .15s, transform .1s" }} onClick={onLogin}>Entrar →</button>
      </header>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "clamp(36px,7vw,72px) clamp(16px,4vw,24px) clamp(28px,5vw,52px)", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(232,184,75,0.06) 0%, transparent 70%)", position: "relative", overflow: "hidden" }}>
        <p style={{ fontSize: 10, letterSpacing: 5, textTransform: "uppercase", color: C.gold, marginBottom: 14 }}>Plataforma de torneos</p>
        <h1 style={{ fontSize: "clamp(26px,6vw,48px)", fontWeight: 700, margin: "0 0 16px", lineHeight: 1.1 }}>Torneos de<br />FIFA Clubes Pro</h1>
        <p style={{ color: C.muted, fontSize: "clamp(13px,2vw,15px)", maxWidth: 460, margin: "0 auto 30px" }}>Sigue la clasificación en tiempo real, consulta los resultados e inscríbete para competir.</p>
        <button className="btn-h" style={{ ...S.btn(C.gold), color: "#07090f", padding: "13px 32px", fontSize: 12, transition: "opacity .15s, transform .1s" }} onClick={onLogin}>Registrarse y competir →</button>
      </div>

      <main style={S.main}>
        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 28, overflowX: "auto" }}>
          {["torneos", "noticias", "palmares"].map(t => (
            <button key={t} style={{ ...S.tab(tab === t, C.gold) }} onClick={() => setTab(t)}>
              {t === "torneos" ? `Torneos (${activeTournaments.length})` : t === "noticias" ? `Noticias${news.length ? ` (${news.length})` : ""}` : "🏆 Palmarés"}
            </button>
          ))}
        </div>

        {/* TORNEOS */}
        {tab === "torneos" && (
          activeTournaments.length === 0 ? (
            <div style={{ border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 10, padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎮</div>
              <p style={{ color: C.faint, marginBottom: 16 }}>No hay torneos activos ahora mismo.</p>
              <button className="btn-h" style={{ ...S.btn(C.gold), color: "#07090f", transition: "opacity .15s, transform .1s" }} onClick={onLogin}>Inicia sesión para estar al tanto</button>
            </div>
          ) : activeTournaments.map(t => {
            const isExpanded = expandedTId === t.id;
            const hasGroups = t.groups?.length > 0;
            const hasElim = t.eliminationRounds?.length > 0;
            return (
              <div key={t.id} className="hover-card" style={{ ...S.card, transition: "border-color .15s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "start", flex: 1 }}>
                    <div style={{ width: 46, height: 46, background: "rgba(232,184,75,0.1)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🎮</div>
                    <div>
                      <h3 style={{ margin: "0 0 5px", fontSize: "clamp(15px,3vw,18px)", fontWeight: 700 }}>{t.name}</h3>
                      <p style={{ margin: "0 0 8px", color: C.muted, fontSize: 12 }}>{t.format} · {t.legs > 1 ? "Doble vuelta" : "Una vuelta"} · {t.teams?.length || 0} equipos</p>
                      {t.description && <p style={{ margin: "0 0 8px", fontSize: 13, color: "#7a8aa4" }}>{t.description}</p>}
                      <span style={S.tag(statusColor[t.status] || "#6b7a90")}>{t.status}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(hasGroups || hasElim) && (
                      <button style={S.btnSm} onClick={() => setExpandedTId(isExpanded ? null : t.id)}>{isExpanded ? "Ocultar ▲" : "Ver clasificación ▼"}</button>
                    )}
                    <button className="btn-h" style={{ ...S.btn(C.gold), color: "#07090f", padding: "7px 14px", fontSize: 10, transition: "opacity .15s, transform .1s" }} onClick={onLogin}>Inscribirse</button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 22, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 22 }}>
                    {hasGroups && (
                      <div style={{ marginBottom: 22 }}>
                        <p style={{ ...S.sectionTitle }}>Clasificación de grupos</p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,260px),1fr))", gap: 18 }}>
                          {t.groups.map((g, gi) => (
                            <div key={gi}>
                              <p style={{ ...S.label, color: C.gold, marginBottom: 8 }}>Grupo {g.name}</p>
                              <div style={{ overflowX: "auto" }}>
                                <table style={{ minWidth: 220 }}>
                                  <thead><tr>{["#", "Equipo", "PJ", "PTS", "DG"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                                  <tbody>
                                    {g.standings.map((s, si) => (
                                      <tr key={s.name} style={{ background: si < (t.qualify || 2) && t.format === "Grupos + Eliminatoria" ? "rgba(79,142,247,0.05)" : "transparent" }}>
                                        <td style={{ ...S.td, color: si < (t.qualify || 2) && t.format === "Grupos + Eliminatoria" ? C.blue : C.faint }}>{si + 1}</td>
                                        <td style={S.td}><TRow name={s.name} size={20} /></td>
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
                                  <div key={mi} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", fontSize: 12 }}>
                                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                                      <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={18} />
                                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: m.played && m.scoreA > m.scoreB ? 700 : 400 }}>{m.teamA}</span>
                                    </div>
                                    {m.played ? <span style={{ fontWeight: 700, letterSpacing: 2, color: C.gold, flexShrink: 0 }}>{m.scoreA}—{m.scoreB}</span> : <span style={{ color: C.faint, flexShrink: 0 }}>vs</span>}
                                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", overflow: "hidden" }}>
                                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: m.played && m.scoreB > m.scoreA ? 700 : 400 }}>{m.teamB}</span>
                                      <TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={18} />
                                    </div>
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
                        <p style={S.sectionTitle}>Cuadro eliminatorio</p>
                        {t.eliminationRounds.map((round, ri) => (
                          <div key={ri} style={{ marginBottom: 16 }}>
                            <p style={{ ...S.label, color: C.gold, marginBottom: 8 }}>{getRoundName(t.eliminationRounds.length, ri)}</p>
                            {round.matches.map((m, mi) => (
                              <div key={mi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "rgba(255,255,255,0.015)", borderRadius: 7, marginBottom: 6 }}>
                                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, fontWeight: m.winner === m.teamA ? 700 : 400, color: m.winner === m.teamA ? C.blue : C.text, overflow: "hidden" }}>
                                  <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={22} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{m.teamA}</span>
                                </div>
                                {m.winner ? <span style={{ fontWeight: 700, letterSpacing: 3, color: C.blue, flexShrink: 0 }}>{m.scoreA}—{m.scoreB}</span> : <span style={{ color: C.faint, fontSize: 11, flexShrink: 0 }}>pdte</span>}
                                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end", fontWeight: m.winner === m.teamB ? 700 : 400, color: m.winner === m.teamB ? C.blue : C.text, overflow: "hidden" }}>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{m.teamB}</span>
                                  <TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={22} />
                                </div>
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
          })
        )}

        {/* NOTICIAS */}
        {tab === "noticias" && (
          <>
            <h2 style={{ fontSize: "clamp(18px,4vw,24px)", fontWeight: 700, margin: "0 0 20px" }}>Noticias</h2>
            {news.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 10, padding: 48, textAlign: "center", color: C.faint }}>No hay noticias publicadas.</div>
            ) : news.map(n => (
              <div key={n.id} className="hover-card" style={{ ...S.card, cursor: "pointer", transition: "border-color .15s" }} onClick={() => setExpandedNews(expandedNews === n.id ? null : n.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={S.tag(catColor[n.category] || C.blue)}>{n.category}</span>
                    <h3 style={{ margin: 0, fontSize: "clamp(14px,3vw,16px)", fontWeight: 700 }}>{n.title}</h3>
                  </div>
                  <span style={{ color: C.faint, fontSize: 16, flexShrink: 0 }}>{expandedNews === n.id ? "▲" : "▼"}</span>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: C.faint }}>{new Date(n.createdAt).toLocaleDateString("es-ES")}</p>
                {expandedNews === n.id && <p style={{ margin: "12px 0 0", fontSize: 14, color: "#8a9ab4", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{n.body}</p>}
              </div>
            ))}
          </>
        )}

        {/* PALMARES */}
        {tab === "palmares" && (
          <>
            <h2 style={{ fontSize: "clamp(18px,4vw,24px)", fontWeight: 700, margin: "0 0 20px" }}>🏆 Palmarés</h2>
            {palmares.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 10, padding: 48, textAlign: "center", color: C.faint }}>Aún no hay torneos finalizados.</div>
            ) : (
              <>
                {(() => {
                  const counts = {};
                  palmares.forEach(t => { counts[t.winner] = (counts[t.winner] || 0) + 1; });
                  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                  return (
                    <div style={{ ...S.card, marginBottom: 22 }}>
                      <p style={S.label}>Ranking de campeones</p>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ minWidth: 240 }}>
                          <thead><tr>{["#", "Equipo", "Títulos"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                          <tbody>
                            {sorted.map(([name, count], i) => (
                              <tr key={name}>
                                <td style={{ ...S.td, color: i === 0 ? C.gold : C.faint }}>{i === 0 ? "👑" : i + 1}</td>
                                <td style={S.td}><TRow name={name} size={24} /></td>
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
                      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>{t.name}</h3>
                      <p style={{ margin: 0, color: C.muted, fontSize: 11 }}>{t.format} · {t.teams?.length} equipos · {new Date(t.createdAt).toLocaleDateString("es-ES")}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <TeamLogo name={t.winner} logoUrl={logoMap[t.winner]} size={36} />
                      <div style={{ textAlign: "right" }}>
                        <p style={{ margin: "0 0 2px", color: C.gold, fontWeight: 700, fontSize: 14 }}>{t.winner}</p>
                        <p style={{ margin: 0, color: C.faint, fontSize: 11 }}>Campeón</p>
                      </div>
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
