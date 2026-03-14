import { useState, useEffect } from "react";
import { db, storage } from "../firebase";
import { collection, doc, addDoc, updateDoc, getDoc, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../AuthContext";
import { C, S, TeamLogo, EloBar, eloLabel, eloTierIcon, ELO_DEFAULT } from "../shared.jsx";

export default function TeamManager() {
  const { user, profile } = useAuth();
  const [myTeam, setMyTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState(null);
  const [managerEmail, setManagerEmail] = useState("");
  const [addingManager, setAddingManager] = useState(false);
  const [managers, setManagers] = useState([]);

  function showNotif(msg, color = C.green) {
    setNotif({ msg, color });
    setTimeout(() => setNotif(null), 3000);
  }

  useEffect(() => {
    if (!profile?.teamId) { setLoading(false); return; }
    return onSnapshot(doc(db, "teams", profile.teamId), snap => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setMyTeam(data);
        setTeamName(data.name);
        setLogoPreview(data.logoUrl || null);
        if (data.managers?.length) {
          Promise.all(data.managers.map(uid => getDoc(doc(db, "users", uid))))
            .then(snaps => setManagers(snaps.filter(s => s.exists()).map(s => ({ uid: s.id, ...s.data() }))));
        }
      }
      setLoading(false);
    });
  }, [profile?.teamId]);

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
        name: teamName.trim(),
        nameLower: teamName.trim().toLowerCase(),
        logoUrl,
        managers: [user.uid],
        createdBy: user.uid,
        elo: ELO_DEFAULT,
        lastEloChange: null,
        stats: { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, gd: 0, titulos: 0 },
        createdAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, "users", user.uid), { teamId: teamDoc.id });
      showNotif("Equipo creado ✓");
    } catch (e) {
      console.error("Error creating team:", e);
      showNotif("Error al crear el equipo: " + e.message, C.red);
    }
    setSaving(false);
  }

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
      await updateDoc(doc(db, "teams", myTeam.id), {
        name: teamName.trim(),
        nameLower: teamName.trim().toLowerCase(),
        logoUrl,
      });
      setLogoFile(null);
      setEditing(false);
      showNotif("Equipo actualizado ✓");
    } catch (e) {
      showNotif("Error al guardar: " + e.message, C.red);
    }
    setSaving(false);
  }

  async function addManager() {
    if (!managerEmail.trim() || !myTeam) return;
    setAddingManager(true);
    try {
      const q = query(collection(db, "users"), where("email", "==", managerEmail.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) {
        showNotif("No se encontró ningún usuario con ese email", C.red);
        setAddingManager(false);
        return;
      }
      const newManagerUid = snap.docs[0].id;
      const newManagerData = snap.docs[0].data();
      if (myTeam.managers?.includes(newManagerUid)) {
        showNotif("Ese usuario ya es gestor", C.red);
        setAddingManager(false);
        return;
      }
      if (newManagerData.teamId && newManagerData.teamId !== myTeam.id) {
        showNotif("Ese usuario ya gestiona otro equipo", C.red);
        setAddingManager(false);
        return;
      }
      await updateDoc(doc(db, "teams", myTeam.id), {
        managers: [...(myTeam.managers || []), newManagerUid],
      });
      await updateDoc(doc(db, "users", newManagerUid), { teamId: myTeam.id });
      setManagerEmail("");
      showNotif("Gestor añadido ✓");
    } catch (e) {
      showNotif("Error: " + e.message, C.red);
    }
    setAddingManager(false);
  }

  async function removeManager(uid) {
    if (uid === user.uid) return showNotif("No puedes eliminarte a ti mismo", C.red);
    if (!window.confirm("¿Quitar a este gestor del equipo?")) return;
    try {
      await updateDoc(doc(db, "teams", myTeam.id), {
        managers: myTeam.managers.filter(m => m !== uid),
      });
      await updateDoc(doc(db, "users", uid), { teamId: null });
      showNotif("Gestor eliminado");
    } catch (e) {
      showNotif("Error: " + e.message, C.red);
    }
  }

  function handleLogoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return showNotif("Máx 2MB", C.red);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.faint }}>Cargando...</div>;

  const elo = myTeam?.elo ?? ELO_DEFAULT;
  const stats = myTeam?.stats || { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, gd: 0, titulos: 0 };
  const { label: tier, color: tierColor } = eloLabel(elo);

  return (
    <div>
      {notif && (
        <div style={{ position: "fixed", top: 16, left: 16, right: 16, background: notif.color, color: notif.color === C.green ? "#07090f" : "#fff", padding: "13px 16px", zIndex: 9999, fontSize: 13, fontFamily: "'Georgia',serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", borderRadius: 10, textAlign: "center", fontWeight: 600 }}>{notif.msg}</div>
      )}

      {!myTeam ? (
        /* ── Crear equipo ── */
        <div>
          <div style={{ ...S.card, background: "rgba(79,142,247,0.06)", border: "1px solid rgba(79,142,247,0.15)", marginBottom: 16 }}>
            <p style={{ margin: "0 0 4px", fontSize: 13, color: C.blue, fontWeight: 700 }}>Aún no tienes equipo</p>
            <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Crea tu equipo para inscribirte en torneos y aparecer en el ranking ELO.</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={S.label}>Escudo del equipo</label>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {logoPreview
                  ? <img src={logoPreview} alt="preview" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(232,184,75,0.4)" }} />
                  : <div style={{ width: 64, height: 64, borderRadius: "50%", border: "2px dashed rgba(232,184,75,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, background: "rgba(232,184,75,0.04)", flexShrink: 0 }}>🛡</div>
                }
                <label>
                  <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: "none" }} />
                  <span style={{ ...S.btnSm, display: "inline-block" }}>Subir escudo</span>
                </label>
              </div>
            </div>
            <div>
              <label style={S.label}>Nombre del equipo *</label>
              <input style={S.input} placeholder="Nombre único para tu equipo" value={teamName} onChange={e => setTeamName(e.target.value)} onKeyDown={e => e.key === "Enter" && !saving && createTeam()} />
            </div>
            <button style={{ ...S.btn(), opacity: saving ? 0.6 : 1 }} onClick={createTeam} disabled={saving}>
              {saving ? "Creando..." : "Crear equipo →"}
            </button>
          </div>
        </div>
      ) : (
        /* ── Mi equipo ── */
        <div>
          {/* Team card */}
          <div style={{ ...S.card, borderColor: "rgba(167,139,250,0.2)", background: "rgba(167,139,250,0.04)", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <TeamLogo name={myTeam.name} logoUrl={myTeam.logoUrl} size={60} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {editing ? (
                  <input style={{ ...S.input, fontSize: 18, fontWeight: 700, marginBottom: 8 }} value={teamName} onChange={e => setTeamName(e.target.value)} />
                ) : (
                  <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>{myTeam.name}</h2>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12 }}>{eloTierIcon(elo)}</span>
                  <span style={{ fontSize: 12, color: tierColor, fontWeight: 600 }}>{tier}</span>
                  <span style={{ fontSize: 12, color: C.muted }}>· ELO {elo}</span>
                  {myTeam.lastEloChange != null && (
                    <span style={{ fontSize: 11, color: myTeam.lastEloChange >= 0 ? C.green : C.red }}>
                      {myTeam.lastEloChange > 0 ? "+" : ""}{myTeam.lastEloChange}
                    </span>
                  )}
                </div>
                <EloBar elo={elo} />
              </div>
            </div>

            {editing && (
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>Cambiar escudo</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {logoPreview && <img src={logoPreview} alt="preview" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />}
                  <label>
                    <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: "none" }} />
                    <span style={{ ...S.btnSm, display: "inline-block" }}>Subir escudo</span>
                  </label>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              {editing ? (
                <>
                  <button style={{ ...S.btnInline(C.blue), flex: 1, opacity: saving ? 0.6 : 1 }} onClick={saveTeam} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
                  <button style={S.btnSm} onClick={() => { setEditing(false); setTeamName(myTeam.name); setLogoFile(null); setLogoPreview(myTeam.logoUrl); }}>Cancelar</button>
                </>
              ) : (
                <button style={S.btnSm} onClick={() => setEditing(true)}>Editar equipo</button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div style={{ ...S.card, marginBottom: 16 }}>
            <p style={{ ...S.label, marginBottom: 12 }}>Estadísticas históricas</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
              {[["PJ", stats.pj, C.text], ["V", stats.pg, C.green], ["E", stats.pe, C.gold], ["D", stats.pp, C.red]].map(([l, v, c]) => (
                <div key={l} style={{ textAlign: "center", padding: "10px 4px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 18, fontWeight: 700, color: c }}>{v}</p>
                  <p style={{ margin: 0, fontSize: 10, color: C.faint, letterSpacing: 1 }}>{l}</p>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                ["GF", stats.gf, C.text],
                ["GC", stats.gc, C.text],
                ["DG", (stats.gd ?? 0) > 0 ? `+${stats.gd}` : (stats.gd ?? 0), (stats.gd ?? 0) >= 0 ? C.green : C.red],
              ].map(([l, v, c]) => (
                <div key={l} style={{ textAlign: "center", padding: "8px 4px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700, color: c }}>{v}</p>
                  <p style={{ margin: 0, fontSize: 10, color: C.faint, letterSpacing: 1 }}>{l}</p>
                </div>
              ))}
            </div>
            {stats.titulos > 0 && (
              <p style={{ margin: "12px 0 0", fontSize: 13, color: C.gold, textAlign: "center" }}>
                {"🏆".repeat(Math.min(stats.titulos, 5))} {stats.titulos} título{stats.titulos !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {/* Managers */}
          <div style={S.card}>
            <p style={{ ...S.label, marginBottom: 12 }}>Gestores del equipo ({managers.length})</p>
            {managers.map(m => (
              <div key={m.uid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(79,142,247,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>👤</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 1px", fontSize: 13, fontWeight: 600 }}>{m.name}</p>
                  <p style={{ margin: 0, fontSize: 11, color: C.faint }}>{m.email}</p>
                </div>
                {m.uid === user.uid
                  ? <span style={S.tag(C.gold)}>Tú</span>
                  : <button style={S.btnDanger} onClick={() => removeManager(m.uid)}>Quitar</button>
                }
              </div>
            ))}

            <div style={{ marginTop: 16 }}>
              <label style={S.label}>Añadir gestor por email</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...S.input, flex: 1 }}
                  type="email"
                  placeholder="email@ejemplo.com"
                  value={managerEmail}
                  onChange={e => setManagerEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !addingManager && addManager()}
                />
                <button style={{ ...S.btnInline(C.blue), opacity: addingManager ? 0.6 : 1 }} onClick={addManager} disabled={addingManager}>
                  {addingManager ? "..." : "Añadir"}
                </button>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: C.faint }}>
                El usuario debe estar registrado. Solo puede gestionar un equipo a la vez.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
