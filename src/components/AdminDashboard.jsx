import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from "firebase/firestore";
import { useAuth } from "../AuthContext";
import { C, S, statusColor, getRoundName, buildGroups, applyGroupResult, buildSeededElimination, buildEliminationRound, TeamLogo } from "../shared";

export default function AdminDashboard({ onLogout }) {
  const { user, profile } = useAuth();
  const [mainTab, setMainTab] = useState("torneos");
  const [tournaments, setTournaments] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [news, setNews] = useState([]);
  const [view, setView] = useState("list");
  const [activeTId, setActiveTId] = useState(null);
  const [notif, setNotif] = useState(null);
  const [form, setForm] = useState({ name: "", format: "Liga", groupCount: 2, qualify: 2, description: "" });
  const [teamInput, setTeamInput] = useState("");
  const [teams, setTeams] = useState([]);
  const [scoreEdit, setScoreEdit] = useState({});
  const [newsForm, setNewsForm] = useState({ title: "", body: "", category: "Noticia" });
  const [editingNewsId, setEditingNewsId] = useState(null);

  function showNotif(msg) { setNotif(msg); setTimeout(() => setNotif(null), 2800); }

  useEffect(() => {
    const u1 = onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")), snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u2 = onSnapshot(query(collection(db, "inscriptions"), orderBy("createdAt", "desc")), snap => setInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const u3 = onSnapshot(query(collection(db, "news"), orderBy("createdAt", "desc")), snap => setNews(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); u3(); };
  }, []);

  // logo map from inscriptions
  const logoMap = {};
  inscriptions.forEach(i => { if (i.teamName && i.logoUrl) logoMap[i.teamName] = i.logoUrl; });

  function TRow({ name, size = 22 }) {
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><TeamLogo name={name} logoUrl={logoMap[name]} size={size} /><span>{name}</span></span>;
  }

  async function createTournament() {
    if (!form.name.trim() || teams.length < 2) return showNotif("Añade nombre y al menos 2 equipos");
    let groups = null, eliminationRounds = [];
    if (form.format === "Eliminatoria") eliminationRounds = [{ round: 1, matches: buildEliminationRound(teams) }];
    else if (form.format === "Liga") groups = buildGroups(teams, 1);
    else groups = buildGroups(teams, parseInt(form.groupCount));
    await addDoc(collection(db, "tournaments"), {
      name: form.name.trim(), description: form.description.trim(),
      sport: "FIFA Clubes Pro", format: form.format,
      groupCount: parseInt(form.groupCount), qualify: parseInt(form.qualify),
      teams, groups, eliminationRounds, status: "Abierto", winner: null,
      createdAt: new Date().toISOString(), createdBy: user.uid,
    });
    setForm({ name: "", format: "Liga", groupCount: 2, qualify: 2, description: "" });
    setTeams([]); setView("list");
    showNotif("Torneo creado ✓");
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
    showNotif("Resultado guardado ✓");
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
      else { finalRounds = [...newRounds, { round: newRounds.length + 1, matches: buildEliminationRound(winners) }]; showNotif("¡Nueva ronda generada!"); }
    }
    await updateDoc(doc(db, "tournaments", t.id), { eliminationRounds: finalRounds, ...(winner ? { winner, status: "Finalizado" } : {}) });
    setScoreEdit(p => { const n = { ...p }; delete n[key]; return n; });
    if (winner) showNotif(`🏆 ¡${winner} campeón!`);
    else if (!allDone) showNotif("Resultado guardado ✓");
  }

  async function generateElimFromGroups(t) {
    const qualify = t.qualify || 2;
    const matches = buildSeededElimination(t.groups, qualify);
    if (matches.length < 1) return showNotif("No hay suficientes clasificados");
    await updateDoc(doc(db, "tournaments", t.id), { eliminationRounds: [{ round: 1, matches }], status: "En curso" });
    showNotif(`Fase eliminatoria generada ✓`);
  }

  async function deleteTournament(id) {
    if (!window.confirm("¿Eliminar este torneo?")) return;
    await deleteDoc(doc(db, "tournaments", id));
    if (activeTId === id) { setActiveTId(null); setView("list"); }
    showNotif("Torneo eliminado");
  }

  async function handleInscription(id, status) {
    await updateDoc(doc(db, "inscriptions", id), { status });
    showNotif(status === "aprobada" ? "Aprobada ✓" : "Rechazada");
  }

  async function saveNews() {
    if (!newsForm.title.trim() || !newsForm.body.trim()) return showNotif("Rellena título y contenido");
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

  async function deleteNews(id) {
    if (!window.confirm("¿Eliminar esta noticia?")) return;
    await deleteDoc(doc(db, "news", id));
    showNotif("Noticia eliminada");
  }

  const activeTournament = tournaments.find(t => t.id === activeTId);
  const pendingCount = inscriptions.filter(i => i.status === "pendiente").length;
  const catColor = { Noticia: C.blue, Resultado: C.green, Convocatoria: C.gold, Aviso: C.red };

  return (
    <div style={S.wrap}>
      {notif && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: C.blue, color: "#fff", padding: "10px 28px", zIndex: 1000, letterSpacing: 1, fontSize: 12, fontFamily: "'Georgia',serif", boxShadow: "0 4px 24px rgba(0,0,0,0.5)", maxWidth: "90vw", textAlign: "center" }}>{notif}</div>}
      <style>{`input:focus,select:focus,textarea:focus{outline:none;border-color:#388bff!important;}input::placeholder,textarea::placeholder{color:rgba(200,212,228,0.2)!important;}table{border-collapse:collapse;width:100%;}*{box-sizing:border-box;}`}</style>

      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", flexShrink: 0 }}>⚔</div>
          <span style={{ fontSize: "clamp(12px,3vw,16px)", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.blue }}>TournamentOS</span>
          <span style={{ ...S.tag(C.blue), display: "none" }} className="show-desktop">Admin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.muted, maxWidth: "25vw", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.name || user?.email}</span>
          <button style={S.btnSm} onClick={onLogout}>Salir</button>
        </div>
      </header>

      <main style={S.main}>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 24, overflowX: "auto" }}>
          {["torneos", "inscripciones", "noticias"].map(t => (
            <button key={t} style={S.tab(mainTab === t)} onClick={() => { setMainTab(t); setView("list"); }}>
              {t === "torneos" ? "Torneos" : t === "inscripciones" ? `Inscripciones${pendingCount > 0 ? ` (${pendingCount})` : ""}` : "Noticias"}
            </button>
          ))}
        </div>

        {/* ── TORNEOS ── */}
        {mainTab === "torneos" && (
          <>
            {view === "list" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                  <h1 style={{ fontSize: "clamp(16px,4vw,24px)", fontWeight: 700, margin: 0 }}>Torneos · FIFA Clubes Pro</h1>
                  <button style={S.btn()} onClick={() => setView("new")}>+ Nuevo</button>
                </div>
                {tournaments.length === 0 ? (
                  <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: C.faint }}>No hay torneos.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,240px),1fr))", gap: 14 }}>
                    {tournaments.map(t => (
                      <div key={t.id} style={{ ...S.card, cursor: "pointer" }} onClick={() => { setActiveTId(t.id); setView("detail"); }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                          <span style={{ fontSize: 20 }}>🎮</span>
                          <span style={S.tag(statusColor[t.status] || "#94a3b8")}>{t.status}</span>
                        </div>
                        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{t.name}</h3>
                        <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>{t.format} · {t.teams?.length || 0} equipos</p>
                        {t.winner && (
                          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 7, color: C.gold, fontSize: 12 }}>
                            🏆 <TeamLogo name={t.winner} logoUrl={logoMap[t.winner]} size={20} /> {t.winner}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {view === "new" && (
              <div style={{ maxWidth: 560 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
                  <button style={S.btnSm} onClick={() => setView("list")}>← Volver</button>
                  <h1 style={{ fontSize: "clamp(16px,4vw,22px)", fontWeight: 700, margin: 0 }}>Nuevo Torneo</h1>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div><label style={S.label}>Nombre</label><input style={S.input} placeholder="Copa de Campeones 2026" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                  <div><label style={S.label}>Descripción</label><input style={S.input} placeholder="Breve descripción..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
                  <div>
                    <label style={S.label}>Formato</label>
                    <select style={S.select} value={form.format} onChange={e => setForm(p => ({ ...p, format: e.target.value }))}>
                      <option>Liga</option><option>Eliminatoria</option><option>Grupos + Eliminatoria</option>
                    </select>
                  </div>
                  {form.format === "Grupos + Eliminatoria" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div><label style={S.label}>Nº de grupos</label><input style={S.input} type="number" min={2} max={8} value={form.groupCount} onChange={e => setForm(p => ({ ...p, groupCount: e.target.value }))} /></div>
                      <div><label style={S.label}>Pasan por grupo</label><input style={S.input} type="number" min={1} max={4} value={form.qualify} onChange={e => setForm(p => ({ ...p, qualify: e.target.value }))} /></div>
                    </div>
                  )}
                  <div>
                    <label style={S.label}>Equipos ({teams.length})</label>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <input style={{ ...S.input, flex: 1 }} placeholder="Nombre del equipo..." value={teamInput} onChange={e => setTeamInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && teamInput.trim()) { setTeams(p => [...p, teamInput.trim()]); setTeamInput(""); } }} />
                      <button style={{ ...S.btn(), padding: "10px 16px" }} onClick={() => { if (teamInput.trim()) { setTeams(p => [...p, teamInput.trim()]); setTeamInput(""); } }}>+</button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {teams.map(t => (
                        <span key={t} style={{ padding: "4px 10px", background: "rgba(56,139,255,0.1)", border: "1px solid rgba(56,139,255,0.3)", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                          {t} <span onClick={() => setTeams(p => p.filter(x => x !== t))} style={{ cursor: "pointer", color: C.red, fontSize: 10 }}>✕</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <button style={{ ...S.btn(), padding: 14 }} onClick={createTournament}>Crear Torneo →</button>
                </div>
              </div>
            )}

            {view === "detail" && activeTournament && (() => {
              const t = activeTournament;
              const hasGroups = t.groups?.length > 0;
              const hasElim = t.eliminationRounds?.length > 0;
              const groupsDone = hasGroups && t.groups.every(g => g.matches.every(m => m.played));
              const tInscriptions = inscriptions.filter(i => i.tournamentId === t.id && i.status === "pendiente");

              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                    <button style={S.btnSm} onClick={() => setView("list")}>← Volver</button>
                    <h1 style={{ fontSize: "clamp(15px,4vw,22px)", fontWeight: 700, margin: 0 }}>{t.name}</h1>
                    <span style={S.tag(statusColor[t.status] || "#94a3b8")}>{t.status}</span>
                    {t.winner && <span style={{ color: C.gold, display: "flex", alignItems: "center", gap: 7 }}>🏆 <TRow name={t.winner} size={22} /></span>}
                  </div>
                  <p style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>FIFA Clubes Pro · {t.format} · {t.teams?.length} equipos</p>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                    {["Abierto", "En curso", "Finalizado", "Cerrado"].map(s => (
                      <button key={s} style={{ ...S.btnSm, borderColor: t.status === s ? (statusColor[s] || "#fff") : undefined, color: t.status === s ? (statusColor[s] || "#fff") : undefined }}
                        onClick={() => updateDoc(doc(db, "tournaments", t.id), { status: s })}>{s}</button>
                    ))}
                    <button style={S.btnDanger} onClick={() => deleteTournament(t.id)}>Eliminar</button>
                  </div>

                  {tInscriptions.length > 0 && (
                    <div style={{ ...S.card, marginBottom: 20 }}>
                      <p style={S.label}>Solicitudes pendientes ({tInscriptions.length})</p>
                      {tInscriptions.map(i => (
                        <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap", gap: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <TeamLogo name={i.teamName} logoUrl={i.logoUrl} size={36} />
                            <div>
                              <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: 13 }}>{i.teamName}</p>
                              <p style={{ margin: "0 0 1px", color: C.muted, fontSize: 11 }}>{i.userName} · ID: {i.managerId}</p>
                              <p style={{ margin: 0, color: C.faint, fontSize: 11 }}>📞 {i.phone}{i.twitter ? ` · ${i.twitter}` : ""}</p>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button style={{ ...S.btnSm, borderColor: "rgba(74,222,128,0.4)", color: C.green }} onClick={() => handleInscription(i.id, "aprobada")}>Aprobar</button>
                            <button style={S.btnDanger} onClick={() => handleInscription(i.id, "rechazada")}>Rechazar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* GROUPS */}
                  {hasGroups && (
                    <div style={{ marginBottom: 28 }}>
                      <p style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.blue, marginBottom: 14 }}>
                        Fase de grupos {t.format === "Grupos + Eliminatoria" && `· ${t.qualify} clasificados/grupo`}
                      </p>
                      {t.groups.map((g, gi) => (
                        <div key={gi} style={{ ...S.card, marginBottom: 16 }}>
                          <p style={{ ...S.label, color: C.gold, marginBottom: 12 }}>Grupo {g.name}</p>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ marginBottom: 16, minWidth: 300 }}>
                              <thead><tr>{["#", "Equipo", "PJ", "PTS", "GF", "GC", "DG"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                              <tbody>
                                {g.standings.map((s, si) => (
                                  <tr key={s.name} style={{ background: si < (t.qualify || 2) && t.format === "Grupos + Eliminatoria" ? "rgba(56,139,255,0.06)" : "transparent" }}>
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
                          <p style={S.label}>Partidos</p>
                          {g.matches.map((m, mi) => {
                            const key = `g${gi}-m${mi}`;
                            return (
                              <div key={mi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap" }}>
                                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, fontWeight: m.played && m.scoreA > m.scoreB ? 700 : 400, fontSize: 13, minWidth: 80, overflow: "hidden" }}>
                                  <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={20} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
                                </div>
                                {m.played ? (
                                  <span style={{ fontWeight: 700, letterSpacing: 3, color: C.gold, fontSize: 14, flexShrink: 0 }}>{m.scoreA}—{m.scoreB}</span>
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.a ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], a: e.target.value } }))} style={S.numInput} />
                                    <span style={{ color: C.faint }}>—</span>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.b ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], b: e.target.value } }))} style={S.numInput} />
                                    <button style={S.btnSm} onClick={() => saveGroupResult(t, gi, mi)}>OK</button>
                                  </div>
                                )}
                                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end", fontWeight: m.played && m.scoreB > m.scoreA ? 700 : 400, fontSize: 13, minWidth: 80, overflow: "hidden" }}>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
                                  <TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={20} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      {t.format === "Grupos + Eliminatoria" && groupsDone && !hasElim && (
                        <button style={{ ...S.btn(C.gold), color: "#0a0a0f" }} onClick={() => generateElimFromGroups(t)}>Generar fase eliminatoria →</button>
                      )}
                    </div>
                  )}

                  {/* ELIMINATION */}
                  {hasElim && (
                    <div>
                      <p style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: C.blue, marginBottom: 14 }}>Fase eliminatoria</p>
                      {t.eliminationRounds.map((round, ri) => (
                        <div key={ri} style={{ marginBottom: 24 }}>
                          <p style={{ ...S.label, color: C.gold, marginBottom: 10 }}>{getRoundName(t.eliminationRounds.length, ri)}</p>
                          {round.matches.map((m, mi) => {
                            const key = `e${ri}-m${mi}`;
                            return (
                              <div key={mi} style={{ ...S.card, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", flexWrap: "wrap", marginBottom: 8 }}>
                                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, fontWeight: m.winner === m.teamA ? 700 : 400, color: m.winner === m.teamA ? C.blue : C.text, minWidth: 80, overflow: "hidden" }}>
                                  <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={24} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>{m.teamA}</span>
                                </div>
                                {m.winner ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                                    <span style={{ fontWeight: 700, letterSpacing: 3, color: C.blue, fontSize: 14 }}>{m.scoreA}—{m.scoreB}</span>
                                    <span style={S.tag(C.green)}>✓</span>
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.a ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], a: e.target.value } }))} style={S.numInput} />
                                    <span style={{ color: C.faint }}>—</span>
                                    <input type="number" min={0} placeholder="0" value={scoreEdit[key]?.b ?? ""} onChange={e => setScoreEdit(p => ({ ...p, [key]: { ...p[key], b: e.target.value } }))} style={S.numInput} />
                                    <button style={S.btnSm} onClick={() => saveElimResult(t, ri, mi)}>OK</button>
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

        {/* ── INSCRIPCIONES ── */}
        {mainTab === "inscripciones" && (
          <>
            <h1 style={{ fontSize: "clamp(16px,4vw,24px)", fontWeight: 700, margin: "0 0 20px" }}>Inscripciones</h1>
            {inscriptions.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: C.faint }}>No hay inscripciones.</div>
            ) : inscriptions.map(i => {
              const tournament = tournaments.find(t => t.id === i.tournamentId);
              return (
                <div key={i.id} style={S.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <TeamLogo name={i.teamName} logoUrl={i.logoUrl} size={40} />
                      <div>
                        <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: 14 }}>{i.teamName}</p>
                        <p style={{ margin: "0 0 1px", color: C.muted, fontSize: 11 }}>{i.userName} · {tournament?.name || "—"}</p>
                        <p style={{ margin: "0 0 1px", color: C.faint, fontSize: 11 }}>ID: {i.managerId} · 📞 {i.phone}</p>
                        {i.twitter && <p style={{ margin: 0, color: C.blue, fontSize: 11 }}>{i.twitter}</p>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={S.tag(i.status === "aprobada" ? C.green : i.status === "rechazada" ? C.red : C.gold)}>{i.status}</span>
                      {i.status === "pendiente" && (
                        <>
                          <button style={{ ...S.btnSm, borderColor: "rgba(74,222,128,0.4)", color: C.green }} onClick={() => handleInscription(i.id, "aprobada")}>Aprobar</button>
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

        {/* ── NOTICIAS ── */}
        {mainTab === "noticias" && (
          <>
            <h1 style={{ fontSize: "clamp(16px,4vw,24px)", fontWeight: 700, margin: "0 0 20px" }}>Gestión de Noticias</h1>
            <div style={{ ...S.card, marginBottom: 24 }}>
              <p style={{ ...S.label, color: C.gold, marginBottom: 14 }}>{editingNewsId ? "Editando noticia" : "Nueva noticia"}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14 }}>
                  <div><label style={S.label}>Título</label><input style={S.input} placeholder="Título..." value={newsForm.title} onChange={e => setNewsForm(p => ({ ...p, title: e.target.value }))} /></div>
                  <div><label style={S.label}>Categoría</label>
                    <select style={{ ...S.select, minWidth: 120 }} value={newsForm.category} onChange={e => setNewsForm(p => ({ ...p, category: e.target.value }))}>
                      <option>Noticia</option><option>Resultado</option><option>Convocatoria</option><option>Aviso</option>
                    </select>
                  </div>
                </div>
                <div><label style={S.label}>Contenido</label><textarea style={S.textarea} placeholder="Contenido..." value={newsForm.body} onChange={e => setNewsForm(p => ({ ...p, body: e.target.value }))} /></div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={S.btn()} onClick={saveNews}>{editingNewsId ? "Actualizar" : "Publicar"} →</button>
                  {editingNewsId && <button style={S.btnSm} onClick={() => { setEditingNewsId(null); setNewsForm({ title: "", body: "", category: "Noticia" }); }}>Cancelar</button>}
                </div>
              </div>
            </div>
            {news.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 32, textAlign: "center", color: C.faint }}>No hay noticias.</div>
            ) : news.map(n => (
              <div key={n.id} style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={S.tag(catColor[n.category] || C.blue)}>{n.category}</span>
                    <h3 style={{ margin: 0, fontSize: 14 }}>{n.title}</h3>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={S.btnSm} onClick={() => { setNewsForm({ title: n.title, body: n.body, category: n.category || "Noticia" }); setEditingNewsId(n.id); }}>Editar</button>
                    <button style={S.btnDanger} onClick={() => deleteNews(n.id)}>Eliminar</button>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: C.faint }}>{new Date(n.createdAt).toLocaleDateString("es-ES")}</p>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#9aa8bc", lineHeight: 1.5 }}>{n.body.substring(0, 180)}{n.body.length > 180 ? "..." : ""}</p>
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
