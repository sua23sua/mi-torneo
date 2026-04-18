import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, doc, addDoc, updateDoc, getDoc, query, where, getDocs, onSnapshot, orderBy } from "firebase/firestore";
import { useAuth } from "../AuthContext";
import { C, S, TeamLogo } from "../shared.jsx";

const POSITION_NAMES = {
  0: "Portero", 1: "Defensa central", 2: "Lateral dcho", 3: "Lateral izq",
  4: "Mediocentro def", 5: "Mediocentro", 6: "Mediocentro of",
  7: "Extremo dcho", 8: "Extremo izq", 9: "Delantero centro", 10: "Segunda punta",
};

function StatBox({ label, value, color = C.text, size = 18 }) {
  return (
    <div style={{ textAlign: "center", padding: "10px 4px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
      <p style={{ margin: "0 0 2px", fontSize: size, fontWeight: 700, color }}>{value}</p>
      <p style={{ margin: 0, fontSize: 9, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>{label}</p>
    </div>
  );
}

export default function PlayerProfile({ logoMap }) {
  const { user, profile } = useAuth();
  const [playerDoc, setPlayerDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [proName, setProName] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [teamResults, setTeamResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState(null);
  const [myTeam, setMyTeam] = useState(null);
  const [statsView, setStatsView] = useState("global"); // global | byTeam | bySeason
  const [editingProName, setEditingProName] = useState(false);
  const [newProName, setNewProName] = useState("");

  function showNotif(msg, color = C.green) {
    setNotif({ msg, color });
    setTimeout(() => setNotif(null), 3000);
  }

  // Load player doc for current user
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "players"), where("userId", "==", user.uid));
    return onSnapshot(q, snap => {
      if (!snap.empty) {
        const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
        setPlayerDoc(data);
        setProName(data.proName || "");
      } else {
        setPlayerDoc(null);
      }
      setLoading(false);
    });
  }, [user]);

  // Load team info when player has a team
  useEffect(() => {
    if (!playerDoc?.teamId) { setMyTeam(null); return; }
    return onSnapshot(doc(db, "teams", playerDoc.teamId), snap => {
      if (snap.exists()) setMyTeam({ id: snap.id, ...snap.data() });
      else setMyTeam(null);
    });
  }, [playerDoc?.teamId]);

  async function registerAsPlayer() {
    if (!proName.trim()) return showNotif("Introduce tu nombre de PRO en EA FC", C.red);
    setSaving(true);
    try {
      await addDoc(collection(db, "players"), {
        userId: user.uid,
        userName: profile?.name || user.email,
        proName: proName.trim(),
        teamId: null, teamName: null,
        status: "sin_equipo",
        stats: {
          global: { pj: 0, goles: 0, asistencias: 0, mvp: 0, media: 0, mediaCount: 0 },
          byTeam: {},
          bySeason: {},
        },
        createdAt: new Date().toISOString(),
      });
      showNotif("¡Perfil de jugador creado! Ahora busca un equipo.");
    } catch (e) { showNotif("Error: " + e.message, C.red); }
    setSaving(false);
  }

  async function searchTeams() {
    if (!teamSearch.trim()) return;
    setSearching(true); setTeamResults([]);
    const q = query(collection(db, "teams"), where("nameLower", ">=", teamSearch.toLowerCase()), where("nameLower", "<=", teamSearch.toLowerCase() + "\uf8ff"));
    const snap = await getDocs(q);
    setTeamResults(snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 5));
    if (snap.empty) showNotif("No se encontraron equipos", C.orange);
    setSearching(false);
  }

  async function requestJoin(team) {
    if (!playerDoc) return;
    if (team.id === playerDoc.teamId) return showNotif("Ya estás en este equipo", C.red);
    // Check if player already has a pending request
    const existing = query(collection(db, "playerRequests"), where("playerId", "==", playerDoc.id), where("teamId", "==", team.id));
    const snap = await getDocs(existing);
    if (!snap.empty) return showNotif("Ya enviaste una solicitud a este equipo", C.orange);

    await addDoc(collection(db, "playerRequests"), {
      playerId: playerDoc.id,
      userId: user.uid,
      userName: profile?.name || user.email,
      proName: playerDoc.proName,
      teamId: team.id,
      teamName: team.name,
      status: "pendiente",
      createdAt: new Date().toISOString(),
    });
    setTeamResults([]); setTeamSearch("");
    showNotif(`Solicitud enviada a ${team.name} ✓`);
  }

  async function leaveTeam() {
    if (!playerDoc?.teamId || !window.confirm("¿Abandonar el equipo?")) return;
    // Remove from team's players array
    const teamSnap = await getDoc(doc(db, "teams", playerDoc.teamId));
    if (teamSnap.exists()) {
      const players = (teamSnap.data().players || []).filter(id => id !== playerDoc.id);
      await updateDoc(doc(db, "teams", playerDoc.teamId), { players });
    }
    await updateDoc(doc(db, "players", playerDoc.id), { teamId: null, teamName: null, status: "sin_equipo" });
    showNotif("Has abandonado el equipo");
  }

  async function saveProName() {
    if (!newProName.trim() || !playerDoc) return;
    await updateDoc(doc(db, "players", playerDoc.id), { proName: newProName.trim() });
    setEditingProName(false);
    showNotif("Nombre de PRO actualizado ✓");
  }

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Cargando...</div>;

  // ── Not registered yet ────────────────────────────────────────
  if (!playerDoc) {
    return (
      <div>
        {notif && <div style={{ position: "fixed", top: 16, left: 16, right: 16, background: notif.color, color: notif.color === C.green ? "#07090f" : "#fff", padding: "13px 16px", zIndex: 9999, fontSize: 13, fontFamily: "'Georgia',serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", borderRadius: 10, textAlign: "center", fontWeight: 600 }}>{notif.msg}</div>}
        <div style={{ ...S.card, background: "rgba(79,142,247,0.06)", border: "1px solid rgba(79,142,247,0.15)", marginBottom: 16 }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, color: C.blue, fontWeight: 700 }}>Registrarte como jugador</p>
          <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Introduce el nombre de tu PRO en EA FC 26 para aparecer en las estadísticas de los partidos.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={S.label}>Nombre de tu PRO en EA FC 26 *</label>
            <input style={S.input} placeholder="Ej: CristianoFc26" value={proName} onChange={e => setProName(e.target.value)} onKeyDown={e => e.key === "Enter" && !saving && registerAsPlayer()} />
            <p style={{ margin: "6px 0 0", fontSize: 11, color: C.faint }}>Es el nombre de tu jugador virtual, no tu nombre de usuario de PSN/Xbox.</p>
          </div>
          <button style={{ ...S.btn(), opacity: saving ? 0.6 : 1 }} onClick={registerAsPlayer} disabled={saving}>
            {saving ? "Registrando..." : "Registrarme como jugador →"}
          </button>
        </div>
      </div>
    );
  }

  // ── Registered player ─────────────────────────────────────────
  const stats = playerDoc.stats || { global: { pj: 0, goles: 0, asistencias: 0, mvp: 0, media: 0 } };
  const globalStats = stats.global || { pj: 0, goles: 0, asistencias: 0, mvp: 0, media: 0 };

  return (
    <div>
      {notif && <div style={{ position: "fixed", top: 16, left: 16, right: 16, background: notif.color, color: notif.color === C.green ? "#07090f" : "#fff", padding: "13px 16px", zIndex: 9999, fontSize: 13, fontFamily: "'Georgia',serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", borderRadius: 10, textAlign: "center", fontWeight: 600 }}>{notif.msg}</div>}

      {/* Player card */}
      <div style={{ ...S.card, borderColor: "rgba(79,142,247,0.2)", background: "rgba(79,142,247,0.04)", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(79,142,247,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>⚽</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 18 }}>{profile?.name || user.email}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {editingProName ? (
                <>
                  <input style={{ ...S.input, fontSize: 13, padding: "6px 10px", flex: 1 }} value={newProName} onChange={e => setNewProName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveProName()} />
                  <button style={{ ...S.btnInline(C.blue), padding: "6px 12px", fontSize: 10 }} onClick={saveProName}>✓</button>
                  <button style={{ ...S.btnSm, padding: "6px 10px", fontSize: 10 }} onClick={() => setEditingProName(false)}>✕</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 12, color: C.blue }}>🎮 {playerDoc.proName}</span>
                  <button style={{ ...S.btnSm, padding: "4px 8px", fontSize: 9 }} onClick={() => { setNewProName(playerDoc.proName); setEditingProName(true); }}>Editar</button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Team status */}
        {myTeam ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(82,214,138,0.08)", border: "1px solid rgba(82,214,138,0.2)", borderRadius: 8 }}>
            <TeamLogo name={myTeam.name} logoUrl={myTeam.logoUrl || logoMap?.[myTeam.name]} size={32} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 1px", fontWeight: 700, fontSize: 13, color: C.green }}>{myTeam.name}</p>
              <p style={{ margin: 0, fontSize: 11, color: C.muted }}>Tu equipo actual</p>
            </div>
            <button style={{ ...S.btnDanger, fontSize: 10, padding: "6px 10px" }} onClick={leaveTeam}>Salir</button>
          </div>
        ) : playerDoc.status === "pendiente" ? (
          <div style={{ padding: "10px 12px", background: "rgba(232,184,75,0.08)", border: "1px solid rgba(232,184,75,0.2)", borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: C.gold }}>⏳ Solicitud pendiente de aprobación por el gestor del equipo</p>
          </div>
        ) : null}
      </div>

      {/* Stats */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <p style={{ ...S.label, margin: 0 }}>Estadísticas</p>
          <div style={{ display: "flex", gap: 6 }}>
            {[["global", "Global"], ["byTeam", "Por equipo"], ["bySeason", "Temporada"]].map(([id, label]) => (
              <button key={id} onClick={() => setStatsView(id)} style={{ ...S.btnSm, padding: "5px 10px", fontSize: 9, borderColor: statsView === id ? C.blue : undefined, color: statsView === id ? C.blue : undefined }}>{label}</button>
            ))}
          </div>
        </div>

        {statsView === "global" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
              <StatBox label="PJ" value={globalStats.pj} />
              <StatBox label="Goles" value={globalStats.goles} color={C.green} />
              <StatBox label="Asist" value={globalStats.asistencias} color={C.blue} />
              <StatBox label="MVP" value={globalStats.mvp} color={C.gold} />
              <StatBox label="Media" value={globalStats.pj > 0 ? (globalStats.media / (globalStats.mediaCount || globalStats.pj)).toFixed(1) : "—"} color={C.purple} />
            </div>
          </>
        )}

        {statsView === "byTeam" && (
          Object.keys(stats.byTeam || {}).length === 0
            ? <p style={{ color: C.faint, fontSize: 13, textAlign: "center" }}>Sin datos por equipo todavía</p>
            : Object.entries(stats.byTeam).map(([teamId, s]) => (
              <div key={teamId} style={{ marginBottom: 14 }}>
                <p style={{ ...S.label, marginBottom: 8, color: C.blue }}>{s.teamName || teamId}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
                  <StatBox label="PJ" value={s.pj} />
                  <StatBox label="Goles" value={s.goles} color={C.green} />
                  <StatBox label="Asist" value={s.asistencias} color={C.blue} />
                  <StatBox label="MVP" value={s.mvp} color={C.gold} />
                  <StatBox label="Media" value={s.pj > 0 ? (s.media / (s.mediaCount || s.pj)).toFixed(1) : "—"} color={C.purple} />
                </div>
              </div>
            ))
        )}

        {statsView === "bySeason" && (
          Object.keys(stats.bySeason || {}).length === 0
            ? <p style={{ color: C.faint, fontSize: 13, textAlign: "center" }}>Sin datos por temporada todavía</p>
            : Object.entries(stats.bySeason).sort((a, b) => b[0].localeCompare(a[0])).map(([season, s]) => (
              <div key={season} style={{ marginBottom: 14 }}>
                <p style={{ ...S.label, marginBottom: 8, color: C.gold }}>Temporada {season}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
                  <StatBox label="PJ" value={s.pj} />
                  <StatBox label="Goles" value={s.goles} color={C.green} />
                  <StatBox label="Asist" value={s.asistencias} color={C.blue} />
                  <StatBox label="MVP" value={s.mvp} color={C.gold} />
                  <StatBox label="Media" value={s.pj > 0 ? (s.media / (s.mediaCount || s.pj)).toFixed(1) : "—"} color={C.purple} />
                </div>
              </div>
            ))
        )}
      </div>

      {/* Join team */}
      {!myTeam && playerDoc.status !== "pendiente" && (
        <div style={S.card}>
          <p style={{ ...S.label, marginBottom: 12 }}>Unirse a un equipo</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input style={{ ...S.input, flex: 1 }} placeholder="Nombre del equipo..." value={teamSearch} onChange={e => setTeamSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && searchTeams()} />
            <button style={{ ...S.btnInline(C.blue), opacity: searching ? 0.6 : 1 }} onClick={searchTeams} disabled={searching}>{searching ? "..." : "Buscar"}</button>
          </div>
          {teamResults.map(team => (
            <div key={team.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, marginBottom: 8 }}>
              <TeamLogo name={team.name} logoUrl={team.logoUrl} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: "0 0 1px", fontWeight: 700, fontSize: 14 }}>{team.name}</p>
                <p style={{ margin: 0, fontSize: 11, color: C.muted }}>ELO {team.elo || 1000} · {(team.players || []).length} jugadores</p>
              </div>
              <button style={{ ...S.btnInline(C.blue), padding: "8px 14px", fontSize: 11 }} onClick={() => requestJoin(team)}>Solicitar →</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
