import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { C, S, statusColor, getRoundName, TeamLogo, BottomNav, formatDatetime, isTournamentActive, TOURNAMENT_TYPES } from "../shared.jsx";
import MatchesPanel from "./MatchesPanel.jsx";
import RankingPanel from "./RankingPanel.jsx";
import { NormativaView } from "./NormativaPanel.jsx";

const TABS = [
  { id: "torneos",   icon: "🎮", label: "Torneos" },
  { id: "partidos",  icon: "⚽", label: "Partidos" },
  { id: "ranking",   icon: "📊", label: "Ranking" },
  { id: "noticias",  icon: "📰", label: "Noticias" },
  { id: "normativa", icon: "📋", label: "Normas" },
];

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function formatDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  catch { return iso; }
}

export default function PublicPage({ onLogin }) {
  const [tournaments, setTournaments] = useState([]);
  const [news, setNews] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [tab, setTab] = useState("torneos");
  const [tourneySubTab, setTourneySubTab] = useState("activos");
  const [expandedTId, setExpandedTId] = useState(null);
  const [expandedNews, setExpandedNews] = useState(null);
  const now = new Date();
  const [histMonth, setHistMonth] = useState(now.getMonth());
  const [histYear, setHistYear] = useState(now.getFullYear());
  const [histSearch, setHistSearch] = useState("");

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")), snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(query(collection(db, "news"), orderBy("createdAt", "desc")), snap => setNews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u3 = onSnapshot(query(collection(db, "inscriptions"), orderBy("createdAt", "desc")), snap => setInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); u3(); };
  }, []);

  const logoMap = {};
  inscriptions.forEach(i => { if (i.teamName && i.logoUrl) logoMap[i.teamName] = i.logoUrl; });

  const activeTournaments  = tournaments.filter(isTournamentActive);
  const historyTournaments = tournaments.filter(t => !isTournamentActive(t));
  const filteredHistory = historyTournaments.filter(t => {
    const d = new Date(t.finishedAt || t.createdAt);
    return d.getMonth() === histMonth && d.getFullYear() === histYear && (!histSearch || t.name.toLowerCase().includes(histSearch.toLowerCase()));
  });
  const availableYears = [...new Set(historyTournaments.map(t => new Date(t.finishedAt || t.createdAt).getFullYear()))].sort((a, b) => b - a);

  function TRow({ name, size = 22 }) {
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}><TeamLogo name={name} logoUrl={logoMap[name]} size={size} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span></span>;
  }

  function TournamentCard({ t }) {
    const ttype = TOURNAMENT_TYPES[t.tournamentType] || TOURNAMENT_TYPES.rapido;
    const isExpanded = expandedTId === t.id;
    const hasGroups = t.groups?.length > 0;
    const hasElim   = t.eliminationRounds?.length > 0;
    return (
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "start", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 44, height: 44, background: `${ttype.color}14`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{ttype.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>{t.name}</h3>
            <p style={{ margin: "0 0 4px", color: C.muted, fontSize: 12 }}>{t.format} · {t.legs > 1 ? "2 vueltas" : "1 vuelta"} · {t.teams?.length || 0} equipos</p>
            {t.startDate && <p style={{ margin: "0 0 5px", fontSize: 12, color: C.blue }}>📅 {formatDate(t.startDate)}</p>}
            {t.winner && <p style={{ margin: "0 0 5px", color: C.gold, fontSize: 12 }}>🏆 <TRow name={t.winner} size={16} /></p>}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={S.tag(statusColor[t.status] || "#6b7a90")}>{t.status}</span>
              <span style={{ fontSize: 9, color: ttype.color, letterSpacing: 1, textTransform: "uppercase", padding: "3px 0" }}>{ttype.label}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {t.status === "Abierto" && (
            <button style={{ ...S.btnInline(C.gold), flex: 1 }} onClick={onLogin}>
              Inscribirse →
            </button>
          )}
          {(hasGroups || hasElim) && (
            <button style={{ ...S.btnSm, flex: 1 }} onClick={() => setExpandedTId(isExpanded ? null : t.id)}>
              {isExpanded ? "Ocultar ▲" : "Ver clasificación ▼"}
            </button>
          )}
        </div>

        {isExpanded && (
          <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 16 }}>
            {hasGroups && t.groups.map((g, gi) => (
              <div key={gi} style={{ marginBottom: 16 }}>
                <p style={{ ...S.sectionTitle, color: C.gold }}>Grupo {g.name}</p>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ minWidth: 240 }}>
                    <thead><tr>{["", "Equipo", "PJ", "PTS", "DG"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>{g.standings.map((s, si) => (
                      <tr key={s.name} style={{ background: si < (t.qualify || 2) && t.format === "Grupos + Eliminatoria" ? "rgba(79,142,247,0.06)" : "transparent" }}>
                        <td style={{ ...S.td, color: C.faint, width: 24 }}>{si + 1}</td>
                        <td style={S.td}><TRow name={s.name} size={20} /></td>
                        <td style={{ ...S.td, textAlign: "center" }}>{s.pj}</td>
                        <td style={{ ...S.td, fontWeight: 700, textAlign: "center" }}>{s.pts}</td>
                        <td style={{ ...S.td, color: s.gd >= 0 ? C.green : C.red, textAlign: "center" }}>{s.gd > 0 ? "+" : ""}{s.gd}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            ))}
            {hasElim && t.eliminationRounds.map((round, ri) => (
              <div key={ri} style={{ marginBottom: 14 }}>
                <p style={{ ...S.sectionTitle, color: C.gold }}>{getRoundName(t.eliminationRounds.length, ri)}</p>
                {round.matches.map((m, mi) => (
                  <div key={mi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 5 }}>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}><TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={22} /><span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span></div>
                    <div style={{ minWidth: 50, textAlign: "center" }}>{m.matchStatus === "validado" ? <span style={{ fontWeight: 700, color: C.gold, fontSize: 14 }}>{m.scoreA}–{m.scoreB}</span> : <span style={{ color: C.faint, fontSize: 11 }}>pdte</span>}</div>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end", minWidth: 0 }}><span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span><TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={22} /></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const catColor = { Noticia: C.blue, Resultado: C.green, Convocatoria: C.gold, Aviso: C.red };

  return (
    <div style={S.wrap}>
      <style>{`*{box-sizing:border-box;}table{border-collapse:collapse;width:100%;}body{overscroll-behavior-y:contain;}`}</style>

      <header style={{ ...S.topBar, borderBottomColor: "rgba(232,184,75,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#e8b84b,#c9952a)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: "#07090f" }}>⚔</div>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.gold }}>TournamentOS</span>
        </div>
        <button onClick={onLogin} style={{ ...S.btnInline(C.gold), padding: "9px 16px", fontSize: 11 }}>Entrar →</button>
      </header>

      <main style={S.main}>

        {tab === "torneos" && (
          <>
            <div style={{ display: "flex", gap: 0, marginBottom: 20, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
              {[["activos", `Torneos activos (${activeTournaments.length})`], ["historial", "Historial"]].map(([id, label]) => (
                <button key={id} onClick={() => setTourneySubTab(id)} style={{ flex: 1, padding: "12px 8px", background: tourneySubTab === id ? "rgba(232,184,75,0.1)" : "transparent", border: "none", borderRight: id === "activos" ? "1px solid rgba(255,255,255,0.08)" : "none", color: tourneySubTab === id ? C.gold : C.muted, cursor: "pointer", fontSize: 12, fontWeight: tourneySubTab === id ? 700 : 400, fontFamily: "'Georgia',serif", letterSpacing: 1 }}>{label}</button>
              ))}
            </div>

            {tourneySubTab === "activos" && (
              activeTournaments.length === 0
                ? <div style={{ ...S.card, textAlign: "center", padding: 48 }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🎮</div>
                    <p style={{ color: C.muted, marginBottom: 16 }}>No hay torneos activos</p>
                    <button style={S.btn(C.gold)} onClick={onLogin}>Regístrate para competir →</button>
                  </div>
                : activeTournaments.map(t => <TournamentCard key={t.id} t={t} />)
            )}

            {tourneySubTab === "historial" && (
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <select style={{ ...S.select, flex: 1, padding: "10px 12px", fontSize: 14 }} value={histMonth} onChange={e => setHistMonth(+e.target.value)}>
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                  <select style={{ ...S.select, width: 90, padding: "10px 12px", fontSize: 14 }} value={histYear} onChange={e => setHistYear(+e.target.value)}>
                    {(availableYears.length ? availableYears : [now.getFullYear()]).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <input style={{ ...S.input, marginBottom: 12, fontSize: 14 }} placeholder="Buscar por nombre..." value={histSearch} onChange={e => setHistSearch(e.target.value)} />
                {filteredHistory.length === 0
                  ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: C.faint }}>No hay torneos en {MONTHS[histMonth]} {histYear}.</div>
                  : filteredHistory.map(t => <TournamentCard key={t.id} t={t} />)
                }
              </div>
            )}
          </>
        )}

        {tab === "partidos" && (
          <>
            <p style={S.pageTitle}>Partidos</p>
            <p style={S.pageSubtitle}>Resultados en tiempo real</p>
            <MatchesPanel tournaments={tournaments} inscriptions={inscriptions} currentUser={null} isAdmin={false} logoMap={logoMap} myTeamNames={new Set()} />
          </>
        )}

        {tab === "ranking" && (
          <>
            <p style={S.pageTitle}>Ranking ELO</p>
            <p style={S.pageSubtitle}>Clasificación histórica de equipos</p>
            <RankingPanel myTeamId={null} />
          </>
        )}

        {tab === "noticias" && (
          <>
            <p style={S.pageTitle}>Noticias</p>
            <p style={S.pageSubtitle}>{news.length} publicaciones</p>
            {news.length === 0
              ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: C.faint }}>No hay noticias.</div>
              : news.map(n => (
                <div key={n.id} style={{ ...S.card, cursor: "pointer" }} onClick={() => setExpandedNews(expandedNews === n.id ? null : n.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8, marginBottom: 5 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                        <span style={S.tag(catColor[n.category] || C.blue)}>{n.category}</span>
                        <span style={{ fontSize: 10, color: C.faint }}>{new Date(n.createdAt).toLocaleDateString("es-ES")}</span>
                      </div>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{n.title}</h3>
                    </div>
                    <span style={{ color: C.faint, fontSize: 16, flexShrink: 0 }}>{expandedNews === n.id ? "▲" : "▼"}</span>
                  </div>
                  {expandedNews === n.id && <p style={{ margin: "10px 0 0", fontSize: 14, color: "#8a9ab4", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{n.body}</p>}
                </div>
              ))
            }
          </>
        )}

        {tab === "normativa" && (
          <>
            <p style={S.pageTitle}>Normativa</p>
            <p style={S.pageSubtitle}>Reglamento oficial del torneo</p>
            <NormativaView />
            <div style={{ ...S.card, background: "rgba(79,142,247,0.06)", border: "1px solid rgba(79,142,247,0.15)", marginTop: 8, textAlign: "center", padding: 24 }}>
              <p style={{ margin: "0 0 14px", fontSize: 14 }}>¿Listo para competir?</p>
              <button style={S.btn(C.gold)} onClick={onLogin}>Registrarse ahora →</button>
            </div>
          </>
        )}

      </main>

      <BottomNav tabs={TABS} active={tab} onChange={setTab} color={C.gold} />
    </div>
  );
}
