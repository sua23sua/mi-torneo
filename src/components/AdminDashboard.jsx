import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from "firebase/firestore";
import { useAuth } from "../AuthContext";
import { C, S, statusColor, getRoundName, buildGroups, applyGroupResult, buildSeededElimination, buildEliminationRound, TeamLogo, BottomNav } from "../shared.jsx";

const TABS = [
  { id: "torneos", icon: "🎮", label: "Torneos" },
  { id: "inscripciones", icon: "📝", label: "Inscripciones", badge: 0 },
  { id: "noticias", icon: "📰", label: "Noticias" },
];

export default function AdminDashboard({ onLogout }) {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState("torneos");
  const [tournaments, setTournaments] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [news, setNews] = useState([]);
  const [view, setView] = useState("list"); // list | new | detail
  const [activeTId, setActiveTId] = useState(null);
  const [notif, setNotif] = useState(null);
  const [scoreEdit, setScoreEdit] = useState({});
  const [newsForm, setNewsForm] = useState({ title: "", body: "", category: "Noticia" });
  const [editingNewsId, setEditingNewsId] = useState(null);
  const [form, setForm] = useState({ name: "", format: "Liga", groupCount: 2, qualify: 2, description: "", legs: 1 });
  const [showInscModal, setShowInscModal] = useState(false);
  const [inscTarget, setInscTarget] = useState(null);
  const [adminInscForm, setAdminInscForm] = useState({ teamName: "", managerId: "", phone: "", twitter: "" });

  function showNotif(msg) { setNotif(msg); setTimeout(() => setNotif(null), 2800); }
  function F(k, v) { setForm(p => ({ ...p, [k]: v })); }

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")), snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(query(collection(db, "inscriptions"), orderBy("createdAt", "desc")), snap => setInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u3 = onSnapshot(query(collection(db, "news"), orderBy("createdAt", "desc")), snap => setNews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); u3(); };
  }, []);

  const logoMap = {};
  inscriptions.forEach(i => { if (i.teamName && i.logoUrl) logoMap[i.teamName] = i.logoUrl; });
  const pendingCount = inscriptions.filter(i => i.status === "pendiente").length;

  function TRow({ name, size = 22 }) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <TeamLogo name={name} logoUrl={logoMap[name]} size={size} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      </span>
    );
  }

  async function createTournament() {
    if (!form.name.trim()) return showNotif("Introduce el nombre del torneo");
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

  async function startTournament(t) {
    const approved = inscriptions.filter(i => i.tournamentId === t.id && i.status === "aprobada");
    if (approved.length < 2) return showNotif("Se necesitan al menos 2 equipos aprobados");
    const teamNames = approved.map(i => i.teamName);
    const legs = t.legs || 1;
    let groups = null, eliminationRounds = [];
    if (t.format === "Eliminatoria") eliminationRounds = [{ round: 1, matches: buildEliminationRound(teamNames) }];
    else if (t.format === "Liga") groups = buildGroups(teamNames, 1, legs);
    else groups = buildGroups(teamNames, Math.min(parseInt(t.groupCount), Math.floor(teamNames.length / 2)), legs);
    await updateDoc(doc(db, "tournaments", t.id), { teams: teamNames, groups, eliminationRounds, status: "En curso" });
    showNotif("¡Torneo iniciado! ✓");
  }

  async function submitAdminInsc() {
    if (!adminInscForm.teamName.trim()) return showNotif("Escribe el nombre del equipo");
    await addDoc(collection(db, "inscriptions"), {
      tournamentId: inscTarget.id, tournamentName: inscTarget.name,
      userId: user.uid, userName: profile?.name || user.email,
      teamName: adminInscForm.teamName.trim(), managerId: adminInscForm.managerId.trim(),
      phone: adminInscForm.phone.trim(), twitter: adminInscForm.twitter.trim(),
      logoUrl: null, status: "aprobada",
      createdAt: new Date().toISOString(), addedByAdmin: true,
    });
    setAdminInscForm({ teamName: "", managerId: "", phone: "", twitter: "" });
    setShowInscModal(false);
    showNotif("Equipo añadido ✓");
  }

  async function saveGroupResult(t, gi, mi) {
    const key = `g${gi}-m${mi}`;
    const a = parseInt(scoreEdit[key]?.a), b = parseInt(scoreEdit[key]?.b);
    if (isNaN(a) || isNaN(b)) return showNotif("Introduce ambos marcadores");
    const newGroups = t.groups.map((g, idx) => {
      if (idx !== gi) return g;
      const newMatches = g.matches.map((m, i) => i !== mi ? m : { ...m, scoreA: a, scoreB: b, played: true });
      let standings = g.teams.map(t => ({ name: t, pts: 0, gf: 0, gc: 0, pj: 0, gd: 0 }));
      newMatches.forEach(m => { if (m.played) standings = applyGroupResult(standings, m.teamA, m.teamB, m.scoreA, m.scoreB); });
      return { ...g, matches: newMatches, standings };
    });
    await updateDoc(doc(db, "tournaments", t.id), { groups: newGroups });
    setScoreEdit(p => { const n = { ...p }; delete n[key]; return n; });
    showNotif("Guardado ✓");
  }

  async function saveElimResult(t, ri, mi) {
    const key = `e${ri}-m${mi}`;
    const a = parseInt(scoreEdit[key]?.a), b = parseInt(scoreEdit[key]?.b);
    if (isNaN(a) || isNaN(b) || a === b) return showNotif("Sin empate en eliminatoria");
    const newRounds = t.eliminationRounds.map((r, idx) => {
      if (idx !== ri) return r;
      return { ...r, matches: r.matches.map((m, i) => i !== mi ? m : { ...m, scoreA: a, scoreB: b, winner: a > b ? m.teamA : m.teamB }) };
    });
    const allDone = newRounds[ri].matches.every(m => m.winner);
    let finalRounds = newRounds, winner = null;
    if (allDone) {
      const winners = newRounds[ri].matches.map(m => m.winner).filter(w => w !== "BYE");
      if (winners.length === 1) winner = winners[0];
      else { finalRounds = [...newRounds, { round: newRounds.length + 1, matches: buildEliminationRound(winners) }]; }
    }
    await updateDoc(doc(db, "tournaments", t.id), { eliminationRounds: finalRounds, ...(winner ? { winner, status: "Finalizado" } : {}) });
    setScoreEdit(p => { const n = { ...p }; delete n[key]; return n; });
    if (winner) showNotif(`🏆 ¡${winner} campeón!`);
    else showNotif("Guardado ✓");
  }

  async function generateElimFromGroups(t) {
    const matches = buildSeededElimination(t.groups, t.qualify || 2);
    if (!matches.length) return showNotif("No hay suficientes clasificados");
    await updateDoc(doc(db, "tournaments", t.id), { eliminationRounds: [{ round: 1, matches }] });
    showNotif("Fase eliminatoria generada ✓");
  }

  async function handleInscription(id, status) {
    await updateDoc(doc(db, "inscriptions", id), { status });
    showNotif(status === "aprobada" ? "Aprobada ✓" : "Rechazada");
  }

  async function saveNews() {
    if (!newsForm.title.trim() || !newsForm.body.trim()) return showNotif("Rellena título y contenido");
    if (editingNewsId) {
      await updateDoc(doc(db, "news", editingNewsId), { ...newsForm, updatedAt: new Date().toISOString() });
      showNotif("Actualizada ✓");
    } else {
      await addDoc(collection(db, "news"), { ...newsForm, createdAt: new Date().toISOString(), createdBy: user.uid });
      showNotif("Publicada ✓");
    }
    setNewsForm({ title: "", body: "", category: "Noticia" });
    setEditingNewsId(null);
  }

  const activeTournament = tournaments.find(t => t.id === activeTId);
  const catColor = { Noticia: C.blue, Resultado: C.green, Convocatoria: C.gold, Aviso: C.red };

  const navTabs = TABS.map(t => ({ ...t, badge: t.id === "inscripciones" ? pendingCount : 0 }));

  return (
    <div style={S.wrap}>
      {notif && <div style={{ position: "fixed", top: 16, left: 16, right: 16, background: C.blue, color: "#fff", padding: "13px 16px", zIndex: 1000, fontSize: 13, fontFamily: "'Georgia',serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", borderRadius: 10, textAlign: "center", fontWeight: 600 }}>{notif}</div>}

      {/* Add team modal - full screen */}
      {showInscModal && inscTarget && (
        <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: 300, overflowY: "auto" }}>
          <div style={{ ...S.topBar, position: "relative", flexShrink: 0 }}>
            <button onClick={() => setShowInscModal(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: "'Georgia',serif", fontSize: 13, padding: 0 }}>← Cancelar</button>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Añadir equipo</span>
            <div style={{ width: 80 }} />
          </div>
          <div style={{ padding: "24px 16px 40px" }}>
            <p style={{ margin: "0 0 22px", color: C.muted, fontSize: 14 }}>{inscTarget.name} · aprobado automáticamente</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div><label style={S.label}>Nombre del equipo *</label><input style={S.input} placeholder="Nombre del equipo" value={adminInscForm.teamName} onChange={e => setAdminInscForm(p => ({ ...p, teamName: e.target.value }))} /></div>
              <div><label style={S.label}>ID Manager</label><input style={S.input} placeholder="ID de FIFA" value={adminInscForm.managerId} onChange={e => setAdminInscForm(p => ({ ...p, managerId: e.target.value }))} /></div>
              <div><label style={S.label}>Teléfono</label><input style={S.input} placeholder="+34 600 000 000" value={adminInscForm.phone} onChange={e => setAdminInscForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <div><label style={S.label}>X / Twitter</label><input style={S.input} placeholder="@cuenta" value={adminInscForm.twitter} onChange={e => setAdminInscForm(p => ({ ...p, twitter: e.target.value }))} /></div>
              <button style={S.btn()} onClick={submitAdminInsc}>Añadir equipo →</button>
            </div>
          </div>
        </div>
      )}

      <style>{`*{box-sizing:border-box;}input:focus,select:focus,textarea:focus{outline:none;border-color:#4f8ef7!important;}input::placeholder,textarea::placeholder{color:rgba(200,212,228,0.18)!important;}table{border-collapse:collapse;width:100%;}body{overscroll-behavior-y:contain;}`}</style>

      {/* Top bar */}
      <header style={S.topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {(view !== "list") ? (
            <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: "'Georgia',serif", fontSize: 13, padding: "0 8px 0 0" }}>←</button>
          ) : null}
          <div style={{ width: 28, height: 28, background: "linear-gradient(135deg,#4f8ef7,#2a6fd4)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>⚔</div>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.blue }}>Admin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.muted, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.name || user?.email}</span>
          <button style={S.btnSm} onClick={onLogout}>Salir</button>
        </div>
      </header>

      <main style={S.main}>

        {/* ══ TORNEOS ══ */}
        {tab === "torneos" && (
          <>
            {/* LIST */}
            {view === "list" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <p style={S.pageTitle}>Torneos</p>
                    <p style={S.pageSubtitle}>{tournaments.length} torneos creados</p>
                  </div>
                  <button style={{ ...S.btnInline(), flexShrink: 0 }} onClick={() => setView("new")}>+ Nuevo</button>
                </div>
                {tournaments.length === 0
                  ? <div style={{ ...S.card, textAlign: "center", padding: 48, color: C.faint }}><div style={{ fontSize: 36, marginBottom: 12 }}>🎮</div>No hay torneos.</div>
                  : tournaments.map(t => {
                    const tInsc = inscriptions.filter(i => i.tournamentId === t.id && i.status === "aprobada");
                    return (
                      <div key={t.id} style={{ ...S.card, cursor: "pointer" }} onClick={() => { setActiveTId(t.id); setView("detail"); }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                          <div style={{ width: 40, height: 40, background: "rgba(79,142,247,0.1)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🎮</div>
                          <span style={S.tag(statusColor[t.status] || "#6b7a90")}>{t.status}</span>
                        </div>
                        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>{t.name}</h3>
                        <p style={{ margin: "0 0 10px", color: C.muted, fontSize: 12 }}>{t.format} · {t.legs > 1 ? "2 vueltas" : "1 vuelta"} · {tInsc.length} equipos</p>
                        {t.winner && <span style={{ color: C.gold, fontSize: 12 }}>🏆 {t.winner}</span>}
                      </div>
                    );
                  })
                }
              </>
            )}

            {/* NEW */}
            {view === "new" && (
              <>
                <p style={S.pageTitle}>Nuevo torneo</p>
                <p style={S.pageSubtitle}>Los equipos se añadirán mediante inscripciones</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div><label style={S.label}>Nombre del torneo</label><input style={S.input} placeholder="Copa de Campeones 2026" value={form.name} onChange={e => F("name", e.target.value)} /></div>
                  <div><label style={S.label}>Descripción (opcional)</label><input style={S.input} placeholder="Breve descripción..." value={form.description} onChange={e => F("description", e.target.value)} /></div>
                  <div>
                    <label style={S.label}>Formato</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[["Liga", "🏆"], ["Eliminatoria", "⚔"], ["Grupos + Eliminatoria", "🎯"]].map(([f, icon]) => (
                        <button key={f} onClick={() => F("format", f)} style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${form.format === f ? C.blue : "rgba(255,255,255,0.09)"}`, background: form.format === f ? "rgba(79,142,247,0.1)" : "rgba(255,255,255,0.02)", color: form.format === f ? C.blue : C.muted, cursor: "pointer", fontSize: 14, fontFamily: "'Georgia',serif", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 20 }}>{icon}</span> {f}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(form.format === "Liga" || form.format === "Grupos + Eliminatoria") && (
                    <div>
                      <label style={S.label}>Vueltas</label>
                      <div style={{ display: "flex", gap: 10 }}>
                        {[[1, "⭕ Una vuelta"], [2, "🔄 Doble vuelta"]].map(([l, label]) => (
                          <button key={l} onClick={() => F("legs", l)} style={{ flex: 1, padding: "13px 8px", borderRadius: 10, border: `1px solid ${form.legs === l ? C.gold : "rgba(255,255,255,0.09)"}`, background: form.legs === l ? "rgba(232,184,75,0.1)" : "rgba(255,255,255,0.02)", color: form.legs === l ? C.gold : C.muted, cursor: "pointer", fontSize: 13, fontFamily: "'Georgia',serif" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {form.format === "Grupos + Eliminatoria" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div><label style={S.label}>Nº grupos</label><input style={S.input} type="number" min={2} max={8} value={form.groupCount} onChange={e => F("groupCount", e.target.value)} /></div>
                      <div><label style={S.label}>Clasificados/grupo</label><input style={S.input} type="number" min={1} max={4} value={form.qualify} onChange={e => F("qualify", e.target.value)} /></div>
                    </div>
                  )}
                  <div style={{ background: "rgba(79,142,247,0.06)", border: "1px solid rgba(79,142,247,0.15)", borderRadius: 10, padding: 16 }}>
                    <p style={{ margin: "0 0 4px", fontSize: 13, color: C.blue, fontWeight: 700 }}>ℹ Equipos vía inscripciones</p>
                    <p style={{ margin: 0, fontSize: 13, color: C.muted }}>Acepta inscripciones y pulsa "Iniciar torneo" para generar los partidos.</p>
                  </div>
                  <button style={S.btn()} onClick={createTournament}>Crear torneo →</button>
                </div>
              </>
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
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t.name}</h1>
                      <span style={S.tag(statusColor[t.status] || "#6b7a90")}>{t.status}</span>
                    </div>
                    <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>{t.format} · {t.legs > 1 ? "2 vueltas" : "1 vuelta"} · {approvedInsc.length} equipos</p>
                    {t.winner && <p style={{ margin: "6px 0 0", color: C.gold }}>🏆 {t.winner}</p>}
                  </div>

                  {/* Status buttons - scrollable row */}
                  <div style={{ overflowX: "auto", marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 8, paddingBottom: 4, width: "max-content" }}>
                      {["Abierto", "En curso", "Finalizado", "Cerrado"].map(s => (
                        <button key={s} style={{ ...S.btnSm, borderColor: t.status === s ? (statusColor[s] || "#fff") : undefined, color: t.status === s ? (statusColor[s] || "#fff") : undefined }}
                          onClick={() => updateDoc(doc(db, "tournaments", t.id), { status: s })}>{s}</button>
                      ))}
                      <button style={{ ...S.btnSm, borderColor: "rgba(79,142,247,0.4)", color: C.blue }} onClick={() => { setInscTarget(t); setShowInscModal(true); }}>+ Equipo</button>
                      <button style={S.btnDanger} onClick={async () => { if (!window.confirm("¿Eliminar?")) return; await deleteDoc(doc(db, "tournaments", t.id)); setView("list"); }}>Eliminar</button>
                    </div>
                  </div>

                  {canStart && (
                    <div style={{ background: "rgba(82,214,138,0.08)", border: "1px solid rgba(82,214,138,0.25)", borderRadius: 10, padding: 16, marginBottom: 14 }}>
                      <p style={{ margin: "0 0 10px", color: C.green, fontSize: 13 }}>✓ {approvedInsc.length} equipos listos</p>
                      <button style={{ ...S.btn(C.green), color: "#07090f" }} onClick={() => startTournament(t)}>▶ Iniciar torneo</button>
                    </div>
                  )}

                  {/* Pending */}
                  {pendingInsc.length > 0 && (
                    <div style={{ ...S.card, marginBottom: 14 }}>
                      <p style={{ ...S.label, marginBottom: 12 }}>Pendientes ({pendingInsc.length})</p>
                      {pendingInsc.map(i => (
                        <div key={i.id} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                            <TeamLogo name={i.teamName} logoUrl={i.logoUrl} size={40} />
                            <div>
                              <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 14 }}>{i.teamName}</p>
                              <p style={{ margin: "0 0 1px", color: C.muted, fontSize: 12 }}>{i.userName}</p>
                              <p style={{ margin: 0, color: C.faint, fontSize: 11 }}>📞 {i.phone || "—"} · ID: {i.managerId || "—"}</p>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button style={{ ...S.btnSm, flex: 1, borderColor: "rgba(82,214,138,0.4)", color: C.green }} onClick={() => handleInscription(i.id, "aprobada")}>Aprobar</button>
                            <button style={{ ...S.btnDanger, flex: 1 }} onClick={() => handleInscription(i.id, "rechazada")}>Rechazar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Approved teams list before start */}
                  {approvedInsc.length > 0 && !hasGroups && !hasElim && (
                    <div style={{ ...S.card, marginBottom: 14 }}>
                      <p style={{ ...S.label, marginBottom: 12 }}>Equipos ({approvedInsc.length})</p>
                      {approvedInsc.map(i => (
                        <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <TeamLogo name={i.teamName} logoUrl={i.logoUrl} size={32} />
                          <div>
                            <p style={{ margin: "0 0 1px", fontWeight: 600, fontSize: 13 }}>{i.teamName}</p>
                            <p style={{ margin: 0, color: C.faint, fontSize: 11 }}>{i.userName}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* GROUPS */}
                  {hasGroups && (
                    <div style={{ marginBottom: 20 }}>
                      <p style={S.sectionTitle}>Fase de grupos {t.legs > 1 && "· Doble vuelta"}</p>
                      {t.groups.map((g, gi) => (
                        <div key={gi} style={{ ...S.card, marginBottom: 12 }}>
                          <p style={{ ...S.label, color: C.gold, marginBottom: 10 }}>Grupo {g.name}</p>
                          <div style={{ overflowX: "auto", marginBottom: 14 }}>
                            <table style={{ minWidth: 260 }}>
                              <thead><tr>{["#", "Equipo", "PJ", "PTS", "GF", "GC", "DG"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                              <tbody>
                                {g.standings.map((s, si) => (
                                  <tr key={s.name} style={{ background: si < (t.qualify || 2) && t.format === "Grupos + Eliminatoria" ? "rgba(79,142,247,0.06)" : "transparent" }}>
                                    <td style={{ ...S.td, color: C.faint }}>{si + 1}</td>
                                    <td style={S.td}><TRow name={s.name} size={18} /></td>
                                    <td style={{ ...S.td, textAlign: "center" }}>{s.pj}</td>
                                    <td style={{ ...S.td, fontWeight: 700, textAlign: "center" }}>{s.pts}</td>
                                    <td style={{ ...S.td, textAlign: "center" }}>{s.gf}</td>
                                    <td style={{ ...S.td, textAlign: "center" }}>{s.gc}</td>
                                    <td style={{ ...S.td, color: s.gd >= 0 ? C.green : C.red, textAlign: "center" }}>{s.gd > 0 ? "+" : ""}{s.gd}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p style={S.label}>Partidos</p>
                          {g.matches.map((m, mi) => {
                            const key = `g${gi}-m${mi}`;
                            return (
                              <div key={mi} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: m.played ? 0 : 8 }}>
                                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                    <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={20} />
                                    <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: m.played && m.scoreA > m.scoreB ? 700 : 400 }}>{m.teamA}</span>
                                  </div>
                                  {m.played
                                    ? <span style={{ fontWeight: 700, fontSize: 15, color: C.gold, letterSpacing: 2, flexShrink: 0, minWidth: 50, textAlign: "center" }}>{m.scoreA}–{m.scoreB}</span>
                                    : <span style={{ color: C.faint, fontSize: 12, flexShrink: 0, minWidth: 30, textAlign: "center" }}>vs</span>}
                                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", minWidth: 0 }}>
                                    <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: m.played && m.scoreB > m.scoreA ? 700 : 400 }}>{m.teamB}</span>
                                    <TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={20} />
                                  </div>
                                </div>
                                {!m.played && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.a ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], a: e.target.value } }))} style={{ ...S.numInput, fontSize: 18, width: 56, padding: 10 }} />
                                    <span style={{ color: C.faint, fontSize: 18 }}>—</span>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.b ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], b: e.target.value } }))} style={{ ...S.numInput, fontSize: 18, width: 56, padding: 10 }} />
                                    <button style={{ ...S.btnInline(C.blue), padding: "10px 18px" }} onClick={() => saveGroupResult(t, gi, mi)}>Guardar</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      {t.format === "Grupos + Eliminatoria" && groupsDone && !hasElim && (
                        <button style={S.btn(C.gold)} onClick={() => generateElimFromGroups(t)}>Generar fase eliminatoria →</button>
                      )}
                    </div>
                  )}

                  {/* ELIMINATION */}
                  {hasElim && (
                    <div>
                      <p style={S.sectionTitle}>Fase eliminatoria</p>
                      {t.eliminationRounds.map((round, ri) => (
                        <div key={ri} style={{ marginBottom: 20 }}>
                          <p style={{ ...S.label, color: C.gold, marginBottom: 10 }}>{getRoundName(t.eliminationRounds.length, ri)}</p>
                          {round.matches.map((m, mi) => {
                            const key = `e${ri}-m${mi}`;
                            return (
                              <div key={mi} style={{ ...S.card, marginBottom: 8, padding: "14px 14px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: m.winner ? 0 : 12 }}>
                                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, minWidth: 0, fontWeight: m.winner === m.teamA ? 700 : 400, color: m.winner === m.teamA ? C.blue : C.text }}>
                                    <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={24} />
                                    <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
                                  </div>
                                  {m.winner
                                    ? <span style={{ fontWeight: 700, fontSize: 15, color: C.blue, letterSpacing: 2, flexShrink: 0 }}>{m.scoreA}–{m.scoreB}</span>
                                    : <span style={{ color: C.faint, fontSize: 12, flexShrink: 0 }}>vs</span>}
                                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end", minWidth: 0, fontWeight: m.winner === m.teamB ? 700 : 400, color: m.winner === m.teamB ? C.blue : C.text }}>
                                    <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
                                    <TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={24} />
                                  </div>
                                </div>
                                {!m.winner && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.a ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], a: e.target.value } }))} style={{ ...S.numInput, fontSize: 18, width: 56, padding: 10 }} />
                                    <span style={{ color: C.faint, fontSize: 18 }}>—</span>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.b ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], b: e.target.value } }))} style={{ ...S.numInput, fontSize: 18, width: 56, padding: 10 }} />
                                    <button style={{ ...S.btnInline(C.blue), padding: "10px 18px" }} onClick={() => saveElimResult(t, ri, mi)}>Guardar</button>
                                  </div>
                                )}
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
        {tab === "inscripciones" && (
          <>
            <p style={S.pageTitle}>Inscripciones</p>
            <p style={S.pageSubtitle}>{inscriptions.length} total · {pendingCount} pendientes</p>
            {inscriptions.length === 0
              ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: C.faint }}>No hay inscripciones.</div>
              : inscriptions.map(i => {
                const tournament = tournaments.find(t => t.id === i.tournamentId);
                return (
                  <div key={i.id} style={S.card}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                      <TeamLogo name={i.teamName} logoUrl={i.logoUrl} size={44} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 15 }}>{i.teamName}</p>
                        <p style={{ margin: "0 0 1px", color: C.muted, fontSize: 12 }}>{i.userName} · {tournament?.name || "—"}</p>
                        <p style={{ margin: "0 0 1px", color: C.faint, fontSize: 11 }}>ID: {i.managerId || "—"} · 📞 {i.phone || "—"}</p>
                        {i.twitter && <p style={{ margin: 0, color: C.blue, fontSize: 11 }}>{i.twitter}</p>}
                      </div>
                      <span style={S.tag(i.status === "aprobada" ? C.green : i.status === "rechazada" ? C.red : C.gold)}>{i.status}</span>
                    </div>
                    {i.status === "pendiente" && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={{ ...S.btnSm, flex: 1, borderColor: "rgba(82,214,138,0.4)", color: C.green }} onClick={() => handleInscription(i.id, "aprobada")}>Aprobar</button>
                        <button style={{ ...S.btnDanger, flex: 1 }} onClick={() => handleInscription(i.id, "rechazada")}>Rechazar</button>
                      </div>
                    )}
                  </div>
                );
              })
            }
          </>
        )}

        {/* ══ NOTICIAS ══ */}
        {tab === "noticias" && (
          <>
            <p style={S.pageTitle}>Noticias</p>
            <p style={S.pageSubtitle}>{news.length} publicadas</p>
            <div style={S.card}>
              <p style={{ ...S.label, color: C.gold, marginBottom: 14 }}>{editingNewsId ? "✏ Editando" : "+ Nueva noticia"}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div><label style={S.label}>Título</label><input style={S.input} placeholder="Título de la noticia..." value={newsForm.title} onChange={e => setNewsForm(p => ({ ...p, title: e.target.value }))} /></div>
                <div>
                  <label style={S.label}>Categoría</label>
                  <select style={S.select} value={newsForm.category} onChange={e => setNewsForm(p => ({ ...p, category: e.target.value }))}>
                    <option>Noticia</option><option>Resultado</option><option>Convocatoria</option><option>Aviso</option>
                  </select>
                </div>
                <div><label style={S.label}>Contenido</label><textarea style={S.textarea} placeholder="Escribe el contenido..." value={newsForm.body} onChange={e => setNewsForm(p => ({ ...p, body: e.target.value }))} /></div>
                <button style={S.btn()} onClick={saveNews}>{editingNewsId ? "Actualizar" : "Publicar"} →</button>
                {editingNewsId && <button style={S.btnSm} onClick={() => { setEditingNewsId(null); setNewsForm({ title: "", body: "", category: "Noticia" }); }}>Cancelar</button>}
              </div>
            </div>

            {news.length === 0
              ? <div style={{ ...S.card, textAlign: "center", padding: 32, color: C.faint, marginTop: 10 }}>No hay noticias publicadas.</div>
              : news.map(n => (
                <div key={n.id} style={{ ...S.card, marginTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                        <span style={S.tag(catColor[n.category] || C.blue)}>{n.category}</span>
                        <span style={{ fontSize: 10, color: C.faint }}>{new Date(n.createdAt).toLocaleDateString("es-ES")}</span>
                      </div>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{n.title}</h3>
                    </div>
                  </div>
                  <p style={{ margin: "6px 0 12px", fontSize: 12, color: "#7a8aa4", lineHeight: 1.5 }}>{n.body.substring(0, 120)}{n.body.length > 120 ? "..." : ""}</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ ...S.btnSm, flex: 1 }} onClick={() => { setNewsForm({ title: n.title, body: n.body, category: n.category || "Noticia" }); setEditingNewsId(n.id); window.scrollTo(0, 0); }}>Editar</button>
                    <button style={{ ...S.btnDanger, flex: 1 }} onClick={async () => { if (!window.confirm("¿Eliminar?")) return; await deleteDoc(doc(db, "news", n.id)); showNotif("Eliminada"); }}>Eliminar</button>
                  </div>
                </div>
              ))
            }
          </>
        )}
      </main>

      <BottomNav tabs={navTabs} active={tab} onChange={(t) => { setTab(t); setView("list"); }} color={C.blue} />
    </div>
  );
}
