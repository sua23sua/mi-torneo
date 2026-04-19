import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, query, where, onSnapshot, orderBy, doc } from "firebase/firestore";
import { useAuth } from "../AuthContext";
import { C, S, statusColor, getRoundName, TeamLogo, ResponsiveNav, formatDatetime, isTournamentActive, TOURNAMENT_TYPES, useIsMobile } from "../shared.jsx";
import MatchesPanel from "./MatchesPanel.jsx";
import RankingPanel from "./RankingPanel.jsx";
import TeamManager from "./TeamManager.jsx";
import PlayerProfile from "./PlayerProfile.jsx";
import { NormativaView } from "./NormativaPanel.jsx";

const TABS = [
  { id: "torneos",   icon: "🎮", label: "Torneos" },
  { id: "partidos",  icon: "⚽", label: "Partidos" },
  { id: "ranking",   icon: "📊", label: "Ranking" },
  { id: "equipo",    icon: "🛡",  label: "Mi equipo" },
  { id: "jugador",   icon: "👤", label: "Jugador" },
  { id: "normativa", icon: "📋", label: "Normas" },
];

function formatDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  catch { return iso; }
}

function getTournamentSummary(tournament, teamName) {
  if (!tournament) return null;
  const ttype = TOURNAMENT_TYPES[tournament.tournamentType] || TOURNAMENT_TYPES.rapido;
  let pj = 0, pg = 0, pe = 0, pp = 0, gf = 0, gc = 0;
  const allMatches = [
    ...(tournament.groups || []).flatMap(g => g.matches || []),
    ...(tournament.eliminationRounds || []).flatMap(r => r.matches || []),
    ...(tournament.swissCups || []).flatMap(c => c.rounds?.flatMap(r => r.matches || []) || []),
    ...(tournament.divisions || []).flatMap(d => d.groups?.flatMap(g => g.matches || []) || []),
  ];
  allMatches.forEach(m => {
    if (m.matchStatus !== "validado") return;
    if (m.teamA === teamName || m.teamB === teamName) {
      const isA = m.teamA === teamName;
      const myScore = isA ? m.scoreA : m.scoreB, theirScore = isA ? m.scoreB : m.scoreA;
      pj++; gf += myScore; gc += theirScore;
      if (myScore > theirScore) pg++;
      else if (myScore === theirScore) pe++;
      else pp++;
    }
  });
  let groupPos = null, groupName = null, groupTotal = null;
  const allGroups = [...(tournament.groups || []), ...(tournament.divisions || []).flatMap(d => d.groups || [])];
  for (const g of allGroups) {
    const idx = g.standings?.findIndex(s => s.name === teamName);
    if (idx !== undefined && idx !== -1) { groupPos = idx + 1; groupName = g.name; groupTotal = g.standings.length; break; }
  }
  let elimResult = null;
  const allElimRounds = [...(tournament.eliminationRounds || []), ...(tournament.swissCups || []).flatMap(c => c.rounds?.map(r => ({ ...r, cupName: c.name })) || [])];
  for (let ri = allElimRounds.length - 1; ri >= 0; ri--) {
    const round = allElimRounds[ri];
    const match = round.matches?.find(m => m.teamA === teamName || m.teamB === teamName);
    if (match) {
      const roundName = round.cupName ? `Copa ${round.cupName}` : getRoundName(tournament.eliminationRounds?.length || 1, ri);
      if (match.winner === teamName) elimResult = tournament.winner === teamName ? "🏆 Campeón" : `✓ ${roundName}`;
      else if (match.winner) elimResult = `Eliminado en ${roundName}`;
      break;
    }
  }
  return { pj, pg, pe, pp, gf, gc, gd: gf - gc, groupPos, groupName, groupTotal, elimResult, isChampion: tournament.winner === teamName, ttype };
}

