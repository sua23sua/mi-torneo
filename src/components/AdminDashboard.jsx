import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from "firebase/firestore";
import { useAuth } from "../AuthContext";
import { C, S, statusColor, buildGroups, buildSeededElimination, buildEliminationRound, TeamLogo, BottomNav, formatDatetime, getRoundName, isTournamentActive, TOURNAMENT_TYPES } from "../shared.jsx";
import MatchesPanel, { collectMatchdays } from "./MatchesPanel.jsx";
import RankingPanel from "./RankingPanel.jsx";
import { NormativaEditor } from "./NormativaPanel.jsx";

const TABS = [
  { id: "torneos",       icon: "🎮", label: "Torneos" },
  { id: "partidos",      icon: "⚽", label: "Partidos" },
  { id: "ranking",       icon: "📊", label: "Ranking" },
  { id: "inscripciones", icon: "📝", label: "Inscripciones" },
  { id: "noticias",      icon: "📰", label: "Noticias" },
  { id: "normativa",     icon: "📋", label: "Normas" },
];

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function formatDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  catch { return iso; }
}

export default function AdminDashboard({ onLogout }) {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState("torneos");
  const [tournaments, setTournaments] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [news, setNews] = useState([]);
  const [view, setView] = useState("list");
  const [activeTId, setActiveTId] = useState(null);
  const [notif, setNotif] = useState(null);
  const [newsForm, setNewsForm] = useState({ title: "", body: "", category: "Noticia" });
  const [editingNewsId, setEditingNewsId] = useState(null);
  const [form, setForm] = useState({
    name: "", format: "Liga", groupCount: 2, qualify: 2,
    description: "", legs: 1, whatsappLink: "",
    multiDate: false, tournamentType: "rapido", startDate: "",
  });
  const [editForm, setEditForm] = useState({
    format: "Liga", groupCount: 2, qualify: 2, legs: 1,
    multiDate: false, tournamentType: "rapido", startDate: "",
  });
  const [showInscModal, setShowInscModal] = useState(false);
  const [inscTarget, setInscTarget] = useState(null);
  const [adminInscForm, setAdminInscForm] = useState({ teamName: "", managerId: "", phone: "", twitter: "" });
  const [scheduleEdits, setScheduleEdits] = useState({});
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [resetting, setResetting] = useState(false);
  const now = new Date();
  const [histMonth, setHistMonth] = useState(now.getMonth());
  const [histYear, setHistYear] = useState(now.getFullYear());
  const [histSearch, setHistSearch] = useState("");
  const [tourneySubTab, setTourneySubTab] = useState("activos");

  function showNotif(msg) { setNotif(msg); setTimeout(() => setNotif(null), 3000); }
  function F(k, v) { setForm(p => ({ ...p, [k]: v })); }
  function EF(k, v) { setEditForm(p => ({ ...p, [k]: v })); }

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")), snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(query(collection(db, "inscriptions"), orderBy("createdAt", "desc")), snap => setInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u3 = onSnapshot(query(collection(db, "news"), orderBy("createdAt", "desc")), snap => setNews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); u3(); };
  }, []);

  useEffect(() => {
    if (view === "schedule" && activeTId) {
      const t = tournaments.find(t => t.id === activeTId);
      if (t) setScheduleEdits(t.matchdaySchedule || {});
    }
    if (view === "editconfig" && activeTId) {
      const t = tournaments.find(t => t.id === activeTId);
      if (t) setEditForm({
        format: t.format || "Liga", groupCount: t.groupCount || 2,
        qualify: t.qualify || 2, legs: t.legs || 1,
        multiDate: t.multiDate || false, tournamentType: t.tournamentType || "rapido",
        startDate: t.startDate ? t.startDate.slice(0, 10) : "",
      });
    }
  }, [view, activeTId]);

  const logoMap = {};
  inscriptions.forEach(i => { if (i.teamName && i.logoUrl) logoMap[i.teamName] = i.logoUrl; });
  const pendingCount  = inscriptions.filter(i => i.status === "pendiente").length;
  const conflictCount = tournaments.flatMap(t => [...(t.groups || []).flatMap(g => g.matches || []), ...(t.eliminationRounds || []).flatMap(r => r.matches || [])]).filter(m => m.matchStatus === "conflicto").length;
  const navTabs = TABS.map(t => ({ ...t, badge: t.id === "inscripciones" ? pendingCount : t.id === "partidos" ? conflictCount : 0 }));

  const activeTournaments  = tournaments.filter(isTournamentActive);
  const historyTournaments = tournaments.filter(t => !isTournamentActive(t));
  const filteredHistory = historyTournaments.filter(t => {
    const d = new Date(t.finishedAt || t.createdAt);
    return d.getMonth() === histMonth && d.getFullYear() === histYear && (!histSearch || t.name.toLowerCase().includes(histSearch.toLowerCase()));
  });
  const availableYears = [...new Set(historyTournaments.map(t => new Date(t.finishedAt || t.createdAt).getFullYear()))].sort((a, b) => b - a);
  const activeInscriptions = inscriptions.filter(i => { const t = tournaments.find(t => t.id === i.tournamentId); return t && isTournamentActive(t); });

  function TRow({ name, size = 22 }) {
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}><TeamLogo name={name} logoUrl={logoMap[name]} size={size} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span></span>;
  }

  async function createTournament() {
    if (!form.name.trim()) return showNotif("Introduce el nombre del torneo");
    await addDoc(collection(db, "tournaments"), {
      name: form.name.trim(), description: form.description.trim(),
      sport: "FIFA Clubes Pro", format: form.format,
      groupCount: parseInt(form.groupCount), qualify: parseInt(form.qualify),
      legs: parseInt(form.legs), whatsappLink: form.whatsappLink.trim(),
      multiDate: form.multiDate, tournamentType: form.tournamentType,
      startDate: form.startDate || null,
      teams: [], groups: null, eliminationRounds: [], matchdaySchedule: {},
      status: "Abierto", winner: null,
      createdAt: new Date().toISOString(), createdBy: user.uid,
    });
    setForm({ name: "", format: "Liga", groupCount: 2, qualify: 2, description: "", legs: 1, whatsappLink: "", multiDate: false, tournamentType: "rapido", startDate: "" });
    setView("list"); showNotif("Torneo creado ✓");
  }

  async function saveEditConfig() {
    if (!activeTId) return;
    await updateDoc(doc(db, "tournaments", activeTId), {
      format: editForm.format, groupCount: parseInt(editForm.groupCount),
      qualify: parseInt(editForm.qualify), legs: parseInt(editForm.legs),
      multiDate: editForm.multiDate, tournamentType: editForm.tournamentType,
      startDate: editForm.startDate || null,
    });
    setView("detail"); showNotif("Configuración actualizada ✓");
  }

  async function startTournament(t) {
    const approved = inscriptions.filter(i => i.tournamentId === t.id && i.status === "aprobada");
    if (approved.length < 2) return showNotif("Se necesitan al menos 2 equipos");
    const teamNames = approved.map(i => i.teamName);
    const legs = t.legs || 1;
    let groups = null, eliminationRounds = [];
    if (t.format === "Eliminatoria") eliminationRounds = [{ round: 1, matches: buildEliminationRound(teamNames) }];
    else if (t.format === "Liga") groups = buildGroups(teamNames, 1, legs);
    else groups = buildGroups(teamNames, Math.min(parseInt(t.groupCount), Math.floor(teamNames.length / 2)), legs);
    await updateDoc(doc(db, "tournaments", t.id), { teams: teamNames, groups, eliminationRounds, status: "En curso" });
    showNotif("¡Torneo iniciado! ✓");
  }

  async function resetTournament(t) {
    if (!window.confirm(`¿Reiniciar "${t.name}"?\n\nSe borrarán grupos, partidos y resultados.\nLas inscripciones aprobadas se conservan.`)) return;
    setResetting(true);
    await updateDoc(doc(db, "tournaments", t.id), { teams: [], groups: null, eliminationRounds: [], matchdaySchedule: {}, winner: null, status: "Abierto" });
    setResetting(false); showNotif("Torneo reiniciado ✓");
  }

  async function saveSchedule() {
    setSavingSchedule(true);
    await updateDoc(doc(db, "tournaments", activeTId), { matchdaySchedule: scheduleEdits });
    setSavingSchedule(false); showNotif("Horarios guardados ✓");
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
    setShowInscModal(false); showNotif("Equipo añadido ✓");
  }

  async function handleInscription(id, status) {
    await updateDoc(doc(db, "inscriptions", id), { status });
    showNotif(status === "aprobada" ? "Aprobada ✓" : "Rechazada");
  }

  async function saveNews() {
    if (!newsForm.title.trim() || !newsForm.body.trim()) return showNotif("Rellena título y contenido");
    if (editingNewsId) { await updateDoc(doc(db, "news", editingNewsId), { ...newsForm, updatedAt: new Date().toISOString() }); showNotif("Actualizada ✓"); }
    else { await addDoc(collection(db, "news"), { ...newsForm, createdAt: new Date().toISOString(), createdBy: user.uid }); showNotif("Publicada ✓"); }
    setNewsForm({ title: "", body: "", category: "Noticia" }); setEditingNewsId(null);
  }

  function handleBack() {
    if (view === "schedule" || view === "editconfig") setView("detail");
    else setView("list");
  }

  const activeTournament = tournaments.find(t => t.id === activeTId);
  const catColor = { Noticia: C.blue, Resultado: C.green, Convocatoria: C.gold, Aviso: C.red };
  const scheduleMatchdays = activeTournament ? collectMatchdays([activeTournament]) : [];

  function TournamentCard({ t }) {
    const ttype = TOURNAMENT_TYPES[t.tournamentType] || TOURNAMENT_TYPES.rapido;
    const tConflicts = [...(t.groups || []).flatMap(g => g.matches || []), ...(t.eliminationRounds || []).flatMap(r => r.matches || [])].filter(m => m.matchStatus === "conflicto").length;
    const tInsc = inscriptions.filter(i => i.tournamentId === t.id && i.status === "aprobada").length;
    return (
      <div style={{ ...S.card, cursor: "pointer" }} onClick={() => { setActiveTId(t.id); setView("detail"); }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 40, height: 40, background: `${ttype.color}18`, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{ttype.icon}</div>
            <span style={{ fontSize: 10, color: ttype.color, letterSpacing: 1, textTransform: "uppercase" }}>{ttype.label}</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {tConflicts > 0 && <span style={S.tag(C.red)}>⚠️ {tConflicts}</span>}
            <span style={S.tag(statusColor[t.status] || "#6b7a90")}>{t.status}</span>
          </div>
        </div>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>{t.name}</h3>
        {t.startDate && <p style={{ margin: "0 0 4px", fontSize: 12, color: C.blue }}>📅 {formatDate(t.startDate)}</p>}
        <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>{t.format} · {t.legs > 1 ? "2 vueltas" : "1 vuelta"} · {tInsc} equipos · K={ttype.kBase}</p>
        {t.winner && <p style={{ margin: "6px 0 0", color: C.gold, fontSize: 12 }}>🏆 {t.winner}</p>}
      </div>
    );
  }

  // Reusable config form
  function ConfigForm({ values, onChange, showNameDesc = false }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {showNameDesc && (
          <>
            <div><label style={S.label}>Nombre</label><input style={S.input} placeholder="Copa de Campeones 2026" value={values.name} onChange={e => onChange("name", e.target.value)} /></div>
            <div><label style={S.label}>Descripción</label><input style={S.input} placeholder="Opcional..." value={values.description} onChange={e => onChange("description", e.target.value)} /></div>
            <div><label style={S.label}>Enlace grupo WhatsApp</label><input style={S.input} placeholder="https://chat.whatsapp.com/..." value={values.whatsappLink} onChange={e => onChange("whatsappLink", e.target.value)} /></div>
          </>
        )}

        {/* Start date */}
        <div>
          <label style={S.label}>Fecha de inicio</label>
          <input type="date" style={{ ...S.input, fontSize: 15 }} value={values.startDate || ""} onChange={e => onChange("startDate", e.target.value)} />
          {values.startDate && <p style={{ margin: "6px 0 0", fontSize: 12, color: C.blue }}>📅 {formatDate(values.startDate)}</p>}
        </div>

        {/* Tournament type */}
        <div>
          <label style={S.label}>Tipo de torneo · factor K ELO</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.values(TOURNAMENT_TYPES).map(tt => (
              <button key={tt.id} onClick={() => onChange("tournamentType", tt.id)} style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${values.tournamentType === tt.id ? tt.color : "rgba(255,255,255,0.09)"}`, background: values.tournamentType === tt.id ? `${tt.color}14` : "rgba(255,255,255,0.02)", cursor: "pointer", fontFamily: "'Georgia',serif", textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{tt.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: values.tournamentType === tt.id ? tt.color : C.text }}>{tt.label}</p>
                  <p style={{ margin: 0, fontSize: 11, color: C.muted }}>{tt.desc}</p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ margin: "0 0 1px", fontSize: 13, fontWeight: 700, color: values.tournamentType === tt.id ? tt.color : C.muted }}>K={tt.kBase}</p>
                  <p style={{ margin: 0, fontSize: 9, color: C.faint, letterSpacing: 1 }}>BASE</p>
                </div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ margin: 0, fontSize: 11, color: C.faint }}>
              K efectiva = K base × √(equipos/8) × 1.25 en eliminatoria × 2 primeros 10 partidos
            </p>
          </div>
        </div>

        {/* Format */}
        <div>
          <label style={S.label}>Formato</label>
          {[["Liga", "🏆"], ["Eliminatoria", "⚔"], ["Grupos + Eliminatoria", "🎯"]].map(([f, icon]) => (
            <button key={f} onClick={() => onChange("format", f)} style={{ width: "100%", padding: "14px 16px", borderRadius: 10, border: `1px solid ${values.format === f ? C.blue : "rgba(255,255,255,0.09)"}`, background: values.format === f ? "rgba(79,142,247,0.1)" : "rgba(255,255,255,0.02)", color: values.format === f ? C.blue : C.muted, cursor: "pointer", fontSize: 14, fontFamily: "'Georgia',serif", textAlign: "left", display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{icon}</span> {f}
            </button>
          ))}
        </div>

        {(values.format === "Liga" || values.format === "Grupos + Eliminatoria") && (
          <div>
            <label style={S.label}>Vueltas</label>
            <div style={{ display: "flex", gap: 10 }}>
              {[[1, "⭕ Una vuelta"], [2, "🔄 Doble vuelta"]].map(([l, label]) => (
                <button key={l} onClick={() => onChange("legs", l)} style={{ flex: 1, padding: "13px 8px", borderRadius: 10, border: `1px solid ${values.legs === l ? C.gold : "rgba(255,255,255,0.09)"}`, background: values.legs === l ? "rgba(232,184,75,0.1)" : "rgba(255,255,255,0.02)", color: values.legs === l ? C.gold : C.muted, cursor: "pointer", fontSize: 13, fontFamily: "'Georgia',serif" }}>{label}</button>
              ))}
            </div>
          </div>
        )}

        {values.format === "Grupos + Eliminatoria" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={S.label}>Nº grupos</label><input style={S.input} type="number" min={2} max={8} value={values.groupCount} onChange={e => onChange("groupCount", +e.target.value)} /></div>
            <div><label style={S.label}>Clasificados/grupo</label><input style={S.input} type="number" min={1} max={4} value={values.qualify} onChange={e => onChange("qualify", +e.target.value)} /></div>
          </div>
        )}

        <div>
          <label style={S.label}>Duración</label>
          <div style={{ display: "flex", gap: 10 }}>
            {[[false, "📅 Un solo día"], [true, "🗓 Varias fechas"]].map(([val, label]) => (
              <button key={String(val)} onClick={() => onChange("multiDate", val)} style={{ flex: 1, padding: "13px 8px", borderRadius: 10, border: `1px solid ${values.multiDate === val ? C.purple : "rgba(255,255,255,0.09)"}`, background: values.multiDate === val ? "rgba(167,139,250,0.1)" : "rgba(255,255,255,0.02)", color: values.multiDate === val ? C.purple : C.muted, cursor: "pointer", fontSize: 13, fontFamily: "'Georgia',serif" }}>{label}</button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      {notif && <div style={{ position: "fixed", top: 16, left: 16, right: 16, background: C.blue, color: "#fff", padding: "13px 16px", zIndex: 1000, fontSize: 13, fontFamily: "'Georgia',serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", borderRadius: 10, textAlign: "center", fontWeight: 600 }}>{notif}</div>}

      {showInscModal && inscTarget && (
        <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: 300, overflowY: "auto" }}>
          <div style={{ ...S.topBar, position: "relative" }}>
            <button onClick={() => setShowInscModal(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: "'Georgia',serif", fontSize: 13, padding: 0 }}>← Cancelar</button>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Añadir equipo</span>
            <div style={{ width: 80 }} />
          </div>
          <div style={{ padding: "24px 16px 40px" }}>
            <p style={{ margin: "0 0 22px", color: C.muted }}>{inscTarget.name}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div><label style={S.label}>Nombre del equipo *</label><input style={S.input} value={adminInscForm.teamName} onChange={e => setAdminInscForm(p => ({ ...p, teamName: e.target.value }))} /></div>
              <div><label style={S.label}>ID Manager</label><input style={S.input} value={adminInscForm.managerId} onChange={e => setAdminInscForm(p => ({ ...p, managerId: e.target.value }))} /></div>
              <div><label style={S.label}>Teléfono</label><input style={S.input} value={adminInscForm.phone} onChange={e => setAdminInscForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <div><label style={S.label}>X / Twitter</label><input style={S.input} value={adminInscForm.twitter} onChange={e => setAdminInscForm(p => ({ ...p, twitter: e.target.value }))} /></div>
              <button style={S.btn()} onClick={submitAdminInsc}>Añadir equipo →</button>
            </div>
          </div>
        </div>
      )}

      <style>{`*{box-sizing:border-box;}input:focus,select:focus,textarea:focus{outline:none;border-color:#4f8ef7!important;}input[type="date"],input[type="datetime-local"]{color-scheme:dark;}input::placeholder,textarea::placeholder{color:rgba(200,212,228,0.18)!important;}table{border-collapse:collapse;width:100%;}body{overscroll-behavior-y:contain;}`}</style>

      <header style={S.topBar}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {view !== "list" && tab === "torneos" && <button onClick={handleBack} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: "'Georgia',serif", fontSize: 16, padding: "0 8px 0 0" }}>←</button>}
          <div style={{ width: 28, height: 28, background: "linear-gradient(135deg,#4f8ef7,#2a6fd4)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>⚔</div>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.blue }}>Admin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.muted, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.name || user?.email}</span>
          <button style={S.btnSm} onClick={onLogout}>Salir</button>
        </div>
      </header>

      <main style={S.main}>

        {tab === "torneos" && (
          <>
            {view === "list" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <p style={S.pageTitle}>Torneos</p>
                  <button style={{ ...S.btnInline(), flexShrink: 0 }} onClick={() => setView("new")}>+ Nuevo</button>
                </div>
                <div style={{ display: "flex", gap: 0, marginBottom: 16, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
                  {[["activos", `Activos (${activeTournaments.length})`], ["historial", "Historial"]].map(([id, label]) => (
                    <button key={id} onClick={() => setTourneySubTab(id)} style={{ flex: 1, padding: "11px 8px", background: tourneySubTab === id ? "rgba(79,142,247,0.1)" : "transparent", border: "none", borderRight: id === "activos" ? "1px solid rgba(255,255,255,0.08)" : "none", color: tourneySubTab === id ? C.blue : C.muted, cursor: "pointer", fontSize: 12, fontWeight: tourneySubTab === id ? 700 : 400, fontFamily: "'Georgia',serif" }}>{label}</button>
                  ))}
                </div>
                {tourneySubTab === "activos" && (
                  activeTournaments.length === 0
                    ? <div style={{ ...S.card, textAlign: "center", padding: 48, color: C.faint }}><div style={{ fontSize: 36, marginBottom: 12 }}>🎮</div>No hay torneos activos.</div>
                    : activeTournaments.map(t => <TournamentCard key={t.id} t={t} />)
                )}
                {tourneySubTab === "historial" && (
                  <div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
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
                      : filteredHistory.map(t => <TournamentCard key={t.id} t={t} />)}
                  </div>
                )}
              </>
            )}

            {view === "new" && (
              <>
                <p style={S.pageTitle}>Nuevo torneo</p>
                <p style={S.pageSubtitle}>Los equipos se añaden mediante inscripciones</p>
                <ConfigForm values={form} onChange={F} showNameDesc={true} />
                <div style={{ marginTop: 18 }}>
                  <button style={S.btn()} onClick={createTournament}>Crear torneo →</button>
                </div>
              </>
            )}

            {view === "editconfig" && activeTournament && (
              <>
                <p style={S.pageTitle}>Editar configuración</p>
                <p style={S.pageSubtitle}>{activeTournament.name}</p>
                <div style={{ ...S.card, background: "rgba(232,184,75,0.06)", border: "1px solid rgba(232,184,75,0.2)", marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 12, color: C.gold }}>
                    ⚠️ Solo disponible mientras el torneo está <strong>Abierto</strong> y sin grupos generados.
                  </p>
                </div>
                <ConfigForm values={editForm} onChange={EF} showNameDesc={false} />
                <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
                  <button style={{ ...S.btn(), flex: 1 }} onClick={saveEditConfig}>Guardar cambios →</button>
                  <button style={S.btnSm} onClick={() => setView("detail")}>Cancelar</button>
                </div>
              </>
            )}

            {view === "schedule" && activeTournament && (
              <>
                <p style={S.pageTitle}>Horario de jornadas</p>
                <p style={S.pageSubtitle}>{activeTournament.name}</p>
                {scheduleMatchdays.length === 0
                  ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: C.faint }}>Inicia el torneo primero.</div>
                  : <>
                    {scheduleMatchdays.map(day => (
                      <div key={day.key} style={{ ...S.card, marginBottom: 8 }}>
                        <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 14 }}>{day.type === "group" ? `Jornada ${day.matchdayNum} · Grupo ${day.groupName}` : day.phase}</p>
                        <p style={{ margin: "0 0 10px", color: C.muted, fontSize: 12 }}>{day.matches.length} partido{day.matches.length !== 1 ? "s" : ""}</p>
                        <input type="datetime-local" value={scheduleEdits[day.schedKey] ? scheduleEdits[day.schedKey].slice(0, 16) : ""} onChange={e => setScheduleEdits(p => ({ ...p, [day.schedKey]: e.target.value ? new Date(e.target.value).toISOString() : null }))} style={{ ...S.input, fontSize: 15, padding: "11px 12px" }} />
                        {scheduleEdits[day.schedKey] && <p style={{ margin: "6px 0 0", fontSize: 12, color: C.gold }}>🕐 {formatDatetime(scheduleEdits[day.schedKey])}</p>}
                      </div>
                    ))}
                    <button style={{ ...S.btn(), opacity: savingSchedule ? 0.6 : 1, marginTop: 8 }} onClick={saveSchedule} disabled={savingSchedule}>{savingSchedule ? "Guardando..." : "Guardar horarios →"}</button>
                  </>
                }
              </>
            )}

            {view === "detail" && activeTournament && (() => {
              const t = activeTournament;
              const ttype = TOURNAMENT_TYPES[t.tournamentType] || TOURNAMENT_TYPES.rapido;
              const hasGroups  = t.groups?.length > 0;
              const hasElim    = t.eliminationRounds?.length > 0;
              const approvedInsc = inscriptions.filter(i => i.tournamentId === t.id && i.status === "aprobada");
              const pendingInsc  = inscriptions.filter(i => i.tournamentId === t.id && i.status === "pendiente");
              const canStart = t.status === "Abierto" && approvedInsc.length >= 2 && !hasGroups && !hasElim;
              const canEdit  = t.status === "Abierto" && !hasGroups && !hasElim;
              const canReset = hasGroups || hasElim || t.status !== "Abierto";
              return (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontSize: 20 }}>{ttype.icon}</span>
                      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t.name}</h1>
                      <span style={S.tag(statusColor[t.status] || "#6b7a90")}>{t.status}</span>
                    </div>
                    {t.startDate && <p style={{ margin: "0 0 4px", fontSize: 13, color: C.blue }}>📅 {formatDate(t.startDate)}</p>}
                    <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>
                      {t.format} · {t.legs > 1 ? "2 vueltas" : "1 vuelta"} · {approvedInsc.length} equipos ·{" "}
                      <span style={{ color: ttype.color }}>{ttype.label} (K={ttype.kBase})</span>
                    </p>
                    {t.winner && <p style={{ margin: "4px 0", color: C.gold }}>🏆 {t.winner}</p>}
                  </div>

                  <div style={{ ...S.card, marginBottom: 12 }}>
                    <p style={{ ...S.label, marginBottom: 8 }}>Grupo de WhatsApp</p>
                    {t.whatsappLink && <a href={t.whatsappLink} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.2)", borderRadius: 8, textDecoration: "none", color: C.text, marginBottom: 8 }}><span style={{ fontSize: 20 }}>💬</span><span style={{ fontSize: 12, color: "#25d366", fontWeight: 600 }}>Unirse</span><span style={{ marginLeft: "auto", color: C.faint }}>→</span></a>}
                    <input style={{ ...S.input, fontSize: 14 }} placeholder="https://chat.whatsapp.com/..." defaultValue={t.whatsappLink || ""} onBlur={async e => { if (e.target.value !== (t.whatsappLink || "")) { await updateDoc(doc(db, "tournaments", t.id), { whatsappLink: e.target.value.trim() }); showNotif("Enlace actualizado ✓"); } }} />
                  </div>

                  <div style={{ overflowX: "auto", marginBottom: 14 }}>
                    <div style={{ display: "flex", gap: 8, width: "max-content" }}>
                      {["Abierto", "En curso", "Finalizado", "Cerrado"].map(s => <button key={s} style={{ ...S.btnSm, borderColor: t.status === s ? statusColor[s] : undefined, color: t.status === s ? statusColor[s] : undefined }} onClick={() => updateDoc(doc(db, "tournaments", t.id), { status: s, ...(s === "Finalizado" ? { finishedAt: new Date().toISOString() } : {}) })}>{s}</button>)}
                      <button style={{ ...S.btnSm, borderColor: "rgba(79,142,247,0.4)", color: C.blue }} onClick={() => { setInscTarget(t); setShowInscModal(true); }}>+ Equipo</button>
                      {canEdit && <button style={{ ...S.btnSm, borderColor: "rgba(167,139,250,0.4)", color: C.purple }} onClick={() => setView("editconfig")}>✏ Configuración</button>}
                      {(hasGroups || hasElim) && <button style={{ ...S.btnSm, borderColor: "rgba(232,184,75,0.4)", color: C.gold }} onClick={() => setView("schedule")}>🕐 Horarios</button>}
                      {canReset && <button style={{ ...S.btnSm, borderColor: "rgba(167,139,250,0.4)", color: C.purple, opacity: resetting ? 0.6 : 1 }} onClick={() => resetTournament(t)} disabled={resetting}>🔄 Reiniciar</button>}
                      <button style={S.btnDanger} onClick={async () => { if (!window.confirm("¿Eliminar torneo?")) return; await deleteDoc(doc(db, "tournaments", t.id)); setView("list"); }}>Eliminar</button>
                    </div>
                  </div>

                  {canStart && <div style={{ background: "rgba(82,214,138,0.08)", border: "1px solid rgba(82,214,138,0.25)", borderRadius: 10, padding: 16, marginBottom: 14 }}><p style={{ margin: "0 0 10px", color: C.green, fontSize: 13 }}>✓ {approvedInsc.length} equipos listos · K efectiva ≈ {Math.round(ttype.kBase * Math.sqrt(approvedInsc.length / 8))}</p><button style={{ ...S.btn(C.green), color: "#07090f" }} onClick={() => startTournament(t)}>▶ Iniciar torneo</button></div>}

                  {pendingInsc.length > 0 && (
                    <div style={{ ...S.card, marginBottom: 14 }}>
                      <p style={{ ...S.label, marginBottom: 12 }}>Pendientes ({pendingInsc.length})</p>
                      {pendingInsc.map(i => (
                        <div key={i.id} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                            <TeamLogo name={i.teamName} logoUrl={i.logoUrl} size={40} />
                            <div><p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 14 }}>{i.teamName}</p><p style={{ margin: "0 0 1px", color: C.muted, fontSize: 12 }}>{i.userName}</p><p style={{ margin: 0, color: C.faint, fontSize: 11 }}>📞 {i.phone || "—"} · ID: {i.managerId || "—"}</p></div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button style={{ ...S.btnSm, flex: 1, borderColor: "rgba(82,214,138,0.4)", color: C.green }} onClick={() => handleInscription(i.id, "aprobada")}>Aprobar</button>
                            <button style={{ ...S.btnDanger, flex: 1 }} onClick={() => handleInscription(i.id, "rechazada")}>Rechazar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {approvedInsc.length > 0 && !hasGroups && !hasElim && (
                    <div style={{ ...S.card, marginBottom: 14 }}>
                      <p style={{ ...S.label, marginBottom: 10 }}>Equipos aprobados ({approvedInsc.length})</p>
                      {approvedInsc.map(i => <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}><TeamLogo name={i.teamName} logoUrl={i.logoUrl} size={32} /><div><p style={{ margin: "0 0 1px", fontWeight: 600, fontSize: 13 }}>{i.teamName}</p><p style={{ margin: 0, color: C.faint, fontSize: 11 }}>{i.userName}</p></div></div>)}
                    </div>
                  )}

                  {hasGroups && (
                    <div style={{ marginBottom: 16 }}>
                      <p style={S.sectionTitle}>Clasificación</p>
                      {t.groups.map((g, gi) => (
                        <div key={gi} style={{ ...S.card, marginBottom: 10 }}>
                          <p style={{ ...S.label, color: C.gold, marginBottom: 10 }}>Grupo {g.name}</p>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ minWidth: 260 }}>
                              <thead><tr>{["#", "Equipo", "PJ", "PTS", "GF", "GC", "DG"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                              <tbody>{g.standings.map((s, si) => <tr key={s.name} style={{ background: si < (t.qualify || 2) && t.format === "Grupos + Eliminatoria" ? "rgba(79,142,247,0.06)" : "transparent" }}><td style={{ ...S.td, color: C.faint }}>{si + 1}</td><td style={S.td}><TRow name={s.name} size={18} /></td><td style={{ ...S.td, textAlign: "center" }}>{s.pj}</td><td style={{ ...S.td, fontWeight: 700, textAlign: "center" }}>{s.pts}</td><td style={{ ...S.td, textAlign: "center" }}>{s.gf}</td><td style={{ ...S.td, textAlign: "center" }}>{s.gc}</td><td style={{ ...S.td, color: s.gd >= 0 ? C.green : C.red, textAlign: "center" }}>{s.gd > 0 ? "+" : ""}{s.gd}</td></tr>)}</tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                      {t.format === "Grupos + Eliminatoria" && t.groups.every(g => g.matches.every(m => m.matchStatus === "validado")) && !hasElim && (
                        <button style={S.btn(C.gold)} onClick={async () => { const matches = buildSeededElimination(t.groups, t.qualify || 2); if (!matches.length) return showNotif("No hay suficientes clasificados"); await updateDoc(doc(db, "tournaments", t.id), { eliminationRounds: [{ round: 1, matches }] }); showNotif("Fase eliminatoria generada ✓"); }}>Generar fase eliminatoria →</button>
                      )}
                    </div>
                  )}

                  {hasElim && (
                    <div style={{ marginBottom: 16 }}>
                      <p style={S.sectionTitle}>Cuadro eliminatorio</p>
                      {t.eliminationRounds.map((round, ri) => (
                        <div key={ri} style={{ marginBottom: 10 }}>
                          <p style={{ ...S.label, color: C.gold, marginBottom: 6 }}>{getRoundName(t.eliminationRounds.length, ri)}</p>
                          {round.matches.map((m, mi) => <div key={mi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, marginBottom: 5 }}><div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}><TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={20} /><span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span></div><div style={{ minWidth: 54, textAlign: "center" }}>{m.matchStatus === "validado" ? <span style={{ fontWeight: 700, color: C.gold, fontSize: 14 }}>{m.scoreA}–{m.scoreB}</span> : <span style={{ ...S.tag(m.matchStatus === "conflicto" ? C.red : m.matchStatus === "parcial" ? C.orange : C.muted), fontSize: 8 }}>{m.matchStatus || "pdte"}</span>}</div><div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", minWidth: 0 }}><span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span><TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={20} /></div></div>)}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ padding: "12px 14px", background: "rgba(79,142,247,0.06)", borderRadius: 10, border: "1px solid rgba(79,142,247,0.15)" }}>
                    <p style={{ margin: "0 0 8px", fontSize: 12, color: C.blue }}>Los resultados se gestionan en <strong>Partidos</strong></p>
                    <button style={{ ...S.btnInline(C.blue) }} onClick={() => { setTab("partidos"); setView("list"); }}>Ir a Partidos →</button>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {tab === "partidos" && (<><p style={S.pageTitle}>Partidos</p><p style={S.pageSubtitle}>Gestiona y valida resultados</p><MatchesPanel tournaments={tournaments} inscriptions={inscriptions} currentUser={user} isAdmin={true} logoMap={logoMap} myTeamNames={new Set()} /></>)}
        {tab === "ranking" && (<><p style={S.pageTitle}>Ranking ELO</p><p style={S.pageSubtitle}>Clasificación histórica de equipos</p><RankingPanel myTeamId={null} /></>)}

        {tab === "inscripciones" && (
          <>
            <p style={S.pageTitle}>Inscripciones</p>
            <p style={S.pageSubtitle}>{activeInscriptions.length} en torneos activos · {pendingCount} pendientes</p>
            {activeInscriptions.length === 0
              ? <div style={{ ...S.card, textAlign: "center", padding: 40, color: C.faint }}>No hay inscripciones en torneos activos.</div>
              : activeInscriptions.map(i => {
                const tournament = tournaments.find(t => t.id === i.tournamentId);
                return (
                  <div key={i.id} style={S.card}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: i.status === "pendiente" ? 10 : 0 }}>
                      <TeamLogo name={i.teamName} logoUrl={i.logoUrl} size={44} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 15 }}>{i.teamName}</p>
                        <p style={{ margin: "0 0 2px", color: C.muted, fontSize: 12 }}>{i.userName} · {tournament?.name || "—"}</p>
                        <p style={{ margin: "0 0 2px", color: C.faint, fontSize: 11 }}>ID: {i.managerId || "—"} · 📞 {i.phone || "—"}</p>
                      </div>
                      <span style={S.tag(i.status === "aprobada" ? C.green : i.status === "rechazada" ? C.red : C.gold)}>{i.status}</span>
                    </div>
                    {i.status === "pendiente" && <div style={{ display: "flex", gap: 8 }}><button style={{ ...S.btnSm, flex: 1, borderColor: "rgba(82,214,138,0.4)", color: C.green }} onClick={() => handleInscription(i.id, "aprobada")}>Aprobar</button><button style={{ ...S.btnDanger, flex: 1 }} onClick={() => handleInscription(i.id, "rechazada")}>Rechazar</button></div>}
                  </div>
                );
              })
            }
          </>
        )}

        {tab === "noticias" && (
          <>
            <p style={S.pageTitle}>Noticias</p>
            <div style={S.card}>
              <p style={{ ...S.label, color: C.gold, marginBottom: 14 }}>{editingNewsId ? "✏ Editando" : "+ Nueva"}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div><label style={S.label}>Título</label><input style={S.input} value={newsForm.title} onChange={e => setNewsForm(p => ({ ...p, title: e.target.value }))} /></div>
                <div><label style={S.label}>Categoría</label><select style={S.select} value={newsForm.category} onChange={e => setNewsForm(p => ({ ...p, category: e.target.value }))}><option>Noticia</option><option>Resultado</option><option>Convocatoria</option><option>Aviso</option></select></div>
                <div><label style={S.label}>Contenido</label><textarea style={S.textarea} value={newsForm.body} onChange={e => setNewsForm(p => ({ ...p, body: e.target.value }))} /></div>
                <button style={S.btn()} onClick={saveNews}>{editingNewsId ? "Actualizar" : "Publicar"} →</button>
                {editingNewsId && <button style={S.btnSm} onClick={() => { setEditingNewsId(null); setNewsForm({ title: "", body: "", category: "Noticia" }); }}>Cancelar</button>}
              </div>
            </div>
            {news.map(n => (
              <div key={n.id} style={{ ...S.card, marginTop: 10 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 5 }}><span style={S.tag(catColor[n.category] || C.blue)}>{n.category}</span><span style={{ fontSize: 10, color: C.faint }}>{new Date(n.createdAt).toLocaleDateString("es-ES")}</span></div>
                <h3 style={{ margin: "0 0 5px", fontSize: 14, fontWeight: 700 }}>{n.title}</h3>
                <p style={{ margin: "0 0 12px", fontSize: 12, color: "#7a8aa4" }}>{n.body.substring(0, 100)}{n.body.length > 100 ? "..." : ""}</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...S.btnSm, flex: 1 }} onClick={() => { setNewsForm({ title: n.title, body: n.body, category: n.category || "Noticia" }); setEditingNewsId(n.id); window.scrollTo(0, 0); }}>Editar</button>
                  <button style={{ ...S.btnDanger, flex: 1 }} onClick={async () => { if (!window.confirm("¿Eliminar?")) return; await deleteDoc(doc(db, "news", n.id)); showNotif("Eliminada"); }}>Eliminar</button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "normativa" && (
          <>
            <p style={S.pageTitle}>Normativa</p>
            <p style={S.pageSubtitle}>Gestiona las normas del torneo</p>
            <NormativaEditor />
          </>
        )}

      </main>

      <BottomNav tabs={navTabs} active={tab} onChange={(t) => { setTab(t); if (t !== "torneos") setView("list"); }} color={C.blue} />
    </div>
  );
}
