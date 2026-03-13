import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot, where } from "firebase/firestore";
import { useAuth } from "../AuthContext";
import { C, S, statusColor, getRoundName, buildGroups, applyGroupResult, buildSeededElimination, buildEliminationRound, TeamLogo } from "../shared";

const NORMATIVA = [
  { titulo: "1. Participación", texto: "Todos los equipos deben estar registrados y haber recibido confirmación de inscripción antes del inicio." },
  { titulo: "2. Formato de juego", texto: "Los partidos se jugarán en FIFA Clubes Pro con la configuración oficial." },
  { titulo: "3. Puntualidad", texto: "10 minutos de margen. El incumplimiento puede suponer derrota por incomparecencia (0-3)." },
  { titulo: "4. Conducta", texto: "Comportamiento deportivo y respetuoso en todo momento. Las infracciones pueden suponer expulsión." },
  { titulo: "5. Resultados", texto: "Deben ser reportados por ambos equipos. En caso de discrepancia, la organización decide." },
  { titulo: "6. Fase de grupos", texto: "Clasificación por puntos (3V/1E/0D), diferencia de goles y goles a favor." },
  { titulo: "7. Eliminatoria", texto: "No se permiten empates. En caso de igualdad se juegan penaltis." },
  { titulo: "8. Modificaciones", texto: "La organización puede modificar el formato en casos excepcionales." },
];