export default function UserDashboard({ onLogout }) {
  const { user, profile } = useAuth();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("torneos");
  const [tournaments, setTournaments] = useState([]);
  const [myInscriptions, setMyInscriptions] = useState([]);
  const [allInscriptions, setAllInscriptions] = useState([]);
  const [myTeam, setMyTeam] = useState(null);
  const [expandedTId, setExpandedTId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [notif, setNotif] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [inscForm, setInscForm] = useState({ managerId: "", phone: "", twitter: "" });

  function showNotif(msg) { setNotif(msg); setTimeout(() => setNotif(null), 3000); }

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")), snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(query(collection(db, "inscriptions"), orderBy("createdAt", "desc")), snap => setAllInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, "inscriptions"), where("userId", "==", user.uid)), snap => setMyInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);

  useEffect(() => {
    if (!profile?.teamId) { setMyTeam(null); return; }
    return onSnapshot(doc(db, "teams", profile.teamId), snap => {
      if (snap.exists()) setMyTeam({ id: snap.id, ...snap.data() });
      else setMyTeam(null);
    });
  }, [profile?.teamId]);

  const logoMap = {};
  allInscriptions.forEach(i => { if (i.teamName && i.logoUrl) logoMap[i.teamName] = i.logoUrl; });
  if (myTeam?.name && myTeam?.logoUrl) logoMap[myTeam.name] = myTeam.logoUrl;

  function getRivalPhone(tournamentId, rivalTeamName) {
    const t = tournaments.find(t => t.id === tournamentId);
    if (!t || t.status !== "En curso") return null;
    const insc = allInscriptions.find(i => i.tournamentId === tournamentId && i.teamName === rivalTeamName && i.status === "aprobada");
    return insc?.phone || null;
  }

  function openInscModal(t) { setSelectedTournament(t); setInscForm({ managerId: "", phone: "", twitter: "" }); setShowModal(true); }

  async function inscribirse() {
    if (!myTeam) return showNotif("Primero crea tu equipo en 'Mi equipo'");
    if (!inscForm.managerId.trim()) return showNotif("Introduce el ID Manager");
    if (!inscForm.phone.trim()) return showNotif("Introduce un teléfono de contacto");
    if (myInscriptions.find(i => i.tournamentId === selectedTournament.id)) return showNotif("Ya estás inscrito");
    setUploading(true);
    try {
      await addDoc(collection(db, "inscriptions"), { tournamentId: selectedTournament.id, tournamentName: selectedTournament.name, userId: user.uid, userName: profile?.name || user.email, teamId: myTeam.id, teamName: myTeam.name, logoUrl: myTeam.logoUrl || null, managerId: inscForm.managerId.trim(), phone: inscForm.phone.trim(), twitter: inscForm.twitter.trim(), status: "pendiente", createdAt: new Date().toISOString() });
      setShowModal(false); showNotif("Solicitud enviada ✓");
    } catch { showNotif("Error al enviar."); }
    setUploading(false);
  }

  function TRow({ name, size = 22 }) {
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}><TeamLogo name={name} logoUrl={logoMap[name]} size={size} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span></span>;
  }

  const activeTournaments = tournaments.filter(isTournamentActive);
  const myTeamNames = new Set(myInscriptions.filter(i => i.status === "aprobada").map(i => i.teamName));
  const pendingMyMatches = tournaments.flatMap(t => {
    if (t.status !== "En curso") return [];
    return [
      ...(t.groups || []).flatMap(g => g.matches || []),
      ...(t.eliminationRounds || []).flatMap(r => r.matches || []),
      ...(t.swissCups || []).flatMap(c => c.rounds?.flatMap(r => r.matches || []) || []),
      ...(t.divisions || []).flatMap(d => d.groups?.flatMap(g => g.matches || []) || []),
    ].filter(m => (myTeamNames.has(m.teamA) || myTeamNames.has(m.teamB)) && (m.matchStatus || "pendiente") !== "validado");
  }).length;

  const navTabs = TABS.map(t => ({ ...t, badge: t.id === "partidos" && pendingMyMatches > 0 ? pendingMyMatches : 0 }));

  const rightContent = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {myTeam && <TeamLogo name={myTeam.name} logoUrl={myTeam.logoUrl} size={26} />}
      <span style={{ fontSize: 12, color: C.muted, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.name || user?.email}</span>
      <button style={S.btnSm} onClick={onLogout}>Salir</button>
    </div>
  );

  return (
    <div style={S.wrap}>
      {notif && <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", width: "min(90vw, 420px)", background: C.gold, color: "#07090f", padding: "13px 16px", zIndex: 1000, fontSize: 13, fontFamily: "'Georgia',serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", borderRadius: 10, textAlign: "center", fontWeight: 600 }}>{notif}</div>}

      {showModal && selectedTournament && (
        <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: 300, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ ...S.topBar, position: "relative", flexShrink: 0 }}>
            <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: "'Georgia',serif", fontSize: 13, padding: 0 }}>← Cancelar</button>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Inscribirse</span>
            <div style={{ width: 80 }} />
          </div>
          <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 40px", flex: 1, width: "100%" }}>
            <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 15 }}>{selectedTournament.name}</p>
            {selectedTournament.startDate && <p style={{ margin: "0 0 16px", fontSize: 12, color: C.blue }}>📅 {formatDate(selectedTournament.startDate)}</p>}
            {!myTeam ? (
              <div style={{ ...S.card, background: "rgba(247,111,111,0.08)", border: "1px solid rgba(247,111,111,0.2)", textAlign: "center", padding: 24 }}>
                <p style={{ margin: "0 0 12px", color: C.red, fontSize: 14 }}>Necesitas crear tu equipo primero</p>
                <button style={S.btn(C.blue)} onClick={() => { setShowModal(false); setTab("equipo"); }}>Crear mi equipo →</button>
              </div>
            ) : (
              <>
                {selectedTournament.whatsappLink && (
                  <a href={selectedTournament.whatsappLink} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.2)", borderRadius: 10, textDecoration: "none", color: C.text, marginBottom: 20 }}>
                    <span style={{ fontSize: 20 }}>💬</span><div><p style={{ margin: "0 0 1px", fontSize: 13, fontWeight: 600, color: "#25d366" }}>Grupo de WhatsApp</p></div><span style={{ marginLeft: "auto", color: C.faint }}>→</span>
                  </a>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 10, marginBottom: 20 }}>
                  <TeamLogo name={myTeam.name} logoUrl={myTeam.logoUrl} size={44} />
                  <div><p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 15 }}>{myTeam.name}</p><p style={{ margin: 0, fontSize: 12, color: C.muted }}>Tu equipo</p></div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div><label style={S.label}>ID Manager *</label><input style={S.input} placeholder="Tu ID de FIFA" value={inscForm.managerId} onChange={e => setInscForm(p => ({ ...p, managerId: e.target.value }))} /></div>
                  <div><label style={S.label}>Teléfono *</label><input style={S.input} type="tel" placeholder="+34 600 000 000" value={inscForm.phone} onChange={e => setInscForm(p => ({ ...p, phone: e.target.value }))} /></div>
                  <div><label style={S.label}>X (opcional)</label><input style={S.input} placeholder="@tunombre" value={inscForm.twitter} onChange={e => setInscForm(p => ({ ...p, twitter: e.target.value }))} /></div>
                  <button style={{ ...S.btn(C.gold), opacity: uploading ? 0.6 : 1 }} onClick={inscribirse} disabled={uploading}>{uploading ? "Enviando..." : "Enviar solicitud →"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`*{box-sizing:border-box;}input:focus,select:focus,textarea:focus{outline:none;border-color:#e8b84b!important;}input::placeholder,textarea::placeholder{color:rgba(200,212,228,0.2)!important;}table{border-collapse:collapse;width:100%;}body{overscroll-behavior-y:contain;}`}</style>

      {/* Responsive nav */}
      <ResponsiveNav tabs={navTabs} active={tab} onChange={setTab} color={C.gold} rightContent={rightContent} />

      {/* Mobile-only sticky header */}
      {isMobile && (
        <header style={{ ...S.topBar, borderBottomColor: "rgba(232,184,75,0.12)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#e8b84b,#c9952a)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#07090f" }}>⚔</div>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.gold }}>TournamentOS</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {myTeam && <TeamLogo name={myTeam.name} logoUrl={myTeam.logoUrl} size={26} />}
            <span style={{ fontSize: 11, color: C.muted, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.name || user?.email}</span>
            <button style={S.btnSm} onClick={onLogout}>Salir</button>
          </div>
        </header>
      )}

      <main style={S.main(isMobile)}>

        {tab === "torneos" && (
          <>
            <p style={S.pageTitle}>Torneos</p>
            <p style={S.pageSubtitle}>FIFA Clubes Pro · {activeTournaments.length} activos</p>
            {!myTeam && (
              <div style={{ ...S.card, background: "rgba(232,184,75,0.06)", border: "1px solid rgba(232,184,75,0.2)", marginBottom: 16 }}>
                <p style={{ margin: "0 0 8px", fontSize: 13, color: C.gold, fontWeight: 700 }}>Aún no tienes equipo</p>
                <p style={{ margin: "0 0 12px", fontSize: 12, color: C.muted }}>Crea tu equipo para inscribirte en torneos.</p>
                <button style={{ ...S.btnInline(C.gold) }} onClick={() => setTab("equipo")}>Crear mi equipo →</button>
              </div>
            )}
            {activeTournaments.length === 0
              ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: C.faint }}>No hay torneos activos.</div>
              : <div style={S.grid(isMobile)}>
                {activeTournaments.map(t => {
                  const myInsc = myInscriptions.find(i => i.tournamentId === t.id);
                  const isInscribed = !!myInsc;
                  const isExpanded = expandedTId === t.id;
                  const hasGroups = t.groups?.length > 0;
                  const hasElim   = t.eliminationRounds?.length > 0;
                  const hasSwiss  = t.swissCups?.length > 0;
                  const hasDivs   = t.divisions?.length > 0;
                  const ttype = TOURNAMENT_TYPES[t.tournamentType] || TOURNAMENT_TYPES.rapido;

                  const myRivals = [];
                  if (t.status === "En curso" && myInsc?.status === "aprobada") {
                    const allMatches = [...(t.groups || []).flatMap(g => g.matches || []), ...(t.eliminationRounds || []).flatMap(r => r.matches || []), ...(t.swissCups || []).flatMap(c => c.rounds?.flatMap(r => r.matches || []) || []), ...(t.divisions || []).flatMap(d => d.groups?.flatMap(g => g.matches || []) || [])];
                    allMatches.forEach(m => {
                      if (myTeamNames.has(m.teamA) && m.teamB !== "BYE") { const phone = getRivalPhone(t.id, m.teamB); if (phone && !myRivals.find(r => r.name === m.teamB)) myRivals.push({ name: m.teamB, phone }); }
                      if (myTeamNames.has(m.teamB) && m.teamA !== "BYE") { const phone = getRivalPhone(t.id, m.teamA); if (phone && !myRivals.find(r => r.name === m.teamA)) myRivals.push({ name: m.teamA, phone }); }
                    });
                  }

                  const formatIcon = { Liga: "🏆", Eliminatoria: "⚔", "Grupos + Eliminatoria": "🎯", Suizo: "🔄", "Liga Divisiones": "🏛" }[t.format] || "🎮";

                  return (
                    <div key={t.id} style={S.card}>
                      <div style={{ display: "flex", alignItems: "start", gap: 12, marginBottom: 12 }}>
                        <div style={{ width: 44, height: 44, background: `${ttype.color}14`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{formatIcon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>{t.name}</h3>
                          <p style={{ margin: "0 0 4px", color: C.muted, fontSize: 12 }}>{t.format} · {t.teams?.length || 0} equipos</p>
                          {t.startDate && <p style={{ margin: "0 0 5px", fontSize: 12, color: C.blue }}>📅 {formatDate(t.startDate)}</p>}
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span style={S.tag(statusColor[t.status] || "#6b7a90")}>{t.status}</span>
                            {myInsc && <span style={S.tag(myInsc.status === "aprobada" ? C.green : myInsc.status === "rechazada" ? C.red : C.gold)}>{myInsc.status === "aprobada" ? "✓ Inscrito" : myInsc.status === "rechazada" ? "Rechazado" : "⏳ Pendiente"}</span>}
                          </div>
                        </div>
                      </div>

                      {isInscribed && t.whatsappLink && (
                        <a href={t.whatsappLink} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(37,211,102,0.07)", border: "1px solid rgba(37,211,102,0.18)", borderRadius: 8, textDecoration: "none", color: C.text, marginBottom: 10 }}>
                          <span style={{ fontSize: 16 }}>💬</span><span style={{ fontSize: 12, color: "#25d366", fontWeight: 600 }}>Grupo de WhatsApp</span><span style={{ marginLeft: "auto", color: C.faint }}>→</span>
                        </a>
                      )}

                      {myRivals.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <p style={{ ...S.label, marginBottom: 8 }}>Contacto de rivales</p>
                          {myRivals.map(rival => (
                            <a key={rival.name} href={`https://wa.me/${rival.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(79,142,247,0.06)", border: "1px solid rgba(79,142,247,0.15)", borderRadius: 8, textDecoration: "none", color: C.text, marginBottom: 6 }}>
                              <TeamLogo name={rival.name} logoUrl={logoMap[rival.name]} size={28} />
                              <div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: "0 0 1px", fontSize: 13, fontWeight: 600 }}>{rival.name}</p><p style={{ margin: 0, fontSize: 11, color: C.muted }}>📞 {rival.phone}</p></div>
                              <span style={{ color: "#25d366", fontSize: 18 }}>💬</span>
                            </a>
                          ))}
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 8 }}>
                        {!myInsc && t.status === "Abierto" && <button style={{ ...S.btnInline(C.gold), flex: 1 }} onClick={() => openInscModal(t)}>Inscribirse</button>}
                        {(hasGroups || hasElim || hasSwiss || hasDivs) && <button style={{ ...S.btnSm, flex: 1 }} onClick={() => setExpandedTId(isExpanded ? null : t.id)}>{isExpanded ? "Ocultar ▲" : "Clasificación ▼"}</button>}
                      </div>

                      {isExpanded && (
                        <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 16 }}>
                          {/* Swiss group */}
                          {t.format === "Suizo" && hasGroups && (
                            <div style={{ marginBottom: 12 }}>
                              <p style={{ ...S.sectionTitle, color: C.blue }}>Clasificación general</p>
                              <div style={{ overflowX: "auto" }}><table><thead><tr>{["#", "Equipo", "PJ", "PTS", "DG"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead><tbody>{(t.groups[0]?.standings || []).map((s, si) => <tr key={s.name}><td style={{ ...S.td, color: C.faint, width: 24 }}>{si + 1}</td><td style={S.td}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><TeamLogo name={s.name} logoUrl={logoMap[s.name]} size={18} /><span style={{ fontSize: 13 }}>{s.name}</span></span></td><td style={{ ...S.td, textAlign: "center" }}>{s.pj}</td><td style={{ ...S.td, fontWeight: 700, textAlign: "center" }}>{s.pts}</td><td style={{ ...S.td, color: s.gd >= 0 ? C.green : C.red, textAlign: "center" }}>{s.gd > 0 ? "+" : ""}{s.gd}</td></tr>)}</tbody></table></div>
                            </div>
                          )}
                          {/* Swiss cups */}
                          {hasSwiss && t.swissCups.map((cup, ci) => (
                            <div key={ci} style={{ marginBottom: 12 }}>
                              <p style={{ ...S.sectionTitle, color: { Oro: C.gold, Plata: "#94a3b8", Bronce: "#b87333" }[cup.name] || C.muted }}>{cup.name === "Oro" ? "🥇" : cup.name === "Plata" ? "🥈" : "🥉"} Copa {cup.name}</p>
                              {cup.rounds?.map((round, ri) => round.matches.map((m, mi) => <div key={mi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 5 }}><div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}><TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={22} /><span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span></div><div style={{ minWidth: 50, textAlign: "center" }}>{m.matchStatus === "validado" ? <span style={{ fontWeight: 700, color: C.gold, fontSize: 14 }}>{m.scoreA}–{m.scoreB}</span> : <span style={{ color: C.faint, fontSize: 11 }}>pdte</span>}</div><div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end", minWidth: 0 }}><span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span><TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={22} /></div></div>))}
                            </div>
                          ))}
                          {/* Divisions */}
                          {hasDivs && t.divisions.map((div, di) => (
                            <div key={di} style={{ marginBottom: 14 }}>
                              <p style={{ ...S.sectionTitle, color: C.purple }}>🏛 {div.name}</p>
                              {div.groups?.map((g, gi) => <div key={gi} style={{ marginBottom: 8 }}>{div.groups.length > 1 && <p style={{ ...S.label, marginBottom: 6, color: C.gold }}>Grupo {g.name}</p>}<div style={{ overflowX: "auto" }}><table><thead><tr>{["#", "Equipo", "PJ", "PTS", "DG"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead><tbody>{g.standings.map((s, si) => <tr key={s.name}><td style={{ ...S.td, color: C.faint, width: 24 }}>{si + 1}</td><td style={S.td}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><TeamLogo name={s.name} logoUrl={logoMap[s.name]} size={18} /><span style={{ fontSize: 13 }}>{s.name}</span></span></td><td style={{ ...S.td, textAlign: "center" }}>{s.pj}</td><td style={{ ...S.td, fontWeight: 700, textAlign: "center" }}>{s.pts}</td><td style={{ ...S.td, color: s.gd >= 0 ? C.green : C.red, textAlign: "center" }}>{s.gd > 0 ? "+" : ""}{s.gd}</td></tr>)}</tbody></table></div></div>)}
                            </div>
                          ))}
                          {/* Standard groups */}
                          {hasGroups && !["Suizo"].includes(t.format) && t.groups.map((g, gi) => (
                            <div key={gi} style={{ marginBottom: 16 }}>
                              <p style={{ ...S.sectionTitle, color: C.gold }}>Grupo {g.name}</p>
                              <div style={{ overflowX: "auto" }}><table><thead><tr>{["", "Equipo", "PJ", "PTS", "DG"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead><tbody>{g.standings.map((s, si) => <tr key={s.name}><td style={{ ...S.td, color: C.faint, width: 24 }}>{si + 1}</td><td style={S.td}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><TeamLogo name={s.name} logoUrl={logoMap[s.name]} size={20} /><span>{s.name}</span></span></td><td style={{ ...S.td, textAlign: "center" }}>{s.pj}</td><td style={{ ...S.td, fontWeight: 700, textAlign: "center" }}>{s.pts}</td><td style={{ ...S.td, color: s.gd >= 0 ? C.green : C.red, textAlign: "center" }}>{s.gd > 0 ? "+" : ""}{s.gd}</td></tr>)}</tbody></table></div>
                            </div>
                          ))}
                          {/* Elim */}
                          {hasElim && t.eliminationRounds.map((round, ri) => (
                            <div key={ri} style={{ marginBottom: 14 }}>
                              <p style={{ ...S.sectionTitle, color: C.gold }}>{getRoundName(t.eliminationRounds.length, ri)}</p>
                              {round.matches.map((m, mi) => <div key={mi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 5 }}><div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}><TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={22} /><span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span></div><div style={{ minWidth: 50, textAlign: "center" }}>{m.matchStatus === "validado" ? <span style={{ fontWeight: 700, color: C.gold, fontSize: 14 }}>{m.scoreA}–{m.scoreB}</span> : <span style={{ color: C.faint, fontSize: 11 }}>pdte</span>}</div><div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end", minWidth: 0 }}><span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span><TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={22} /></div></div>)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            }
          </>
        )}

        {tab === "partidos" && (
          <>
            <p style={S.pageTitle}>Partidos</p>
            <p style={S.pageSubtitle}>Reporta tus resultados</p>
            <MatchesPanel tournaments={tournaments} inscriptions={allInscriptions} currentUser={user} isAdmin={false} logoMap={logoMap} myTeamNames={myTeamNames} />
          </>
        )}

        {tab === "ranking" && (
          <>
            <p style={S.pageTitle}>Ranking ELO</p>
            <p style={S.pageSubtitle}>Clasificación histórica de equipos</p>
            <RankingPanel myTeamId={profile?.teamId} />
          </>
        )}

        {tab === "equipo" && (
          <>
            <p style={S.pageTitle}>Mi equipo</p>
            <p style={S.pageSubtitle}>Gestiona tu equipo y sus gestores</p>
            <TeamManager />
            {myInscriptions.length > 0 && (
              <>
                <p style={{ ...S.pageTitle, fontSize: 18, marginTop: 28, marginBottom: 4 }}>Historial de torneos</p>
                <p style={{ ...S.pageSubtitle, marginBottom: 16 }}>{myInscriptions.length} participaciones</p>
                <div style={S.grid(isMobile)}>
                  {myInscriptions.map(i => {
                    const tournament = tournaments.find(t => t.id === i.tournamentId);
                    const summary = tournament ? getTournamentSummary(tournament, i.teamName) : null;
                    const ttype = summary?.ttype || TOURNAMENT_TYPES.rapido;
                    const hasStarted = tournament && (tournament.groups?.length > 0 || tournament.eliminationRounds?.length > 0 || tournament.divisions?.length > 0);
                    return (
                      <div key={i.id} style={{ ...S.card, marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: summary?.pj > 0 ? 12 : 6 }}>
                          <div style={{ width: 36, height: 36, background: `${ttype.color}14`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{ttype.icon}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.tournamentName}</p>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                              {tournament?.startDate && <span style={{ fontSize: 11, color: C.blue }}>📅 {new Date(tournament.startDate).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</span>}
                              <span style={S.tag(tournament ? (statusColor[tournament.status] || "#6b7a90") : C.muted)}>{tournament?.status || "—"}</span>
                            </div>
                          </div>
                          {summary?.isChampion && <span style={{ fontSize: 22 }}>🏆</span>}
                        </div>
                        {tournament?.whatsappLink && i.status !== "rechazada" && (
                          <a href={tournament.whatsappLink} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.15)", borderRadius: 8, textDecoration: "none", color: C.text, marginBottom: summary?.pj > 0 ? 12 : 0 }}>
                            <span style={{ fontSize: 14 }}>💬</span><span style={{ fontSize: 12, color: "#25d366" }}>Grupo de WhatsApp</span><span style={{ marginLeft: "auto", color: C.faint, fontSize: 12 }}>→</span>
                          </a>
                        )}
                        {summary && summary.pj > 0 && (
                          <div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 8 }}>
                              {[["PJ", summary.pj, C.text], ["V", summary.pg, C.green], ["E", summary.pe, C.gold], ["D", summary.pp, C.red]].map(([l, v, c]) => <div key={l} style={{ textAlign: "center", padding: "8px 4px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}><p style={{ margin: "0 0 1px", fontSize: 16, fontWeight: 700, color: c }}>{v}</p><p style={{ margin: 0, fontSize: 9, color: C.faint, letterSpacing: 1 }}>{l}</p></div>)}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                              {[["GF", summary.gf, C.text], ["GC", summary.gc, C.text], ["DG", summary.gd > 0 ? `+${summary.gd}` : summary.gd, summary.gd >= 0 ? C.green : C.red]].map(([l, v, c]) => <div key={l} style={{ textAlign: "center", padding: "6px 4px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}><p style={{ margin: "0 0 1px", fontSize: 13, fontWeight: 600, color: c }}>{v}</p><p style={{ margin: 0, fontSize: 9, color: C.faint, letterSpacing: 1 }}>{l}</p></div>)}
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {summary.groupPos && <div style={{ padding: "6px 12px", background: "rgba(79,142,247,0.08)", border: "1px solid rgba(79,142,247,0.2)", borderRadius: 8 }}><span style={{ fontSize: 12, color: C.blue }}>{summary.groupPos === 1 ? "🥇" : summary.groupPos === 2 ? "🥈" : summary.groupPos === 3 ? "🥉" : `${summary.groupPos}º`} {summary.groupPos}º/{summary.groupTotal}</span></div>}
                              {summary.elimResult && <div style={{ padding: "6px 12px", background: summary.isChampion ? "rgba(232,184,75,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${summary.isChampion ? "rgba(232,184,75,0.3)" : "rgba(255,255,255,0.08)"}`, borderRadius: 8 }}><span style={{ fontSize: 12, color: summary.isChampion ? C.gold : C.text }}>{summary.elimResult}</span></div>}
                            </div>
                          </div>
                        )}
                        {i.status === "aprobada" && !hasStarted && <p style={{ margin: "8px 0 0", fontSize: 12, color: C.faint }}>El torneo aún no ha comenzado</p>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {tab === "jugador" && (
          <>
            <p style={S.pageTitle}>Mi perfil de jugador</p>
            <p style={S.pageSubtitle}>Stats individuales y equipo</p>
            <PlayerProfile logoMap={logoMap} />
          </>
        )}

        {tab === "normativa" && (
          <>
            <p style={S.pageTitle}>Normativa</p>
            <p style={S.pageSubtitle}>Reglamento oficial del torneo</p>
            <NormativaView />
          </>
        )}

      </main>
    </div>
  );
}
