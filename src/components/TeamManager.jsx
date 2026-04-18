import { useState, useEffect } from "react";
import { db, storage } from "../firebase";
import { collection, doc, addDoc, updateDoc, getDoc, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../AuthContext";
import { C, S, TeamLogo, EloBar, eloLabel, eloTierIcon, ELO_DEFAULT } from "../shared.jsx";

const PLATFORMS = [
  { value: "common-gen5", label: "PS5 / Xbox Series X|S" },
  { value: "common-gen4", label: "PS4 / Xbox One" },
  { value: "pc",          label: "PC (Origin)" },
];

export default function TeamManager() {
  const { user, profile } = useAuth();
  const [myTeam, setMyTeam] = useState(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("equipo");
  const [editing, setEditing] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState(null);
  const [managerEmail, setManagerEmail] = useState("");
  const [addingManager, setAddingManager] = useState(false);
  const [managers, setManagers] = useState([]);
  const [teamPlayers, setTeamPlayers] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);

  // EA linking — manual ID
  const [showEaForm, setShowEaForm] = useState(false);
  const [eaClubId, setEaClubId] = useState("");
  const [eaClubName, setEaClubName] = useState("");
  const [eaPlatform, setEaPlatform] = useState("common-gen5");
  const [savingEa, setSavingEa] = useState(false);

  function showNotif(msg, color = C.green) {
    setNotif({ msg, color });
    setTimeout(() => setNotif(null), 3000);
  }

  useEffect(() => {
    if (!profile?.teamId) { setMyTeam(null); setTeamLoading(false); return; }
    setTeamLoading(true);
    const unsub = onSnapshot(doc(db, "teams", profile.teamId), snap => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setMyTeam(data);
        setTeamName(data.name);
        setLogoPreview(data.logoUrl || null);
        if (data.managers?.length) {
          Promise.all(data.managers.map(uid => getDoc(doc(db, "users", uid))))
            .then(snaps => setManagers(snaps.filter(s => s.exists()).map(s => ({ uid: s.id, ...s.data() }))));
        }
      } else { setMyTeam(null); }
      setTeamLoading(false);
    });
    return unsub;
  }, [profile?.teamId]);

  useEffect(() => {
    if (!myTeam?.id) return;
    const q1 = query(collection(db, "players"), where("teamId", "==", myTeam.id));
    const u1 = onSnapshot(q1, snap => setTeamPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const q2 = query(collection(db, "playerRequests"), where("teamId", "==", myTeam.id), where("status", "==", "pendiente"));
    const u2 = onSnapshot(q2, snap => setPendingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { u1(); u2(); };
  }, [myTeam?.id]);

  async function createTeam() {
    if (!teamName.trim()) return showNotif("Introduce el nombre del equipo", C.red);
    setSaving(true);
    try {
      let logoUrl = null;
      if (logoFile) {
        const storageRef = ref(storage, `escudos/team_${user.uid}_${Date.now()}`);
        await uploadBytes(storageRef, logoFile);
        logoUrl = await getDownloadURL(storageRef);
      }
      const teamDoc = await addDoc(collection(db, "teams"), {
        name: teamName.trim(), nameLower: teamName.trim().toLowerCase(),
        logoUrl, managers: [user.uid], createdBy: user.uid,
        players: [], eaClubId: null, eaPlatform: null, eaClubName: null,
        elo: ELO_DEFAULT, lastEloChange: null,
        stats: { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, gd: 0, titulos: 0 },
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, "users", user.uid), { teamId: teamDoc.id });
      showNotif("Equipo creado ✓");
    } catch (e) { showNotif("Error: " + e.message, C.red); setSaving(false); }
  }

  useEffect(() => { if (myTeam) setSaving(false); }, [myTeam]);

  async function saveTeam() {
    if (!teamName.trim() || !myTeam) return;
    setSaving(true);
    try {
      let logoUrl = myTeam.logoUrl;
      if (logoFile) {
        const storageRef = ref(storage, `escudos/team_${myTeam.id}_${Date.now()}`);
        await uploadBytes(storageRef, logoFile);
        logoUrl = await getDownloadURL(storageRef);
      }
      await updateDoc(doc(db, "teams", myTeam.id), { name: teamName.trim(), nameLower: teamName.trim().toLowerCase(), logoUrl });
      setLogoFile(null); setEditing(false);
      showNotif("Equipo actualizado ✓");
    } catch (e) { showNotif("Error: " + e.message, C.red); }
    setSaving(false);
  }

  async function saveEaLink() {
    if (!eaClubId.trim()) return showNotif("Introduce el Club ID", C.red);
    if (isNaN(parseInt(eaClubId))) return showNotif("El Club ID debe ser un número", C.red);
    setSavingEa(true);
    try {
      await updateDoc(doc(db, "teams", myTeam.id), {
        eaClubId: parseInt(eaClubId),
        eaPlatform: eaPlatform,
        eaClubName: eaClubName.trim() || null,
      });
      setShowEaForm(false);
      setEaClubId(""); setEaClubName(""); setEaPlatform("common-gen5");
      showNotif("Club de EA FC vinculado ✓");
    } catch (e) { showNotif("Error: " + e.message, C.red); }
    setSavingEa(false);
  }

  async function unlinkEa() {
    if (!window.confirm("¿Desvincular el club de EA FC?")) return;
    await updateDoc(doc(db, "teams", myTeam.id), { eaClubId: null, eaPlatform: null, eaClubName: null });
    showNotif("Desvinculado de EA FC");
  }

  async function approvePlayer(request) {
    try {
      await updateDoc(doc(db, "players", request.playerId), { teamId: myTeam.id, teamName: myTeam.name, status: "activo" });
      await updateDoc(doc(db, "teams", myTeam.id), { players: [...(myTeam.players || []), request.playerId] });
      await updateDoc(doc(db, "playerRequests", request.id), { status: "aprobada" });
      showNotif(`${request.userName} aprobado ✓`);
    } catch (e) { showNotif("Error: " + e.message, C.red); }
  }

  async function rejectPlayer(request) {
    await updateDoc(doc(db, "playerRequests", request.id), { status: "rechazada" });
    showNotif("Solicitud rechazada");
  }

  async function removePlayer(player) {
    if (!window.confirm(`¿Eliminar a ${player.userName} del equipo?`)) return;
    await updateDoc(doc(db, "players", player.id), { teamId: null, teamName: null, status: "sin_equipo" });
    await updateDoc(doc(db, "teams", myTeam.id), { players: (myTeam.players || []).filter(id => id !== player.id) });
    showNotif("Jugador eliminado");
  }

  async function addManager() {
    if (!managerEmail.trim() || !myTeam) return;
    setAddingManager(true);
    try {
      const q = query(collection(db, "users"), where("email", "==", managerEmail.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) { showNotif("Usuario no encontrado", C.red); setAddingManager(false); return; }
      const newUid = snap.docs[0].id;
      const newData = snap.docs[0].data();
      if (myTeam.managers?.includes(newUid)) { showNotif("Ya es gestor", C.red); setAddingManager(false); return; }
      if (newData.teamId && newData.teamId !== myTeam.id) { showNotif("Ya gestiona otro equipo", C.red); setAddingManager(false); return; }
      await updateDoc(doc(db, "teams", myTeam.id), { managers: [...(myTeam.managers || []), newUid] });
      await updateDoc(doc(db, "users", newUid), { teamId: myTeam.id });
      setManagerEmail(""); showNotif("Gestor añadido ✓");
    } catch (e) { showNotif("Error: " + e.message, C.red); }
    setAddingManager(false);
  }

  async function removeManager(uid) {
    if (uid === user.uid) return showNotif("No puedes eliminarte a ti mismo", C.red);
    if (!window.confirm("¿Quitar a este gestor?")) return;
    await updateDoc(doc(db, "teams", myTeam.id), { managers: myTeam.managers.filter(m => m !== uid) });
    await updateDoc(doc(db, "users", uid), { teamId: null });
    showNotif("Gestor eliminado");
  }

  function handleLogoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return showNotif("Máx 2MB", C.red);
    setLogoFile(file); setLogoPreview(URL.createObjectURL(file));
  }

  if (teamLoading) return <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Cargando...</div>;

  const elo = myTeam?.elo ?? ELO_DEFAULT;
  const stats = myTeam?.stats || { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, gd: 0, titulos: 0 };
  const { label: tier, color: tierColor } = eloLabel(elo);

  if (!myTeam) {
    return (
      <div>
        {notif && <div style={{ position: "fixed", top: 16, left: 16, right: 16, background: notif.color, color: notif.color === C.green ? "#07090f" : "#fff", padding: "13px 16px", zIndex: 9999, fontSize: 13, fontFamily: "'Georgia',serif", borderRadius: 10, textAlign: "center", fontWeight: 600 }}>{notif.msg}</div>}
        <div style={{ ...S.card, background: "rgba(79,142,247,0.06)", border: "1px solid rgba(79,142,247,0.15)", marginBottom: 16 }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, color: C.blue, fontWeight: 700 }}>Aún no tienes equipo</p>
          <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Crea tu equipo para inscribirte en torneos y aparecer en el ranking ELO.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={S.label}>Escudo</label>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {logoPreview ? <img src={logoPreview} alt="p" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(232,184,75,0.4)" }} /> : <div style={{ width: 64, height: 64, borderRadius: "50%", border: "2px dashed rgba(232,184,75,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🛡</div>}
              <label><input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: "none" }} /><span style={{ ...S.btnSm, display: "inline-block" }}>Subir escudo</span></label>
            </div>
          </div>
          <div><label style={S.label}>Nombre del equipo *</label><input style={S.input} placeholder="Nombre único" value={teamName} onChange={e => setTeamName(e.target.value)} onKeyDown={e => e.key === "Enter" && !saving && createTeam()} /></div>
          <button style={{ ...S.btn(), opacity: saving ? 0.6 : 1 }} onClick={createTeam} disabled={saving}>{saving ? "Creando..." : "Crear equipo →"}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {notif && <div style={{ position: "fixed", top: 16, left: 16, right: 16, background: notif.color, color: notif.color === C.green ? "#07090f" : "#fff", padding: "13px 16px", zIndex: 9999, fontSize: 13, fontFamily: "'Georgia',serif", borderRadius: 10, textAlign: "center", fontWeight: 600 }}>{notif.msg}</div>}

      {/* Sub tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
        {[["equipo", "🛡 Equipo"], ["jugadores", `⚽ Jugadores${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ""}`]].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{ flex: 1, padding: "11px 8px", background: activeTab === id ? "rgba(232,184,75,0.1)" : "transparent", border: "none", borderRight: id === "equipo" ? "1px solid rgba(255,255,255,0.08)" : "none", color: activeTab === id ? C.gold : C.muted, cursor: "pointer", fontSize: 12, fontWeight: activeTab === id ? 700 : 400, fontFamily: "'Georgia',serif" }}>{label}</button>
        ))}
      </div>

      {/* ── EQUIPO TAB ── */}
      {activeTab === "equipo" && (
        <div>
          {/* Team card */}
          <div style={{ ...S.card, borderColor: "rgba(167,139,250,0.2)", background: "rgba(167,139,250,0.04)", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <TeamLogo name={myTeam.name} logoUrl={myTeam.logoUrl} size={60} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {editing ? <input style={{ ...S.input, fontSize: 18, fontWeight: 700, marginBottom: 8 }} value={teamName} onChange={e => setTeamName(e.target.value)} /> : <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>{myTeam.name}</h2>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12 }}>{eloTierIcon(elo)}</span>
                  <span style={{ fontSize: 12, color: tierColor, fontWeight: 600 }}>{tier}</span>
                  <span style={{ fontSize: 12, color: C.muted }}>· ELO {elo}</span>
                  {myTeam.lastEloChange != null && <span style={{ fontSize: 11, color: myTeam.lastEloChange >= 0 ? C.green : C.red }}>{myTeam.lastEloChange > 0 ? "+" : ""}{myTeam.lastEloChange}</span>}
                </div>
                <EloBar elo={elo} />
              </div>
            </div>
            {editing && (
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>Cambiar escudo</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {logoPreview && <img src={logoPreview} alt="p" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />}
                  <label><input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: "none" }} /><span style={{ ...S.btnSm, display: "inline-block" }}>Subir</span></label>
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {editing ? (
                <>
                  <button style={{ ...S.btnInline(C.blue), flex: 1, opacity: saving ? 0.6 : 1 }} onClick={saveTeam} disabled={saving}>{saving ? "..." : "Guardar"}</button>
                  <button style={S.btnSm} onClick={() => { setEditing(false); setTeamName(myTeam.name); setLogoFile(null); setLogoPreview(myTeam.logoUrl); }}>Cancelar</button>
                </>
              ) : <button style={S.btnSm} onClick={() => setEditing(true)}>Editar equipo</button>}
            </div>
          </div>

          {/* Stats */}
          <div style={{ ...S.card, marginBottom: 16 }}>
            <p style={{ ...S.label, marginBottom: 12 }}>Estadísticas históricas</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 10 }}>
              {[["PJ", stats.pj, C.text], ["V", stats.pg, C.green], ["E", stats.pe, C.gold], ["D", stats.pp, C.red]].map(([l, v, c]) => (
                <div key={l} style={{ textAlign: "center", padding: "10px 4px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 18, fontWeight: 700, color: c }}>{v}</p>
                  <p style={{ margin: 0, fontSize: 10, color: C.faint, letterSpacing: 1 }}>{l}</p>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[["GF", stats.gf, C.text], ["GC", stats.gc, C.text], ["DG", (stats.gd ?? 0) > 0 ? `+${stats.gd}` : (stats.gd ?? 0), (stats.gd ?? 0) >= 0 ? C.green : C.red]].map(([l, v, c]) => (
                <div key={l} style={{ textAlign: "center", padding: "8px 4px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700, color: c }}>{v}</p>
                  <p style={{ margin: 0, fontSize: 10, color: C.faint, letterSpacing: 1 }}>{l}</p>
                </div>
              ))}
            </div>
            {stats.titulos > 0 && <p style={{ margin: "12px 0 0", fontSize: 13, color: C.gold, textAlign: "center" }}>{"🏆".repeat(Math.min(stats.titulos, 5))} {stats.titulos} título{stats.titulos !== 1 ? "s" : ""}</p>}
          </div>

          {/* EA FC Club link — manual ID */}
          <div style={{ ...S.card, marginBottom: 16 }}>
            <p style={{ ...S.label, marginBottom: 12 }}>Vinculación con EA FC 26</p>

            {myTeam.eaClubId ? (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "rgba(82,214,138,0.08)", border: "1px solid rgba(82,214,138,0.2)", borderRadius: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 24 }}>🎮</span>
                  <div style={{ flex: 1 }}>
                    {myTeam.eaClubName && <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 14, color: C.green }}>{myTeam.eaClubName}</p>}
                    <p style={{ margin: "0 0 1px", fontSize: 12, color: C.muted }}>Club ID: <strong style={{ color: C.text }}>{myTeam.eaClubId}</strong></p>
                    <p style={{ margin: 0, fontSize: 11, color: C.faint }}>{PLATFORMS.find(p => p.value === myTeam.eaPlatform)?.label || myTeam.eaPlatform}</p>
                  </div>
                  <span style={S.tag(C.green)}>Vinculado ✓</span>
                </div>
                <button style={{ ...S.btnSm, color: C.red, borderColor: "rgba(247,111,111,0.3)" }} onClick={unlinkEa}>Desvincular</button>
              </div>
            ) : !showEaForm ? (
              <div>
                <p style={{ margin: "0 0 12px", fontSize: 12, color: C.muted }}>
                  Vincula tu club de EA FC 26 para detectar resultados automáticamente y actualizar las stats de jugadores al validar cada partido.
                </p>
                <div style={{ ...S.card, background: "rgba(79,142,247,0.04)", border: "1px solid rgba(79,142,247,0.12)", marginBottom: 12 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 12, color: C.blue, fontWeight: 700 }}>¿Cómo encontrar tu Club ID?</p>
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: C.muted }}>1. Ve a <strong style={{ color: C.text }}>proclubshead.com</strong> o <strong style={{ color: C.text }}>proclubs.io</strong></p>
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: C.muted }}>2. Busca tu club por nombre</p>
                  <p style={{ margin: 0, fontSize: 12, color: C.muted }}>3. El ID aparece en la URL o en la ficha del club</p>
                </div>
                <button style={{ ...S.btnInline(C.blue) }} onClick={() => setShowEaForm(true)}>🎮 Vincular club de EA FC</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={S.label}>Club ID de EA FC *</label>
                  <input style={S.input} type="number" placeholder="Ej: 4023" value={eaClubId} onChange={e => setEaClubId(e.target.value)} />
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: C.faint }}>Número que aparece en la URL de tu club en proclubshead.com o proclubs.io</p>
                </div>
                <div>
                  <label style={S.label}>Nombre del club en EA (opcional)</label>
                  <input style={S.input} placeholder="Nombre tal como aparece en el juego" value={eaClubName} onChange={e => setEaClubName(e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>Plataforma</label>
                  <select style={S.select} value={eaPlatform} onChange={e => setEaPlatform(e.target.value)}>
                    {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={{ ...S.btn(), flex: 1, opacity: savingEa ? 0.6 : 1 }} onClick={saveEaLink} disabled={savingEa}>{savingEa ? "Guardando..." : "Vincular →"}</button>
                  <button style={S.btnSm} onClick={() => { setShowEaForm(false); setEaClubId(""); setEaClubName(""); }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>

          {/* Managers */}
          <div style={S.card}>
            <p style={{ ...S.label, marginBottom: 12 }}>Gestores ({managers.length})</p>
            {managers.map(m => (
              <div key={m.uid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(79,142,247,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>👤</div>
                <div style={{ flex: 1 }}><p style={{ margin: "0 0 1px", fontSize: 13, fontWeight: 600 }}>{m.name}</p><p style={{ margin: 0, fontSize: 11, color: C.faint }}>{m.email}</p></div>
                {m.uid === user.uid ? <span style={S.tag(C.gold)}>Tú</span> : <button style={S.btnDanger} onClick={() => removeManager(m.uid)}>Quitar</button>}
              </div>
            ))}
            <div style={{ marginTop: 14 }}>
              <label style={S.label}>Añadir gestor por email</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...S.input, flex: 1 }} type="email" placeholder="email@ejemplo.com" value={managerEmail} onChange={e => setManagerEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && !addingManager && addManager()} />
                <button style={{ ...S.btnInline(C.blue), opacity: addingManager ? 0.6 : 1 }} onClick={addManager} disabled={addingManager}>{addingManager ? "..." : "Añadir"}</button>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: C.faint }}>Solo puede gestionar un equipo a la vez.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── JUGADORES TAB ── */}
      {activeTab === "jugadores" && (
        <div>
          {/* Pending requests */}
          {pendingRequests.length > 0 && (
            <div style={{ ...S.card, borderColor: "rgba(232,184,75,0.2)", background: "rgba(232,184,75,0.04)", marginBottom: 16 }}>
              <p style={{ ...S.label, color: C.gold, marginBottom: 12 }}>Solicitudes pendientes ({pendingRequests.length})</p>
              {pendingRequests.map(req => (
                <div key={req.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(79,142,247,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚽</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: "0 0 1px", fontWeight: 700, fontSize: 14 }}>{req.userName}</p>
                    <p style={{ margin: 0, fontSize: 11, color: C.blue }}>🎮 PRO: {req.proName}</p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...S.btnInline(C.green), padding: "7px 12px", fontSize: 10 }} onClick={() => approvePlayer(req)}>✓</button>
                    <button style={{ ...S.btnDanger, padding: "7px 10px", fontSize: 10 }} onClick={() => rejectPlayer(req)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active players */}
          <div style={S.card}>
            <p style={{ ...S.label, marginBottom: 12 }}>Plantilla ({teamPlayers.length} jugadores)</p>
            {teamPlayers.length === 0 ? (
              <p style={{ color: C.faint, fontSize: 13, textAlign: "center", padding: "16px 0" }}>Aún no hay jugadores en el equipo.</p>
            ) : teamPlayers.map(player => {
              const g = player.stats?.global || { pj: 0, goles: 0, asistencias: 0, mvp: 0, media: 0, mediaCount: 0 };
              const media = g.pj > 0 ? (g.media / (g.mediaCount || g.pj)).toFixed(1) : "—";
              return (
                <div key={player.id} style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(79,142,247,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚽</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: "0 0 1px", fontWeight: 700, fontSize: 14 }}>{player.userName}</p>
                      <p style={{ margin: 0, fontSize: 11, color: C.blue }}>🎮 {player.proName}</p>
                    </div>
                    <button style={{ ...S.btnDanger, fontSize: 9, padding: "5px 8px" }} onClick={() => removePlayer(player)}>Expulsar</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4 }}>
                    {[["PJ", g.pj, C.muted], ["⚽", g.goles, C.green], ["🅰", g.asistencias, C.blue], ["★", g.mvp, C.gold], ["✦", media, C.purple]].map(([l, v, c]) => (
                      <div key={l} style={{ textAlign: "center", padding: "6px 2px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                        <p style={{ margin: "0 0 1px", fontSize: 13, fontWeight: 700, color: c }}>{v}</p>
                        <p style={{ margin: 0, fontSize: 8, color: C.faint }}>{l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
