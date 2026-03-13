import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { C, S, statusColor, getRoundName, TeamLogo, BottomNav } from "../shared.jsx";

const catColor = { Noticia: C.blue, Resultado: C.green, Convocatoria: C.gold, Aviso: C.red };

const NORMATIVA = [
  { titulo: "1. Participación", texto: "Todos los equipos deben estar registrados y confirmados antes del inicio." },
  { titulo: "2. Formato", texto: "Los partidos se juegan en FIFA Clubes Pro con la configuración oficial." },
  { titulo: "3. Puntualidad", texto: "10 minutos de margen. El incumplimiento puede suponer derrota por incomparecencia (0-3)." },
  { titulo: "4. Conducta", texto: "Comportamiento deportivo y respetuoso. Las infracciones pueden suponer expulsión." },
  { titulo: "5. Resultados", texto: "Reportados por ambos equipos. En caso de discrepancia, decide la organización." },
  { titulo: "6. Fase de grupos", texto: "Clasificación por puntos (3V/1E/0D), DG y GF. Empate directo en caso de igualdad." },
  { titulo: "7. Eliminatoria", texto: "No se permiten empates. En caso de igualdad se juegan penaltis." },
  { titulo: "8. Modificaciones", texto: "La organización puede modificar el formato en casos excepcionales." },
];

const TABS = [
  { id: "torneos", icon: "🎮", label: "Torneos" },
  { id: "noticias", icon: "📰", label: "Noticias" },
  { id: "palmares", icon: "🏆", label: "Palmarés" },
  { id: "normativa", icon: "📋", label: "Normas" },
];

