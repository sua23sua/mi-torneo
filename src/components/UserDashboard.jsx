import { useState, useEffect } from "react";
import { db, storage } from "../firebase";
import { collection, addDoc, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../AuthContext";
import { C, S, statusColor, getRoundName, TeamLogo } from "../shared";

const catColor = { Noticia: C.blue, Resultado: C.green, Convocatoria: C.gold, Aviso: C.red };

const NORMATIVA = [
  { titulo: "1. Participación", texto: "Todos los equipos deben estar registrados y haber recibido confirmación de inscripción antes del inicio del torneo." },
  { titulo: "2. Formato de juego", texto: "Los partidos se jugarán en FIFA Clubes Pro con la configuración oficial." },
  { titulo: "3. Puntualidad", texto: "10 minutos de margen. El incumplimiento puede suponer derrota por incomparecencia (0-3)." },
  { titulo: "4. Conducta", texto: "Comportamiento deportivo y respetuoso en todo momento. Las infracciones pueden suponer expulsión." },
  { titulo: "5. Resultados", texto: "Deben ser reportados por ambos equipos. En caso de discrepancia, la organización decide." },
  { titulo: "6. Fase de grupos", texto: "Clasificación por puntos (3V/1E/0D), diferencia de goles y goles a favor." },
  { titulo: "7. Eliminatoria", texto: "No se permiten empates. En caso de igualdad se juegan penaltis." },
  { titulo: "8. Modificaciones", texto: "La organización puede modificar el formato en casos excepcionales." },
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
  const [normativaOpen, setNormativaOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [inscForm, setInscForm] = useState({ teamName: "", managerId: "", phone: "", twitter: "", logoFile: null, logoPreview: null });

  function showNotif(msg) { setNotif(msg); setTimeout(() => setNotif(null), 2800); }

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
    if (myInscriptions.find(i => i.tournamentId === selectedTournament.id)) return showNotif("Ya estás inscrito en este torneo");
    setUploading(true);
    let logoUrl = null;
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
      setInscForm({ teamName: "", managerId: "", phone: "", twitter: "", logoFile: null, logoPreview: null });
      setShowModal(false);
      showNotif("Solicitud enviada ✓ — pendiente de aprobación");
    } catch (e) { showNotif("Error al enviar. Inténtalo de nuevo."); }
    setUploading(false);
  }

  function TRow({ name, size = 22, bold = false }) {
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><TeamLogo name={name} logoUrl={logoMap[name]} size={size} /><span style={{ fontWeight: bold ? 700 : 400 }}>{name}</span></span>;
  }

  return (
    <div style={S.wrap}>
      {notif && <div style={{ position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)", background: C.gold, color: "#07090f", padding: "11px 28px", zIndex: 1000, letterSpacing: 1, fontSize: 12, fontFamily: "'Georgia',serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", maxWidth: "90vw", textAlign: "center", borderRadius: 8 }}>{notif}</div>}

      {/* Inscription Modal */}
      {showModal && selectedTournament && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
          <div style={{ ...S.card, maxWidth: 480, width: "100%", margin: "auto", padding: "clamp(22px,5vw,36px)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>Inscribirse</h3>
            <p style={{ margin: "0 0 24px", color: C.muted, fontSize: 13 }}>{selectedTournament.name}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Logo */}
              <div>
                <label style={S.label}>Escudo del equipo</label>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {inscForm.logoPreview
                    ? <img src={inscForm.logoPreview} alt="preview" style={{ width: 58, height: 58, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(232,184,75,0.4)" }} />
                    : <div style={{ width: 58, height: 58, borderRadius: "50%", border: "2px dashed rgba(232,184,75,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, background: "rgba(232,184,75,0.04)" }}>🛡</div>
                  }
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <label style={{ cursor: "pointer" }}>
                      <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: "none" }} />
                      <span style={{ ...S.btnSm, display: "inline-block" }}>Subir escudo</span>
                    </label>
                    {inscForm.logoPreview && <button style={S.btnSm} onClick={() => setInscForm(p => ({ ...p, logoFile: null, logoPreview: null }))}>Quitar</button>}
                  </div>
                </div>
                <p style={{ margin: "7px 0 0", fontSize: 10, color: C.faint }}>PNG o JPG · máx. 2 MB</p>
              </div>
              <div><label style={S.label}>Nombre del equipo *</label><input style={S.input} placeholder="Ej: Los Campeones FC" value={inscForm.teamName} onChange={e => setInscForm(p => ({ ...p, teamName: e.target.value }))} /></div>
              <div><label style={S.label}>ID Manager *</label><input style={S.input} placeholder="Tu ID de FIFA" value={inscForm.managerId} onChange={e => setInscForm(p => ({ ...p, managerId: e.target.value }))} /></div>
              <div><label style={S.label}>Teléfono de contacto *</label><input style={S.input} type="tel" placeholder="+34 600 000 000" value={inscForm.phone} onChange={e => setInscForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <div><label style={S.label}>Cuenta de X (opcional)</label><input style={S.input} placeholder="@tunombre" value={inscForm.twitter} onChange={e => setInscForm(p => ({ ...p, twitter: e.target.value }))} /></div>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
              <button style={{ ...S.btn(C.gold), color: "#07090f", opacity: uploading ? 0.6 : 1 }} onClick={inscribirse} disabled={uploading}>
                {uploading ? "Enviando..." : "Enviar solicitud →"}
              </button>
              <button style={S.btnSm} onClick={() => { setShowModal(false); setInscForm({ teamName: "", managerId: "", phone: "", twitter: "", logoFile: null, logoPreview: null }); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`input:focus,select:focus{outline:none;border-color:#e8b84b!important;box-shadow:0 0 0 3px rgba(232,184,75,0.1);}input::placeholder{color:rgba(200,212,228,0.18)!important;}table{border-collapse:collapse;width:100%;}*{box-sizing:border-box;}.hover-card:hover{border-color:rgba(232,184,75,0.25)!important;}.btn-h:hover{opacity:0.85;transform:translateY(-1px);}`}</style>

      {/* Normativa */}
      <div style={{ background: "rgba(232,184,75,0.04)", borderBottom: "1px solid rgba(232,184,75,0.12)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 clamp(16px,4vw,32px)" }}>
          <button onClick={() => setNormativaOpen(p => !p)} style={{ width: "100%", background: "none", border: "none", color: C.text, cursor: "pointer", padding: "12px 0", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'Georgia',serif" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}><span>📋</span><span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>Normativa del torneo</span></span>
            <span style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>{normativaOpen ? "Ocultar ▲" : "Ver ▼"}</span>
          </button>
          {normativaOpen && (
            <div style={{ paddingBottom: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,280px),1fr))", gap: 12 }}>
                {NORMATIVA.map((n, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(232,184,75,0.1)", borderRadius: 8, padding: "13px 15px" }}>
                    <p style={{ margin: "0 0 5px", fontWeight: 700, fontSize: 12, color: C.gold }}>{n.titulo}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#7a8aa4", lineHeight: 1.6 }}>{n.texto}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <header style={{ ...S.header, borderBottomColor: "rgba(232,184,75,0.12)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#e8b84b,#c9952a)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#07090f" }}>⚔</div>
          <span style={{ fontSize: "clamp(12px,3vw,16px)", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.gold }}>TournamentOS</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: C.muted, maxWidth: "25vw", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.name || user?.email}</span>
          <button className="btn-h" style={{ ...S.btnSm, transition: "opacity .15s" }} onClick={onLogout}>Salir</button>
        </div>
      </header>

      <main style={S.main}>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 26, overflowX: "auto" }}>
          {["torneos", "noticias", "palmares", "mis-inscripciones"].map(t => (
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
              <div style={{ border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 10, padding: 48, textAlign: "center", color: C.faint }}>No hay torneos disponibles.</div>
            ) : tournaments.map(t => {
              const myInsc = myInscriptions.find(i => i.tournamentId === t.id);
              const isExpanded = expandedTId === t.id;
              const hasGroups = t.groups?.length > 0;
              const hasElim = t.eliminationRounds?.length > 0;
              return (
                <div key={t.id} className="hover-card" style={{ ...S.card, transition: "border-color .15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "start", flex: 1 }}>
                      <div style={{ width: 44, height: 44, background: "rgba(232,184,75,0.08)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🎮</div>
                      <div>
                        <h3 style={{ margin: "0 0 5px", fontSize: "clamp(14px,3vw,17px)", fontWeight: 700 }}>{t.name}</h3>
                        <p style={{ margin: "0 0 8px", color: C.muted, fontSize: 12 }}>{t.format} · {t.legs > 1 ? "Doble vuelta" : "Una vuelta"} · {t.teams?.length || 0} equipos</p>
                        {t.description && <p style={{ margin: "0 0 8px", fontSize: 13, color: "#7a8aa4" }}>{t.description}</p>}
                        {t.winner && <p style={{ margin: "0 0 8px", color: C.gold, fontSize: 13 }}>🏆 <TRow name={t.winner} size={20} bold /></p>}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={S.tag(statusColor[t.status] || "#6b7a90")}>{t.status}</span>
                          {myInsc && <span style={S.tag(myInsc.status === "aprobada" ? C.green : myInsc.status === "rechazada" ? C.red : C.gold)}>
                            {myInsc.status === "aprobada" ? "✓ Inscrito" : myInsc.status === "rechazada" ? "Rechazado" : "⏳ Pendiente"}
                          </span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
                      {!myInsc && t.status === "Abierto" && (
                        <button className="btn-h" style={{ ...S.btn(C.gold), color: "#07090f", padding: "8px 14px", fontSize: 10, transition: "opacity .15s, transform .1s" }} onClick={() => { setSelectedTournament(t); setShowModal(true); }}>Inscribirse</button>
                      )}
                      {(hasGroups || hasElim) && (
                        <button style={S.btnSm} onClick={() => setExpandedTId(isExpanded ? null : t.id)}>{isExpanded ? "Ocultar ▲" : "Ver ▼"}</button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 22, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 22 }}>
                      {hasGroups && (
                        <div style={{ marginBottom: 22 }}>
                          <p style={S.sectionTitle}>Clasificación de grupos</p>
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
            })}
          </>
        )}

        {/* NOTICIAS */}
        {tab === "noticias" && (
          <>
            <h1 style={{ fontSize: "clamp(18px,4vw,24px)", fontWeight: 700, margin: "0 0 20px" }}>Noticias</h1>
            {news.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 10, padding: 48, textAlign: "center", color: C.faint }}>No hay noticias.</div>
            ) : news.map(n => (
              <div key={n.id} className="hover-card" style={{ ...S.card, cursor: "pointer", transition: "border-color .15s" }} onClick={() => setExpandedNews(expandedNews === n.id ? null : n.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10, marginBottom: 7 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={S.tag(catColor[n.category] || C.blue)}>{n.category}</span>
                    <h3 style={{ margin: 0, fontSize: "clamp(13px,3vw,15px)", fontWeight: 700 }}>{n.title}</h3>
                  </div>
                  <span style={{ color: C.faint, fontSize: 14, flexShrink: 0 }}>{expandedNews === n.id ? "▲" : "▼"}</span>
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
            <h1 style={{ fontSize: "clamp(18px,4vw,24px)", fontWeight: 700, margin: "0 0 20px" }}>🏆 Palmarés</h1>
            {(() => {
              const palmares = tournaments.filter(t => t.winner && t.status === "Finalizado");
              if (palmares.length === 0) return <div style={{ border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 10, padding: 48, textAlign: "center", color: C.faint }}>Aún no hay torneos finalizados.</div>;
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
                            <td style={S.td}><TRow name={name} size={24} /></td>
                            <td style={{ ...S.td, color: C.gold, fontWeight: 700 }}>{"🏆".repeat(Math.min(count, 5))} {count}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                  {palmares.map(t => (
                    <div key={t.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 22 }}>🏆</span>
                      <div style={{ flex: 1, minWidth: 100 }}>
                        <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>{t.name}</h3>
                        <p style={{ margin: 0, color: C.muted, fontSize: 11 }}>{t.format} · {new Date(t.createdAt).toLocaleDateString("es-ES")}</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <TeamLogo name={t.winner} logoUrl={logoMap[t.winner]} size={38} />
                        <div>
                          <p style={{ margin: "0 0 2px", color: C.gold, fontWeight: 700, fontSize: 14 }}>{t.winner}</p>
                          <p style={{ margin: 0, color: C.faint, fontSize: 11 }}>Campeón</p>
                        </div>
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
              <div style={{ border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 10, padding: 48, textAlign: "center", color: C.faint }}>Aún no te has inscrito en ningún torneo.</div>
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <TeamLogo name={i.teamName} logoUrl={i.logoUrl} size={52} />
                      <div>
                        <h3 style={{ margin: "0 0 3px", fontSize: "clamp(14px,3vw,18px)", fontWeight: 700 }}>{i.teamName}</h3>
                        <p style={{ margin: "0 0 2px", color: C.muted, fontSize: 12 }}>{i.tournamentName}</p>
                        {i.managerId && <p style={{ margin: "0 0 1px", color: C.faint, fontSize: 11 }}>ID: {i.managerId}</p>}
                        {i.twitter && <p style={{ margin: 0, color: C.blue, fontSize: 11 }}>{i.twitter}</p>}
                      </div>
                    </div>
                    <span style={S.tag(i.status === "aprobada" ? C.green : i.status === "rechazada" ? C.red : C.gold)}>
                      {i.status === "aprobada" ? "✓ Aprobado" : i.status === "rechazada" ? "Rechazado" : "⏳ Pendiente"}
                    </span>
                  </div>
                  {myMatches.length > 0 && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 14 }}>
                      <p style={S.label}>Tus partidos</p>
                      {myMatches.map((m, idx) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, color: C.faint, minWidth: 65, letterSpacing: 1 }}>{m.phase}</span>
                          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, fontWeight: m.teamA === i.teamName ? 700 : 400, color: m.teamA === i.teamName ? C.gold : C.text, overflow: "hidden" }}>
                            <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={18} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{m.teamA}</span>
                          </div>
                          {(m.played || m.winner) ? <span style={{ fontWeight: 700, letterSpacing: 2, color: C.gold, flexShrink: 0 }}>{m.scoreA}—{m.scoreB}</span> : <span style={{ color: C.faint, fontSize: 11, flexShrink: 0 }}>vs</span>}
                          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", fontWeight: m.teamB === i.teamName ? 700 : 400, color: m.teamB === i.teamName ? C.gold : C.text, overflow: "hidden" }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{m.teamB}</span>
                            <TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={18} />
                          </div>
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