export default function AdminDashboard({ onLogout }) {
  const { user, profile } = useAuth();
  const [mainTab, setMainTab] = useState("torneos");
  const [tournaments, setTournaments] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [news, setNews] = useState([]);
  const [view, setView] = useState("list");
  const [activeTId, setActiveTId] = useState(null);
  const [notif, setNotif] = useState(null);
  const [normativaOpen, setNormativaOpen] = useState(false);
  const [scoreEdit, setScoreEdit] = useState({});
  const [newsForm, setNewsForm] = useState({ title: "", body: "", category: "Noticia" });
  const [editingNewsId, setEditingNewsId] = useState(null);

  // New tournament form
  const [form, setForm] = useState({ name: "", format: "Liga", groupCount: 2, qualify: 2, description: "", legs: 1 });

  // Admin inscription modal
  const [showInscModal, setShowInscModal] = useState(false);
  const [inscTarget, setInscTarget] = useState(null); // tournament
  const [adminInscForm, setAdminInscForm] = useState({ teamName: "", managerId: "", phone: "", twitter: "" });

  function showNotif(msg, type = "blue") { setNotif({ msg, type }); setTimeout(() => setNotif(null), 2800); }
  function F(k, v) { setForm(p => ({ ...p, [k]: v })); }

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")), snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(query(collection(db, "inscriptions"), orderBy("createdAt", "desc")), snap => setInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u3 = onSnapshot(query(collection(db, "news"), orderBy("createdAt", "desc")), snap => setNews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); u3(); };
  }, []);

  const logoMap = {};
  inscriptions.forEach(i => { if (i.teamName && i.logoUrl) logoMap[i.teamName] = i.logoUrl; });

  function TRow({ name, size = 22, bold = false }) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <TeamLogo name={name} logoUrl={logoMap[name]} size={size} />
        <span style={{ fontWeight: bold ? 700 : 400 }}>{name}</span>
      </span>
    );
  }

  // ── Tournament creation (no teams — they come from inscriptions) ──
  async function createTournament() {
    if (!form.name.trim()) return showNotif("Introduce el nombre del torneo", "red");
    await addDoc(collection(db, "tournaments"), {
      name: form.name.trim(), description: form.description.trim(),
      sport: "FIFA Clubes Pro", format: form.format,
      groupCount: parseInt(form.groupCount), qualify: parseInt(form.qualify),
      legs: parseInt(form.legs),
      teams: [], groups: null, eliminationRounds: [], status: "Abierto", winner: null,
      createdAt: new Date().toISOString(), createdBy: user.uid,
    });
    setForm({ name: "", format: "Liga", groupCount: 2, qualify: 2, description: "", legs: 1 });
    setView("list");
    showNotif("Torneo creado ✓");
  }

  // ── Start tournament: build brackets from approved inscriptions ──
  async function startTournament(t) {
    const approved = inscriptions.filter(i => i.tournamentId === t.id && i.status === "aprobada");
    if (approved.length < 2) return showNotif("Se necesitan al menos 2 equipos aprobados", "red");
    const teamNames = approved.map(i => i.teamName);
    const legs = t.legs || 1;
    let groups = null, eliminationRounds = [];
    if (t.format === "Eliminatoria") {
      eliminationRounds = [{ round: 1, matches: buildEliminationRound(teamNames) }];
    } else if (t.format === "Liga") {
      groups = buildGroups(teamNames, 1, legs);
    } else {
      const gc = Math.min(parseInt(t.groupCount), Math.floor(teamNames.length / 2));
      groups = buildGroups(teamNames, gc, legs);
    }
    await updateDoc(doc(db, "tournaments", t.id), { teams: teamNames, groups, eliminationRounds, status: "En curso" });
    showNotif("¡Torneo iniciado! Grupos y partidos generados ✓");
  }

  // ── Admin inscription ──
  async function submitAdminInsc() {
    if (!adminInscForm.teamName.trim()) return showNotif("Escribe el nombre del equipo", "red");
    await addDoc(collection(db, "inscriptions"), {
      tournamentId: inscTarget.id, tournamentName: inscTarget.name,
      userId: user.uid, userName: profile?.name || user.email,
      teamName: adminInscForm.teamName.trim(),
      managerId: adminInscForm.managerId.trim(),
      phone: adminInscForm.phone.trim(),
      twitter: adminInscForm.twitter.trim(),
      logoUrl: null, status: "aprobada",
      createdAt: new Date().toISOString(), addedByAdmin: true,
    });
    setAdminInscForm({ teamName: "", managerId: "", phone: "", twitter: "" });
    setShowInscModal(false);
    showNotif("Equipo añadido y aprobado ✓");
  }

  async function saveGroupResult(t, gi, mi) {
    const key = `g${gi}-m${mi}`;
    const a = parseInt(scoreEdit[key]?.a), b = parseInt(scoreEdit[key]?.b);
    if (isNaN(a) || isNaN(b)) return showNotif("Introduce ambos marcadores", "red");
    const newGroups = t.groups.map((g, idx) => {
      if (idx !== gi) return g;
      const newMatches = g.matches.map((m, i) => i !== mi ? m : { ...m, scoreA: a, scoreB: b, played: true });
      let standings = g.teams.map(t => ({ name: t, pts: 0, gf: 0, gc: 0, pj: 0, gd: 0 }));
      newMatches.forEach(m => { if (m.played) standings = applyGroupResult(standings, m.teamA, m.teamB, m.scoreA, m.scoreB); });
      return { ...g, matches: newMatches, standings };
    });
    await updateDoc(doc(db, "tournaments", t.id), { groups: newGroups });
    setScoreEdit(p => { const n = { ...p }; delete n[key]; return n; });
    showNotif("Resultado guardado ✓");
  }

  async function saveElimResult(t, ri, mi) {
    const key = `e${ri}-m${mi}`;
    const a = parseInt(scoreEdit[key]?.a), b = parseInt(scoreEdit[key]?.b);
    if (isNaN(a) || isNaN(b) || a === b) return showNotif("Sin empate en eliminatoria", "red");
    const newRounds = t.eliminationRounds.map((r, idx) => {
      if (idx !== ri) return r;
      return { ...r, matches: r.matches.map((m, i) => i !== mi ? m : { ...m, scoreA: a, scoreB: b, winner: a > b ? m.teamA : m.teamB }) };
    });
    const allDone = newRounds[ri].matches.every(m => m.winner);
    let finalRounds = newRounds, winner = null;
    if (allDone) {
      const winners = newRounds[ri].matches.map(m => m.winner).filter(w => w !== "BYE");
      if (winners.length === 1) winner = winners[0];
      else { finalRounds = [...newRounds, { round: newRounds.length + 1, matches: buildEliminationRound(winners) }]; showNotif("¡Nueva ronda generada!"); }
    }
    await updateDoc(doc(db, "tournaments", t.id), { eliminationRounds: finalRounds, ...(winner ? { winner, status: "Finalizado" } : {}) });
    setScoreEdit(p => { const n = { ...p }; delete n[key]; return n; });
    if (winner) showNotif(`🏆 ¡${winner} campeón!`, "gold");
    else if (!allDone) showNotif("Resultado guardado ✓");
  }

  async function generateElimFromGroups(t) {
    const matches = buildSeededElimination(t.groups, t.qualify || 2);
    if (matches.length < 1) return showNotif("No hay suficientes clasificados", "red");
    await updateDoc(doc(db, "tournaments", t.id), { eliminationRounds: [{ round: 1, matches }] });
    showNotif("Fase eliminatoria generada ✓");
  }

  async function deleteTournament(id) {
    if (!window.confirm("¿Eliminar este torneo permanentemente?")) return;
    await deleteDoc(doc(db, "tournaments", id));
    if (activeTId === id) { setActiveTId(null); setView("list"); }
    showNotif("Torneo eliminado");
  }

  async function handleInscription(id, status) {
    await updateDoc(doc(db, "inscriptions", id), { status });
    showNotif(status === "aprobada" ? "Inscripción aprobada ✓" : "Inscripción rechazada");
  }

  async function saveNews() {
    if (!newsForm.title.trim() || !newsForm.body.trim()) return showNotif("Rellena título y contenido", "red");
    if (editingNewsId) {
      await updateDoc(doc(db, "news", editingNewsId), { ...newsForm, updatedAt: new Date().toISOString() });
      showNotif("Noticia actualizada ✓");
    } else {
      await addDoc(collection(db, "news"), { ...newsForm, createdAt: new Date().toISOString(), createdBy: user.uid });
      showNotif("Noticia publicada ✓");
    }
    setNewsForm({ title: "", body: "", category: "Noticia" });
    setEditingNewsId(null);
  }

  const activeTournament = tournaments.find(t => t.id === activeTId);
  const pendingCount = inscriptions.filter(i => i.status === "pendiente").length;
  const catColor = { Noticia: C.blue, Resultado: C.green, Convocatoria: C.gold, Aviso: C.red };
  const notifBg = { blue: C.blue, red: C.red, gold: C.gold };

  return (
    <div style={S.wrap}>
      {/* Toast */}
      {notif && (
        <div style={{ position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)", background: notifBg[notif.type] || C.blue, color: notif.type === "gold" ? "#07090f" : "#fff", padding: "11px 28px", zIndex: 1000, letterSpacing: 1, fontSize: 12, fontFamily: "'Georgia',serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", maxWidth: "90vw", textAlign: "center", borderRadius: 8 }}>{notif.msg}</div>
      )}

      {/* Admin add team modal */}
      {showInscModal && inscTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ ...S.card, maxWidth: 420, width: "100%", padding: "clamp(22px,5vw,36px)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>Añadir equipo</h3>
            <p style={{ margin: "0 0 22px", color: C.muted, fontSize: 13 }}>{inscTarget.name} · aprobado automáticamente</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={S.label}>Nombre del equipo *</label><input style={S.input} placeholder="Nombre del equipo" value={adminInscForm.teamName} onChange={e => setAdminInscForm(p => ({ ...p, teamName: e.target.value }))} /></div>
              <div><label style={S.label}>ID Manager</label><input style={S.input} placeholder="ID de FIFA" value={adminInscForm.managerId} onChange={e => setAdminInscForm(p => ({ ...p, managerId: e.target.value }))} /></div>
              <div><label style={S.label}>Teléfono</label><input style={S.input} placeholder="+34 600 000 000" value={adminInscForm.phone} onChange={e => setAdminInscForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <div><label style={S.label}>X / Twitter</label><input style={S.input} placeholder="@cuenta" value={adminInscForm.twitter} onChange={e => setAdminInscForm(p => ({ ...p, twitter: e.target.value }))} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button style={S.btn()} onClick={submitAdminInsc}>Añadir equipo →</button>
              <button style={S.btnSm} onClick={() => setShowInscModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`input:focus,select:focus,textarea:focus{outline:none;border-color:#4f8ef7!important;box-shadow:0 0 0 3px rgba(79,142,247,0.1);}input::placeholder,textarea::placeholder{color:rgba(200,212,228,0.18)!important;}table{border-collapse:collapse;width:100%;}*{box-sizing:border-box;}.btn-hover:hover{opacity:0.85;transform:translateY(-1px);}`}</style>

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

      {/* Header */}
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#4f8ef7,#2a6fd4)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚔</div>
          <span style={{ fontSize: "clamp(12px,3vw,16px)", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.blue }}>TournamentOS</span>
          <span style={{ ...S.tag(C.blue), fontSize: 8 }}>Admin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: C.muted, maxWidth: "22vw", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.name || user?.email}</span>
          <button className="btn-hover" style={{ ...S.btnSm, transition: "opacity .15s" }} onClick={onLogout}>Salir</button>
        </div>
      </header>

      <main style={S.main}>
        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 28, overflowX: "auto" }}>
          {["torneos", "inscripciones", "noticias"].map(t => (
            <button key={t} style={S.tab(mainTab === t)} onClick={() => { setMainTab(t); setView("list"); }}>
              {t === "torneos" ? "Torneos" : t === "inscripciones" ? `Inscripciones${pendingCount > 0 ? ` · ${pendingCount}` : ""}` : "Noticias"}
            </button>
          ))}
        </div>

        {/* ══ TORNEOS ══ */}
        {mainTab === "torneos" && (
          <>
            {/* LIST */}
            {view === "list" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <h1 style={{ fontSize: "clamp(18px,4vw,26px)", fontWeight: 700, margin: "0 0 4px" }}>Torneos</h1>
                    <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>FIFA Clubes Pro · {tournaments.length} torneos</p>
                  </div>
                  <button className="btn-hover" style={{ ...S.btn(), transition: "opacity .15s, transform .1s" }} onClick={() => setView("new")}>+ Nuevo torneo</button>
                </div>

                {tournaments.length === 0 ? (
                  <div style={{ border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 10, padding: 56, textAlign: "center", color: C.faint }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🎮</div>
                    <p style={{ margin: 0 }}>No hay torneos creados aún</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,260px),1fr))", gap: 14 }}>
                    {tournaments.map(t => {
                      const tInsc = inscriptions.filter(i => i.tournamentId === t.id && i.status === "aprobada");
                      return (
                        <div key={t.id} className="btn-hover" style={{ ...S.card, cursor: "pointer", transition: "border-color .15s, transform .1s" }} onClick={() => { setActiveTId(t.id); setView("detail"); }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 14 }}>
                            <div style={{ width: 42, height: 42, background: "rgba(79,142,247,0.12)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🎮</div>
                            <span style={S.tag(statusColor[t.status] || "#6b7a90")}>{t.status}</span>
                          </div>
                          <h3 style={{ margin: "0 0 5px", fontSize: 15, fontWeight: 700 }}>{t.name}</h3>
                          <p style={{ margin: "0 0 12px", color: C.muted, fontSize: 12 }}>{t.format} · {t.legs > 1 ? "Doble vuelta" : "Una vuelta"}</p>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: C.faint }}>{tInsc.length} equipos</span>
                            {t.winner && <span style={{ color: C.gold, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>🏆 <TeamLogo name={t.winner} logoUrl={logoMap[t.winner]} size={18} /></span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* NEW */}
            {view === "new" && (
              <div style={{ maxWidth: 560 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
                  <button style={S.btnSm} onClick={() => setView("list")}>← Volver</button>
                  <div>
                    <h1 style={{ fontSize: "clamp(16px,4vw,22px)", fontWeight: 700, margin: "0 0 2px" }}>Nuevo torneo</h1>
                    <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>Los equipos se añadirán mediante inscripciones</p>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div><label style={S.label}>Nombre del torneo</label><input style={S.input} placeholder="Copa de Campeones 2026" value={form.name} onChange={e => F("name", e.target.value)} /></div>
                  <div><label style={S.label}>Descripción (opcional)</label><input style={S.input} placeholder="Breve descripción..." value={form.description} onChange={e => F("description", e.target.value)} /></div>

                  <div>
                    <label style={S.label}>Formato</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                      {["Liga", "Eliminatoria", "Grupos + Eliminatoria"].map(f => (
                        <button key={f} onClick={() => F("format", f)} style={{ padding: "12px 8px", borderRadius: 8, border: `1px solid ${form.format === f ? C.blue : "rgba(255,255,255,0.09)"}`, background: form.format === f ? "rgba(79,142,247,0.1)" : "rgba(255,255,255,0.02)", color: form.format === f ? C.blue : C.muted, cursor: "pointer", fontSize: 12, fontFamily: "'Georgia',serif", transition: "all .15s", textAlign: "center" }}>
                          {f === "Liga" ? "🏆 Liga" : f === "Eliminatoria" ? "⚔ Eliminatoria" : "🎯 Grupos"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(form.format === "Liga" || form.format === "Grupos + Eliminatoria") && (
                    <div>
                      <label style={S.label}>Vueltas</label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        {[1, 2].map(l => (
                          <button key={l} onClick={() => F("legs", l)} style={{ padding: "12px", borderRadius: 8, border: `1px solid ${form.legs === l ? C.gold : "rgba(255,255,255,0.09)"}`, background: form.legs === l ? "rgba(232,184,75,0.1)" : "rgba(255,255,255,0.02)", color: form.legs === l ? C.gold : C.muted, cursor: "pointer", fontSize: 12, fontFamily: "'Georgia',serif", transition: "all .15s" }}>
                            {l === 1 ? "⭕ Una vuelta" : "🔄 Doble vuelta"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {form.format === "Grupos + Eliminatoria" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div><label style={S.label}>Nº de grupos</label><input style={S.input} type="number" min={2} max={8} value={form.groupCount} onChange={e => F("groupCount", e.target.value)} /></div>
                      <div><label style={S.label}>Clasificados/grupo</label><input style={S.input} type="number" min={1} max={4} value={form.qualify} onChange={e => F("qualify", e.target.value)} /></div>
                    </div>
                  )}

                  <div style={{ background: "rgba(79,142,247,0.06)", border: "1px solid rgba(79,142,247,0.15)", borderRadius: 8, padding: "14px 16px" }}>
                    <p style={{ margin: "0 0 4px", fontSize: 12, color: C.blue, fontWeight: 700 }}>ℹ Los equipos se añaden mediante inscripciones</p>
                    <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Una vez creado el torneo, acepta inscripciones y luego pulsa "Iniciar torneo" para generar los grupos y partidos automáticamente.</p>
                  </div>

                  <button className="btn-hover" style={{ ...S.btn(), padding: 14, transition: "opacity .15s, transform .1s" }} onClick={createTournament}>Crear torneo →</button>
                </div>
              </div>
            )}

            {/* DETAIL */}
            {view === "detail" && activeTournament && (() => {
              const t = activeTournament;
              const hasGroups = t.groups?.length > 0;
              const hasElim = t.eliminationRounds?.length > 0;
              const groupsDone = hasGroups && t.groups.every(g => g.matches.every(m => m.played));
              const approvedInsc = inscriptions.filter(i => i.tournamentId === t.id && i.status === "aprobada");
              const pendingInsc = inscriptions.filter(i => i.tournamentId === t.id && i.status === "pendiente");
              const canStart = t.status === "Abierto" && approvedInsc.length >= 2 && !hasGroups && !hasElim;

              return (
                <div>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                    <button style={S.btnSm} onClick={() => setView("list")}>← Volver</button>
                    <h1 style={{ fontSize: "clamp(16px,4vw,22px)", fontWeight: 700, margin: 0 }}>{t.name}</h1>
                    <span style={S.tag(statusColor[t.status] || "#6b7a90")}>{t.status}</span>
                    {t.winner && <span style={{ color: C.gold, display: "flex", alignItems: "center", gap: 7, fontSize: 14 }}>🏆 <TRow name={t.winner} size={22} bold /></span>}
                  </div>
                  <p style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>FIFA Clubes Pro · {t.format} · {t.legs > 1 ? "Doble vuelta" : "Una vuelta"} · {approvedInsc.length} equipos</p>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22, padding: "14px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
                      {["Abierto", "En curso", "Finalizado", "Cerrado"].map(s => (
                        <button key={s} style={{ ...S.btnSm, borderColor: t.status === s ? (statusColor[s] || "#fff") : undefined, color: t.status === s ? (statusColor[s] || "#fff") : undefined, transition: "all .15s" }}
                          onClick={() => updateDoc(doc(db, "tournaments", t.id), { status: s })}>{s}</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={{ ...S.btnSm, borderColor: "rgba(79,142,247,0.4)", color: C.blue }} onClick={() => { setInscTarget(t); setShowInscModal(true); }}>+ Añadir equipo</button>
                      {canStart && <button className="btn-hover" style={{ ...S.btn(C.green), color: "#07090f", padding: "6px 16px", fontSize: 10, transition: "opacity .15s, transform .1s" }} onClick={() => startTournament(t)}>▶ Iniciar torneo</button>}
                      <button style={S.btnDanger} onClick={() => deleteTournament(t.id)}>Eliminar</button>
                    </div>
                  </div>

                  {canStart && (
                    <div style={{ background: "rgba(82,214,138,0.06)", border: "1px solid rgba(82,214,138,0.2)", borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
                      <p style={{ margin: 0, color: C.green, fontSize: 13 }}>✓ <strong>{approvedInsc.length} equipos aprobados</strong> · Pulsa "Iniciar torneo" para generar los partidos automáticamente</p>
                    </div>
                  )}

                  {/* Pending inscriptions */}
                  {pendingInsc.length > 0 && (
                    <div style={{ ...S.card, marginBottom: 20 }}>
                      <p style={{ ...S.label, marginBottom: 14 }}>Solicitudes pendientes ({pendingInsc.length})</p>
                      {pendingInsc.map(i => (
                        <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap", gap: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <TeamLogo name={i.teamName} logoUrl={i.logoUrl} size={38} />
                            <div>
                              <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: 14 }}>{i.teamName}</p>
                              <p style={{ margin: "0 0 1px", color: C.muted, fontSize: 11 }}>{i.userName} · ID: {i.managerId || "—"}</p>
                              <p style={{ margin: 0, color: C.faint, fontSize: 11 }}>📞 {i.phone || "—"}{i.twitter ? ` · ${i.twitter}` : ""}</p>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button style={{ ...S.btnSm, borderColor: "rgba(82,214,138,0.4)", color: C.green }} onClick={() => handleInscription(i.id, "aprobada")}>Aprobar</button>
                            <button style={S.btnDanger} onClick={() => handleInscription(i.id, "rechazada")}>Rechazar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Approved teams list (before start) */}
                  {approvedInsc.length > 0 && !hasGroups && !hasElim && (
                    <div style={{ ...S.card, marginBottom: 20 }}>
                      <p style={{ ...S.label, marginBottom: 14 }}>Equipos aprobados ({approvedInsc.length})</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,200px),1fr))", gap: 10 }}>
                        {approvedInsc.map(i => (
                          <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                            <TeamLogo name={i.teamName} logoUrl={i.logoUrl} size={32} />
                            <div>
                              <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: 13 }}>{i.teamName}</p>
                              <p style={{ margin: 0, color: C.faint, fontSize: 10 }}>{i.userName}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* GROUPS */}
                  {hasGroups && (
                    <div style={{ marginBottom: 28 }}>
                      <p style={{ ...S.sectionTitle }}>Fase de grupos {t.format === "Grupos + Eliminatoria" && `· ${t.qualify} clasificados/grupo`} {t.legs > 1 && "· Doble vuelta"}</p>
                      {t.groups.map((g, gi) => (
                        <div key={gi} style={{ ...S.card, marginBottom: 16 }}>
                          <p style={{ ...S.label, color: C.gold, marginBottom: 12 }}>Grupo {g.name}</p>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ marginBottom: 18, minWidth: 320 }}>
                              <thead><tr>{["#", "Equipo", "PJ", "PTS", "GF", "GC", "DG"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                              <tbody>
                                {g.standings.map((s, si) => (
                                  <tr key={s.name} style={{ background: si < (t.qualify || 2) && t.format === "Grupos + Eliminatoria" ? "rgba(79,142,247,0.06)" : "transparent" }}>
                                    <td style={{ ...S.td, color: si < (t.qualify || 2) && t.format === "Grupos + Eliminatoria" ? C.blue : C.faint }}>{si + 1}</td>
                                    <td style={S.td}><TRow name={s.name} size={20} /></td>
                                    <td style={S.td}>{s.pj}</td>
                                    <td style={{ ...S.td, fontWeight: 700 }}>{s.pts}</td>
                                    <td style={S.td}>{s.gf}</td>
                                    <td style={S.td}>{s.gc}</td>
                                    <td style={{ ...S.td, color: s.gd >= 0 ? C.green : C.red }}>{s.gd > 0 ? "+" : ""}{s.gd}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p style={S.label}>Partidos {g.legs > 1 && "(doble vuelta)"}</p>
                          {g.matches.map((m, mi) => {
                            const key = `g${gi}-m${mi}`;
                            return (
                              <div key={mi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", flexWrap: "wrap" }}>
                                {m.leg === 2 && <span style={{ fontSize: 9, letterSpacing: 1, color: C.faint, minWidth: 20 }}>2V</span>}
                                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, minWidth: 80, overflow: "hidden" }}>
                                  <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={20} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: m.played && m.scoreA > m.scoreB ? 700 : 400 }}>{m.teamA}</span>
                                </div>
                                {m.played ? (
                                  <span style={{ fontWeight: 700, letterSpacing: 3, color: C.gold, fontSize: 14, flexShrink: 0 }}>{m.scoreA}—{m.scoreB}</span>
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.a ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], a: e.target.value } }))} style={S.numInput} />
                                    <span style={{ color: C.faint }}>—</span>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.b ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], b: e.target.value } }))} style={S.numInput} />
                                    <button style={S.btnSm} onClick={() => saveGroupResult(t, gi, mi)}>✓</button>
                                  </div>
                                )}
                                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end", minWidth: 80, overflow: "hidden" }}>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: m.played && m.scoreB > m.scoreA ? 700 : 400 }}>{m.teamB}</span>
                                  <TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={20} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      {t.format === "Grupos + Eliminatoria" && groupsDone && !hasElim && (
                        <button className="btn-hover" style={{ ...S.btn(C.gold), color: "#07090f", transition: "opacity .15s, transform .1s" }} onClick={() => generateElimFromGroups(t)}>Generar fase eliminatoria →</button>
                      )}
                    </div>
                  )}

                  {/* ELIMINATION */}
                  {hasElim && (
                    <div>
                      <p style={S.sectionTitle}>Fase eliminatoria</p>
                      {t.eliminationRounds.map((round, ri) => (
                        <div key={ri} style={{ marginBottom: 24 }}>
                          <p style={{ ...S.label, color: C.gold, marginBottom: 10 }}>{getRoundName(t.eliminationRounds.length, ri)}</p>
                          {round.matches.map((m, mi) => {
                            const key = `e${ri}-m${mi}`;
                            return (
                              <div key={mi} style={{ ...S.card, display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", flexWrap: "wrap", marginBottom: 8 }}>
                                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, fontWeight: m.winner === m.teamA ? 700 : 400, color: m.winner === m.teamA ? C.blue : C.text, minWidth: 80, overflow: "hidden" }}>
                                  <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={24} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{m.teamA}</span>
                                </div>
                                {m.winner ? (
                                  <span style={{ fontWeight: 700, letterSpacing: 3, color: C.blue, fontSize: 14, flexShrink: 0 }}>{m.scoreA}—{m.scoreB}</span>
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.a ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], a: e.target.value } }))} style={S.numInput} />
                                    <span style={{ color: C.faint }}>—</span>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.b ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], b: e.target.value } }))} style={S.numInput} />
                                    <button style={S.btnSm} onClick={() => saveElimResult(t, ri, mi)}>✓</button>
                                  </div>
                                )}
                                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", fontWeight: m.winner === m.teamB ? 700 : 400, color: m.winner === m.teamB ? C.blue : C.text, minWidth: 80, overflow: "hidden" }}>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{m.teamB}</span>
                                  <TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={24} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {/* ══ INSCRIPCIONES ══ */}
        {mainTab === "inscripciones" && (
          <>
            <h1 style={{ fontSize: "clamp(16px,4vw,24px)", fontWeight: 700, margin: "0 0 6px" }}>Inscripciones</h1>
            <p style={{ margin: "0 0 24px", color: C.muted, fontSize: 13 }}>{inscriptions.length} inscripciones · {pendingCount} pendientes</p>
            {inscriptions.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 10, padding: 48, textAlign: "center", color: C.faint }}>No hay inscripciones.</div>
            ) : inscriptions.map(i => {
              const tournament = tournaments.find(t => t.id === i.tournamentId);
              return (
                <div key={i.id} style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <TeamLogo name={i.teamName} logoUrl={i.logoUrl} size={42} />
                      <div>
                        <p style={{ margin: "0 0 3px", fontWeight: 700, fontSize: 14 }}>{i.teamName}</p>
                        <p style={{ margin: "0 0 2px", color: C.muted, fontSize: 12 }}>{i.userName} · {tournament?.name || "—"}</p>
                        <p style={{ margin: "0 0 1px", color: C.faint, fontSize: 11 }}>ID: {i.managerId || "—"} · 📞 {i.phone || "—"}</p>
                        {i.twitter && <p style={{ margin: 0, color: C.blue, fontSize: 11 }}>{i.twitter}</p>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={S.tag(i.status === "aprobada" ? C.green : i.status === "rechazada" ? C.red : C.gold)}>{i.status}</span>
                      {i.status === "pendiente" && (
                        <>
                          <button style={{ ...S.btnSm, borderColor: "rgba(82,214,138,0.4)", color: C.green }} onClick={() => handleInscription(i.id, "aprobada")}>Aprobar</button>
                          <button style={S.btnDanger} onClick={() => handleInscription(i.id, "rechazada")}>Rechazar</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ══ NOTICIAS ══ */}
        {mainTab === "noticias" && (
          <>
            <h1 style={{ fontSize: "clamp(16px,4vw,24px)", fontWeight: 700, margin: "0 0 24px" }}>Noticias</h1>
            <div style={{ ...S.card, marginBottom: 24 }}>
              <p style={{ ...S.label, color: C.gold, marginBottom: 16 }}>{editingNewsId ? "✏ Editando noticia" : "+ Nueva noticia"}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14 }}>
                  <div><label style={S.label}>Título</label><input style={S.input} placeholder="Título de la noticia..." value={newsForm.title} onChange={e => setNewsForm(p => ({ ...p, title: e.target.value }))} /></div>
                  <div><label style={S.label}>Categoría</label>
                    <select style={{ ...S.select, minWidth: 130 }} value={newsForm.category} onChange={e => setNewsForm(p => ({ ...p, category: e.target.value }))}>
                      <option>Noticia</option><option>Resultado</option><option>Convocatoria</option><option>Aviso</option>
                    </select>
                  </div>
                </div>
                <div><label style={S.label}>Contenido</label><textarea style={S.textarea} placeholder="Escribe el contenido..." value={newsForm.body} onChange={e => setNewsForm(p => ({ ...p, body: e.target.value }))} /></div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn-hover" style={{ ...S.btn(), transition: "opacity .15s, transform .1s" }} onClick={saveNews}>{editingNewsId ? "Actualizar" : "Publicar"} →</button>
                  {editingNewsId && <button style={S.btnSm} onClick={() => { setEditingNewsId(null); setNewsForm({ title: "", body: "", category: "Noticia" }); }}>Cancelar</button>}
                </div>
              </div>
            </div>

            {news.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 10, padding: 32, textAlign: "center", color: C.faint }}>No hay noticias publicadas.</div>
            ) : news.map(n => (
              <div key={n.id} style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={S.tag(catColor[n.category] || C.blue)}>{n.category}</span>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{n.title}</h3>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={S.btnSm} onClick={() => { setNewsForm({ title: n.title, body: n.body, category: n.category || "Noticia" }); setEditingNewsId(n.id); }}>Editar</button>
                    <button style={S.btnDanger} onClick={async () => { if (!window.confirm("¿Eliminar?")) return; await deleteDoc(doc(db, "news", n.id)); showNotif("Eliminada"); }}>Eliminar</button>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: C.faint }}>{new Date(n.createdAt).toLocaleDateString("es-ES")}</p>
                <p style={{ margin: "7px 0 0", fontSize: 12, color: "#7a8aa4", lineHeight: 1.6 }}>{n.body.substring(0, 180)}{n.body.length > 180 ? "..." : ""}</p>
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