export default function PublicPage({ onLogin }) {
  const [tournaments, setTournaments] = useState([]);
  const [news, setNews] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [tab, setTab] = useState("torneos");
  const [expandedTId, setExpandedTId] = useState(null);
  const [expandedNews, setExpandedNews] = useState(null);

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
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <TeamLogo name={name} logoUrl={logoMap[name]} size={size} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      </span>
    );
  }

  function MatchRow({ m }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, minWidth: 0, fontWeight: m.played && m.scoreA > m.scoreB ? 700 : 400 }}>
          <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={22} />
          <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
        </div>
        <div style={{ flexShrink: 0, minWidth: 48, textAlign: "center" }}>
          {m.played
            ? <span style={{ fontWeight: 700, fontSize: 15, color: C.gold, letterSpacing: 2 }}>{m.scoreA}–{m.scoreB}</span>
            : <span style={{ fontSize: 11, color: C.faint }}>vs</span>}
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end", minWidth: 0, fontWeight: m.played && m.scoreB > m.scoreA ? 700 : 400 }}>
          <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
          <TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={22} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...S.wrap, paddingBottom: 0 }}>
      <style>{`*{box-sizing:border-box;}table{border-collapse:collapse;width:100%;}body{overscroll-behavior-y:contain;}`}</style>

      {/* Top bar */}
      <header style={S.topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#e8b84b,#c9952a)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "#07090f" }}>⚔</div>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.gold }}>TournamentOS</span>
        </div>
        <button onClick={onLogin} style={{ ...S.btnInline(C.gold), padding: "9px 16px", fontSize: 11 }}>Entrar →</button>
      </header>

      <main style={S.main}>
        {/* TORNEOS */}
        {tab === "torneos" && (
          <>
            <div style={{ marginBottom: 20 }}>
              <p style={S.pageTitle}>Torneos</p>
              <p style={S.pageSubtitle}>FIFA Clubes Pro · {activeTournaments.length} activos</p>
            </div>

            {activeTournaments.length === 0 ? (
              <div style={{ ...S.card, textAlign: "center", padding: "48px 16px" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎮</div>
                <p style={{ color: C.muted, marginBottom: 20 }}>No hay torneos activos</p>
                <button style={S.btn(C.gold)} onClick={onLogin}>Regístrate para competir →</button>
              </div>
            ) : activeTournaments.map(t => {
              const isExpanded = expandedTId === t.id;
              const hasGroups = t.groups?.length > 0;
              const hasElim = t.eliminationRounds?.length > 0;
              return (
                <div key={t.id} style={S.card}>
                  <div style={{ display: "flex", alignItems: "start", gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 44, height: 44, background: "rgba(232,184,75,0.1)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🎮</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t.name}</h3>
                        <span style={S.tag(statusColor[t.status] || "#6b7a90")}>{t.status}</span>
                      </div>
                      <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>{t.format} · {t.legs > 1 ? "2 vueltas" : "1 vuelta"} · {t.teams?.length || 0} equipos</p>
                      {t.description && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#7a8aa4" }}>{t.description}</p>}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    {(hasGroups || hasElim) && (
                      <button style={{ ...S.btnSm, flex: 1 }} onClick={() => setExpandedTId(isExpanded ? null : t.id)}>
                        {isExpanded ? "Ocultar ▲" : "Ver clasificación ▼"}
                      </button>
                    )}
                    <button style={{ ...S.btnInline(C.gold), flex: 1 }} onClick={onLogin}>Inscribirse</button>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 16 }}>
                      {hasGroups && t.groups.map((g, gi) => (
                        <div key={gi} style={{ marginBottom: 20 }}>
                          <p style={{ ...S.sectionTitle, color: C.gold }}>Grupo {g.name}</p>
                          <div style={{ overflowX: "auto", marginBottom: 10 }}>
                            <table style={{ minWidth: 240 }}>
                              <thead><tr>{["", "Equipo", "PJ", "PTS", "DG"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                              <tbody>
                                {g.standings.map((s, si) => (
                                  <tr key={s.name} style={{ background: si < (t.qualify || 2) && t.format === "Grupos + Eliminatoria" ? "rgba(79,142,247,0.06)" : "transparent" }}>
                                    <td style={{ ...S.td, color: C.faint, width: 24 }}>{si + 1}</td>
                                    <td style={S.td}><TRow name={s.name} size={20} /></td>
                                    <td style={{ ...S.td, textAlign: "center" }}>{s.pj}</td>
                                    <td style={{ ...S.td, fontWeight: 700, textAlign: "center" }}>{s.pts}</td>
                                    <td style={{ ...S.td, color: s.gd >= 0 ? C.green : C.red, textAlign: "center" }}>{s.gd > 0 ? "+" : ""}{s.gd}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {g.matches.map((m, mi) => <MatchRow key={mi} m={m} />)}
                        </div>
                      ))}
                      {hasElim && t.eliminationRounds.map((round, ri) => (
                        <div key={ri} style={{ marginBottom: 16 }}>
                          <p style={{ ...S.sectionTitle, color: C.gold }}>{getRoundName(t.eliminationRounds.length, ri)}</p>
                          {round.matches.map((m, mi) => (
                            <div key={mi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 6 }}>
                              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, minWidth: 0, fontWeight: m.winner === m.teamA ? 700 : 400, color: m.winner === m.teamA ? C.blue : C.text }}>
                                <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={24} />
                                <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
                              </div>
                              <div style={{ flexShrink: 0, minWidth: 50, textAlign: "center" }}>
                                {m.winner ? <span style={{ fontWeight: 700, fontSize: 15, color: C.blue, letterSpacing: 2 }}>{m.scoreA}–{m.scoreB}</span> : <span style={{ fontSize: 11, color: C.faint }}>pdte</span>}
                              </div>
                              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end", minWidth: 0, fontWeight: m.winner === m.teamB ? 700 : 400, color: m.winner === m.teamB ? C.blue : C.text }}>
                                <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
                                <TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={24} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
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
            <p style={S.pageTitle}>Noticias</p>
            <p style={S.pageSubtitle}>{news.length} publicaciones</p>
            {news.length === 0
              ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: C.faint }}>No hay noticias publicadas.</div>
              : news.map(n => (
                <div key={n.id} style={{ ...S.card, cursor: "pointer" }} onClick={() => setExpandedNews(expandedNews === n.id ? null : n.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10, marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                        <span style={S.tag(catColor[n.category] || C.blue)}>{n.category}</span>
                        <span style={{ fontSize: 10, color: C.faint }}>{new Date(n.createdAt).toLocaleDateString("es-ES")}</span>
                      </div>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{n.title}</h3>
                    </div>
                    <span style={{ color: C.faint, fontSize: 18, flexShrink: 0, marginTop: 2 }}>{expandedNews === n.id ? "▲" : "▼"}</span>
                  </div>
                  {expandedNews === n.id && <p style={{ margin: "10px 0 0", fontSize: 14, color: "#8a9ab4", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{n.body}</p>}
                </div>
              ))
            }
          </>
        )}

        {/* PALMARES */}
        {tab === "palmares" && (
          <>
            <p style={S.pageTitle}>🏆 Palmarés</p>
            <p style={S.pageSubtitle}>{palmares.length} torneos finalizados</p>
            {palmares.length === 0
              ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: C.faint }}>Aún no hay torneos finalizados.</div>
              : (
                <>
                  {(() => {
                    const counts = {};
                    palmares.forEach(t => { counts[t.winner] = (counts[t.winner] || 0) + 1; });
                    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                    return (
                      <div style={{ ...S.card, marginBottom: 16 }}>
                        <p style={{ ...S.label, marginBottom: 12 }}>Ranking de campeones</p>
                        {sorted.map(([name, count], i) => (
                          <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                            <span style={{ fontSize: i === 0 ? 20 : 14, color: i === 0 ? C.gold : C.faint, minWidth: 28, textAlign: "center" }}>{i === 0 ? "👑" : i + 1}</span>
                            <TeamLogo name={name} logoUrl={logoMap[name]} size={34} />
                            <span style={{ flex: 1, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? C.gold : C.text, fontSize: 14 }}>{name}</span>
                            <span style={{ color: C.gold, fontSize: 13 }}>{"🏆".repeat(Math.min(count, 4))} {count}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  {palmares.map(t => (
                    <div key={t.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 14 }}>
                      <TeamLogo name={t.winner} logoUrl={logoMap[t.winner]} size={44} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: "0 0 3px", fontWeight: 700, fontSize: 14, color: C.gold, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.winner}</p>
                        <p style={{ margin: "0 0 2px", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</p>
                        <p style={{ margin: 0, color: C.faint, fontSize: 11 }}>{t.format} · {new Date(t.createdAt).toLocaleDateString("es-ES")}</p>
                      </div>
                      <span style={{ fontSize: 24, flexShrink: 0 }}>🏆</span>
                    </div>
                  ))}
                </>
              )}
          </>
        )}

        {/* NORMATIVA */}
        {tab === "normativa" && (
          <>
            <p style={S.pageTitle}>Normativa</p>
            <p style={S.pageSubtitle}>Reglamento oficial del torneo</p>
            {NORMATIVA.map((n, i) => (
              <div key={i} style={S.card}>
                <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 14, color: C.gold }}>{n.titulo}</p>
                <p style={{ margin: 0, fontSize: 13, color: "#8a9ab4", lineHeight: 1.65 }}>{n.texto}</p>
              </div>
            ))}
            <div style={{ ...S.card, background: "rgba(79,142,247,0.06)", border: "1px solid rgba(79,142,247,0.2)", marginTop: 20, textAlign: "center", padding: 24 }}>
              <p style={{ margin: "0 0 14px", fontSize: 14, color: C.text }}>¿Listo para competir?</p>
              <button style={S.btn(C.gold)} onClick={onLogin}>Regístrate ahora →</button>
            </div>
          </>
        )}
      </main>

      <BottomNav tabs={TABS} active={tab} onChange={setTab} color={C.gold} />
    </div>
  );
}
