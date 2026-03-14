import { useState, useEffect } from "react";
import { db, storage } from "../firebase";
import { collection, addDoc, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../AuthContext";
import { C, S, statusColor, getRoundName, TeamLogo, BottomNav, formatDatetime, EloBar, eloLabel } from "../shared.jsx";
import MatchesPanel from "./MatchesPanel.jsx";
import RankingPanel from "./RankingPanel.jsx";

const catColor = { Noticia: C.blue, Resultado: C.green, Convocatoria: C.gold, Aviso: C.red };

const NORMATIVA = [
  { titulo: "1. Participación", texto: "Todos los equipos deben estar registrados y confirmados antes del inicio." },
  { titulo: "2. Formato", texto: "Los partidos se juegan en FIFA Clubes Pro con la configuración oficial." },
  { titulo: "3. Puntualidad", texto: "10 minutos de margen. El incumplimiento puede suponer derrota por incomparecencia (0-3)." },
  { titulo: "4. Conducta", texto: "Comportamiento deportivo y respetuoso. Las infracciones pueden suponer expulsión." },
  { titulo: "5. Resultados", texto: "Reportados por ambos equipos. En caso de discrepancia, decide la organización." },
  { titulo: "6. Fase de grupos", texto: "Clasificación por puntos (3V/1E/0D), DG y GF." },
  { titulo: "7. Eliminatoria", texto: "No se permiten empates. En caso de igualdad se juegan penaltis." },
  { titulo: "8. Modificaciones", texto: "La organización puede modificar el formato en casos excepcionales." },
];

const TABS = [
  { id: "torneos", icon: "🎮", label: "Torneos" },
  { id: "partidos", icon: "⚽", label: "Partidos" },
  { id: "ranking", icon: "📊", label: "Ranking" },
  { id: "mis", icon: "👤", label: "Mi equipo" },
  { id: "normativa", icon: "📋", label: "Normas" },
];

export default function UserDashboard({ onLogout }) {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState("torneos");
  const [tournaments, setTournaments] = useState([]);
  const [myInscriptions, setMyInscriptions] = useState([]);
  const [allInscriptions, setAllInscriptions] = useState([]);
  const [news, setNews] = useState([]);
  const [expandedTId, setExpandedTId] = useState(null);
  const [expandedNews, setExpandedNews] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [notif, setNotif] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [inscForm, setInscForm] = useState({ teamName: "", managerId: "", phone: "", twitter: "", logoFile: null, logoPreview: null });

  function showNotif(msg) { setNotif(msg); setTimeout(() => setNotif(null), 3000); }

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")), snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(query(collection(db, "news"), orderBy("createdAt", "desc")), snap => setNews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u3 = onSnapshot(query(collection(db, "inscriptions"), orderBy("createdAt", "desc")), snap => setAllInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); u3(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, "inscriptions"), where("userId", "==", user.uid)), snap => setMyInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);

  const logoMap = {};
  allInscriptions.forEach(i => { if (i.teamName && i.logoUrl) logoMap[i.teamName] = i.logoUrl; });

  // Pre-fill inscription form with user's registered team
  function openInscModal(t) {
    setSelectedTournament(t);
    setInscForm({
      teamName: profile?.teamName || "",
      managerId: "",
      phone: "",
      twitter: "",
      logoFile: null,
      logoPreview: profile?.teamLogo || null,
    });
    setShowModal(true);
  }

  function handleLogoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return showNotif("El escudo no puede superar 2MB");
    setInscForm(p => ({ ...p, logoFile: file, logoPreview: URL.createObjectURL(file) }));
  }

  async function inscribirse() {
    if (!inscForm.teamName.trim()) return showNotif("Escribe el nombre de tu equipo");
    if (!inscForm.managerId.trim()) return showNotif("Introduce el ID Manager");
    if (!inscForm.phone.trim()) return showNotif("Introduce un teléfono de contacto");
    if (myInscriptions.find(i => i.tournamentId === selectedTournament.id)) return showNotif("Ya estás inscrito");
    setUploading(true);
    let logoUrl = inscForm.logoPreview && !inscForm.logoFile ? inscForm.logoPreview : null;
    try {
      if (inscForm.logoFile) {
        const storageRef = ref(storage, `escudos/${user.uid}_${Date.now()}_${inscForm.logoFile.name}`);
        await uploadBytes(storageRef, inscForm.logoFile);
        logoUrl = await getDownloadURL(storageRef);
      }
      await addDoc(collection(db, "inscriptions"), {
        tournamentId: selectedTournament.id, tournamentName: selectedTournament.name,
        userId: user.uid, userName: profile?.name || user.email,
        teamName: inscForm.teamName.trim(), managerId: inscForm.managerId.trim(),
        phone: inscForm.phone.trim(), twitter: inscForm.twitter.trim(),
        logoUrl, status: "pendiente", createdAt: new Date().toISOString(),
      });
      setShowModal(false);
      showNotif("Solicitud enviada ✓");
    } catch (e) { showNotif("Error al enviar. Inténtalo de nuevo."); }
    setUploading(false);
  }

  function TRow({ name, size = 22 }) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <TeamLogo name={name} logoUrl={logoMap[name]} size={size} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      </span>
    );
  }

  const myTeamNames = new Set(myInscriptions.filter(i => i.status === "aprobada").map(i => i.teamName));
  const pendingMyMatches = tournaments.flatMap(t => {
    if (t.status !== "En curso") return [];
    return [...(t.groups || []).flatMap(g => g.matches || []), ...(t.eliminationRounds || []).flatMap(r => r.matches || [])]
      .filter(m => (myTeamNames.has(m.teamA) || myTeamNames.has(m.teamB)) && (m.matchStatus || "pendiente") !== "validado");
  }).length;

  const navTabs = TABS.map(t => ({ ...t, badge: t.id === "partidos" && pendingMyMatches > 0 ? pendingMyMatches : 0 }));

  const myElo = profile?.elo ?? 1000;
  const myStats = profile?.stats || { pj: 0, pg: 0, pe: 0, pp: 0, titulos: 0 };
  const { label: eloTier, color: eloColor } = eloLabel(myElo);

  return (
    <div style={S.wrap}>
      {notif && (
        <div style={{ position: "fixed", top: 16, left: 16, right: 16, background: C.gold, color: "#07090f", padding: "13px 16px", zIndex: 1000, fontSize: 13, fontFamily: "'Georgia',serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", borderRadius: 10, textAlign: "center", fontWeight: 600 }}>{notif}</div>
      )}

      {showModal && selectedTournament && (
        <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: 300, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ ...S.topBar, position: "relative", flexShrink: 0 }}>
            <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: "'Georgia',serif", fontSize: 13, padding: 0 }}>← Cancelar</button>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Inscribirse</span>
            <div style={{ width: 80 }} />
          </div>
          <div style={{ padding: "24px 16px 40px", flex: 1 }}>
            <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 15 }}>{selectedTournament.name}</p>
            {selectedTournament.whatsappLink && (
              <a href={selectedTournament.whatsappLink} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.2)", borderRadius: 8, textDecoration: "none", color: C.text, marginBottom: 20 }}>
                <span style={{ fontSize: 18 }}>💬</span>
                <span style={{ fontSize: 13, color: "#25d366", fontWeight: 600 }}>Unirse al grupo de WhatsApp</span>
                <span style={{ marginLeft: "auto", color: C.faint }}>→</span>
              </a>
            )}
            <div style={{ marginBottom: 20 }}>
              <label style={S.label}>Escudo del equipo</label>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {inscForm.logoPreview
                  ? <img src={inscForm.logoPreview} alt="preview" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(232,184,75,0.5)" }} />
                  : <div style={{ width: 64, height: 64, borderRadius: "50%", border: "2px dashed rgba(232,184,75,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, background: "rgba(232,184,75,0.04)", flexShrink: 0 }}>🛡</div>
                }
                <div>
                  <label><input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: "none" }} /><span style={{ ...S.btnSm, display: "inline-block", marginBottom: 8 }}>Subir escudo</span></label>
                  <p style={{ margin: 0, fontSize: 11, color: C.faint }}>PNG o JPG · máx 2MB</p>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div><label style={S.label}>Nombre del equipo *</label><input style={S.input} placeholder="Ej: Los Campeones FC" value={inscForm.teamName} onChange={e => setInscForm(p => ({ ...p, teamName: e.target.value }))} /></div>
              <div><label style={S.label}>ID Manager *</label><input style={S.input} placeholder="Tu ID de FIFA" value={inscForm.managerId} onChange={e => setInscForm(p => ({ ...p, managerId: e.target.value }))} /></div>
              <div><label style={S.label}>Teléfono de contacto *</label><input style={S.input} type="tel" placeholder="+34 600 000 000" value={inscForm.phone} onChange={e => setInscForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <div><label style={S.label}>Cuenta de X (opcional)</label><input style={S.input} placeholder="@tunombre" value={inscForm.twitter} onChange={e => setInscForm(p => ({ ...p, twitter: e.target.value }))} /></div>
              <button style={{ ...S.btn(C.gold), opacity: uploading ? 0.6 : 1 }} onClick={inscribirse} disabled={uploading}>
                {uploading ? "Enviando..." : "Enviar solicitud →"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`*{box-sizing:border-box;}input:focus,select:focus,textarea:focus{outline:none;border-color:#e8b84b!important;}input::placeholder,textarea::placeholder{color:rgba(200,212,228,0.2)!important;}table{border-collapse:collapse;width:100%;}body{overscroll-behavior-y:contain;}`}</style>

      <header style={S.topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#e8b84b,#c9952a)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#07090f" }}>⚔</div>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.gold }}>TournamentOS</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.muted, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.name || user?.email}</span>
          <button style={S.btnSm} onClick={onLogout}>Salir</button>
        </div>
      </header>

      <main style={S.main}>

        {tab === "torneos" && (
          <>
            <p style={S.pageTitle}>Torneos</p>
            <p style={S.pageSubtitle}>FIFA Clubes Pro</p>
            {tournaments.length === 0
              ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: C.faint }}>No hay torneos disponibles.</div>
              : tournaments.map(t => {
                const myInsc = myInscriptions.find(i => i.tournamentId === t.id);
                const isExpanded = expandedTId === t.id;
                const hasGroups = t.groups?.length > 0;
                const hasElim = t.eliminationRounds?.length > 0;
                const schedule = t.matchdaySchedule || {};
                const upcoming = Object.values(schedule).filter(d => d && new Date(d) > new Date()).sort()[0];
                return (
                  <div key={t.id} style={S.card}>
                    <div style={{ display: "flex", alignItems: "start", gap: 12, marginBottom: 12 }}>
                      <div style={{ width: 44, height: 44, background: "rgba(232,184,75,0.08)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🎮</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>{t.name}</h3>
                        <p style={{ margin: "0 0 5px", color: C.muted, fontSize: 12 }}>{t.format} · {t.legs > 1 ? "2 vueltas" : "1 vuelta"} · {t.teams?.length || 0} equipos</p>
                        {upcoming && <p style={{ margin: "0 0 6px", fontSize: 12, color: C.blue }}>🕐 Próxima jornada: {formatDatetime(upcoming)}</p>}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span style={S.tag(statusColor[t.status] || "#6b7a90")}>{t.status}</span>
                          {myInsc && <span style={S.tag(myInsc.status === "aprobada" ? C.green : myInsc.status === "rechazada" ? C.red : C.gold)}>
                            {myInsc.status === "aprobada" ? "✓ Inscrito" : myInsc.status === "rechazada" ? "Rechazado" : "⏳ Pendiente"}
                          </span>}
                        </div>
                      </div>
                    </div>
                    {t.whatsappLink && myInsc?.status === "aprobada" && (
                      <a href={t.whatsappLink} target="_blank" rel="noopener noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(37,211,102,0.07)", border: "1px solid rgba(37,211,102,0.18)", borderRadius: 8, textDecoration: "none", color: C.text, marginBottom: 10 }}>
                        <span style={{ fontSize: 16 }}>💬</span>
                        <span style={{ fontSize: 12, color: "#25d366", fontWeight: 600 }}>Grupo de WhatsApp</span>
                        <span style={{ marginLeft: "auto", color: C.faint, fontSize: 14 }}>→</span>
                      </a>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      {!myInsc && t.status === "Abierto" && (
                        <button style={{ ...S.btnInline(C.gold), flex: 1 }} onClick={() => openInscModal(t)}>Inscribirse</button>
                      )}
                      {(hasGroups || hasElim) && (
                        <button style={{ ...S.btnSm, flex: 1 }} onClick={() => setExpandedTId(isExpanded ? null : t.id)}>{isExpanded ? "Ocultar ▲" : "Clasificación ▼"}</button>
                      )}
                    </div>
                    {isExpanded && (
                      <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 16 }}>
                        {hasGroups && t.groups.map((g, gi) => (
                          <div key={gi} style={{ marginBottom: 16 }}>
                            <p style={{ ...S.sectionTitle, color: C.gold }}>Grupo {g.name}</p>
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ minWidth: 240, marginBottom: 4 }}>
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
                          </div>
                        ))}
                        {hasElim && t.eliminationRounds.map((round, ri) => (
                          <div key={ri} style={{ marginBottom: 14 }}>
                            <p style={{ ...S.sectionTitle, color: C.gold }}>{getRoundName(t.eliminationRounds.length, ri)}</p>
                            {round.matches.map((m, mi) => (
                              <div key={mi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 5 }}>
                                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                                  <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={22} />
                                  <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
                                </div>
                                <div style={{ minWidth: 50, textAlign: "center" }}>
                                  {m.matchStatus === "validado" ? <span style={{ fontWeight: 700, color: C.gold, fontSize: 14 }}>{m.scoreA}–{m.scoreB}</span> : <span style={{ color: C.faint, fontSize: 11 }}>pdte</span>}
                                </div>
                                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end", minWidth: 0 }}>
                                  <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
                                  <TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={22} />
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

        {tab === "partidos" && (
          <>
            <p style={S.pageTitle}>Partidos</p>
            <p style={S.pageSubtitle}>Torneos activos · reporta tus resultados</p>
            <MatchesPanel tournaments={tournaments} inscriptions={allInscriptions} currentUser={user} isAdmin={false} logoMap={logoMap} />
          </>
        )}

        {tab === "ranking" && (
          <>
            <p style={S.pageTitle}>Ranking ELO</p>
            <p style={S.pageSubtitle}>Clasificación histórica de equipos</p>
            {/* My ELO card */}
            {myStats.pj > 0 && (
              <div style={{ ...S.card, marginBottom: 20, borderColor: "rgba(167,139,250,0.2)", background: "rgba(167,139,250,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <TeamLogo name={profile?.teamName || profile?.name} logoUrl={logoMap[profile?.teamName]} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 15 }}>{profile?.teamName || profile?.name}</p>
                    <p style={{ margin: "0 0 6px", fontSize: 11, color: C.muted }}>Tu equipo</p>
                    <EloBar elo={myElo} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {[["PJ", myStats.pj], ["V", myStats.pg, C.green], ["E", myStats.pe, C.gold], ["D", myStats.pp, C.red]].map(([label, val, color]) => (
                    <div key={label} style={{ textAlign: "center", padding: "10px 4px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                      <p style={{ margin: "0 0 2px", fontSize: 18, fontWeight: 700, color: color || C.text }}>{val}</p>
                      <p style={{ margin: 0, fontSize: 10, color: C.faint, letterSpacing: 1 }}>{label}</p>
                    </div>
                  ))}
                </div>
                {myStats.titulos > 0 && (
                  <p style={{ margin: "10px 0 0", fontSize: 13, color: C.gold, textAlign: "center" }}>{"🏆".repeat(Math.min(myStats.titulos, 5))} {myStats.titulos} título{myStats.titulos !== 1 ? "s" : ""}</p>
                )}
                {profile?.lastEloChange != null && (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: profile.lastEloChange >= 0 ? C.green : C.red, textAlign: "center" }}>
                    Último partido: {profile.lastEloChange > 0 ? "+" : ""}{profile.lastEloChange} ELO
                  </p>
                )}
              </div>
            )}
            <RankingPanel logoMap={logoMap} inscriptions={allInscriptions} />
          </>
        )}

        {tab === "mis" && (
          <>
            <p style={S.pageTitle}>Mi equipo</p>
            <p style={S.pageSubtitle}>Tus inscripciones y torneos</p>
            {myInscriptions.length === 0
              ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: C.faint }}>Aún no te has inscrito.</div>
              : myInscriptions.map(i => {
                const tournament = tournaments.find(t => t.id === i.tournamentId);
                return (
                  <div key={i.id} style={S.card}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                      <TeamLogo name={i.teamName} logoUrl={i.logoUrl} size={54} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: "0 0 3px", fontSize: 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.teamName}</h3>
                        <p style={{ margin: "0 0 4px", color: C.muted, fontSize: 13 }}>{i.tournamentName}</p>
                        <span style={S.tag(i.status === "aprobada" ? C.green : i.status === "rechazada" ? C.red : C.gold)}>
                          {i.status === "aprobada" ? "✓ Aprobado" : i.status === "rechazada" ? "Rechazado" : "⏳ Pendiente"}
                        </span>
                      </div>
                    </div>
                    {(i.managerId || i.phone || i.twitter) && (
                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10, marginBottom: 10 }}>
                        {i.managerId && <p style={{ margin: "0 0 4px", fontSize: 12, color: C.muted }}>ID Manager: <strong style={{ color: C.text }}>{i.managerId}</strong></p>}
                        {i.phone && <p style={{ margin: "0 0 4px", fontSize: 12, color: C.muted }}>📞 {i.phone}</p>}
                        {i.twitter && <p style={{ margin: 0, fontSize: 12, color: C.blue }}>{i.twitter}</p>}
                      </div>
                    )}
                    {tournament?.whatsappLink && i.status === "aprobada" && (
                      <a href={tournament.whatsappLink} target="_blank" rel="noopener noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(37,211,102,0.07)", border: "1px solid rgba(37,211,102,0.18)", borderRadius: 8, textDecoration: "none", color: C.text, marginBottom: 10 }}>
                        <span style={{ fontSize: 16 }}>💬</span>
                        <span style={{ fontSize: 12, color: "#25d366", fontWeight: 600 }}>Grupo de WhatsApp</span>
                        <span style={{ marginLeft: "auto", color: C.faint, fontSize: 14 }}>→</span>
                      </a>
                    )}
                    {i.status === "aprobada" && (
                      <button style={{ ...S.btnInline(C.blue) }} onClick={() => setTab("partidos")}>Ver mis partidos →</button>
                    )}
                  </div>
                );
              })
            }
          </>
        )}

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
          </>
        )}
      </main>

      <BottomNav tabs={navTabs} active={tab} onChange={setTab} color={C.gold} />
    </div>
  );
}
