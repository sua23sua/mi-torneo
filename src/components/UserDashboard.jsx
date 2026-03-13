import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { useAuth } from "../AuthContext";

const S = {
  wrap: { minHeight: "100vh", background: "#080c14", fontFamily: "'Georgia','Times New Roman',serif", color: "#e8edf4" },
  header: {
    borderBottom: "1px solid rgba(212,160,60,0.15)", padding: "0 32px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    height: 60, background: "rgba(8,12,20,0.9)", backdropFilter: "blur(12px)",
    position: "sticky", top: 0, zIndex: 100,
  },
  logo: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: { width: 30, height: 30, background: "#d4a03c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#0a0a0f" },
  logoText: { fontSize: 16, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#d4a03c" },
  main: { maxWidth: 900, margin: "0 auto", padding: "36px 32px" },
  label: { fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#6a7890", display: "block", marginBottom: 8 },
  input: { width: "100%", padding: "10px 14px", fontSize: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#e8edf4", boxSizing: "border-box", fontFamily: "'Georgia',serif" },
  btn: { padding: "10px 24px", background: "#d4a03c", border: "none", color: "#0a0a0f", cursor: "pointer", letterSpacing: 2, textTransform: "uppercase", fontSize: 11, fontWeight: 700, fontFamily: "'Georgia',serif" },
  btnSm: { padding: "6px 14px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "#c8d4e4", cursor: "pointer", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontFamily: "'Georgia',serif" },
  card: { border: "1px solid rgba(212,160,60,0.15)", background: "rgba(255,255,255,0.02)", padding: 24, marginBottom: 16 },
  tag: (color) => ({ fontSize: 9, letterSpacing: 2, padding: "3px 8px", background: `${color}22`, color, border: `1px solid ${color}44`, textTransform: "uppercase" }),
  tab: (active) => ({ padding: "10px 24px", background: "none", border: "none", borderBottom: active ? "2px solid #d4a03c" : "2px solid transparent", color: active ? "#d4a03c" : "#6a7890", cursor: "pointer", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Georgia',serif", marginBottom: -1 }),
};

const sportEmoji = { Fútbol: "⚽", Baloncesto: "🏀", Tenis: "🎾", Voleibol: "🏐", Pádel: "🏓", Rugby: "🏉" };
const statusColor = { Abierto: "#4ade80", "En curso": "#388bff", Finalizado: "#facc15", Cerrado: "#94a3b8" };

export default function UserDashboard({ onLogout }) {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState("torneos");
  const [tournaments, setTournaments] = useState([]);
  const [myInscriptions, setMyInscriptions] = useState([]);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [teamName, setTeamName] = useState("");
  const [notif, setNotif] = useState(null);
  const [showModal, setShowModal] = useState(false);

  function showNotif(msg) { setNotif(msg); setTimeout(() => setNotif(null), 2500); }

  useEffect(() => {
    const q = query(collection(db, "tournaments"), orderBy("createdAt", "desc"));
    return onSnapshot(q, snap => setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "inscriptions"), where("userId", "==", user.uid));
    return onSnapshot(q, snap => setMyInscriptions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);

  async function inscribirse() {
    if (!teamName.trim()) return showNotif("Escribe el nombre de tu equipo");
    const alreadyIn = myInscriptions.find(i => i.tournamentId === selectedTournament.id);
    if (alreadyIn) return showNotif("Ya estás inscrito en este torneo");
    await addDoc(collection(db, "inscriptions"), {
      tournamentId: selectedTournament.id,
      tournamentName: selectedTournament.name,
      userId: user.uid,
      userName: profile?.name || user.email,
      teamName: teamName.trim(),
      status: "pendiente",
      createdAt: new Date().toISOString(),
    });
    setTeamName("");
    setShowModal(false);
    showNotif("Solicitud enviada, pendiente de aprobación");
  }

  const myTournamentIds = myInscriptions.map(i => i.tournamentId);

  return (
    <div style={S.wrap}>
      {notif && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#d4a03c", color: "#0a0a0f", padding: "10px 24px", zIndex: 1000, letterSpacing: 1, fontSize: 12, fontFamily: "'Georgia',serif", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
          {notif}
        </div>
      )}

      {showModal && selectedTournament && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#0e1420", border: "1px solid rgba(212,160,60,0.3)", padding: 40, maxWidth: 400, width: "90%" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 20 }}>Inscribirse</h3>
            <p style={{ margin: "0 0 24px", color: "#6a7890", fontSize: 13 }}>{selectedTournament.name}</p>
            <label style={S.label}>Nombre de tu equipo</label>
            <input style={{ ...S.input, marginBottom: 20 }} placeholder="Ej: Los Campeones" value={teamName} onChange={e => setTeamName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && inscribirse()} />
            <div style={{ display: "flex", gap: 12 }}>
              <button style={S.btn} onClick={inscribirse}>Enviar solicitud</button>
              <button style={S.btnSm} onClick={() => setShowModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`input:focus{outline:none;border-color:#d4a03c!important;}input::placeholder{color:rgba(200,212,228,0.25)!important;}`}</style>

      <header style={S.header}>
        <div style={S.logo}>
          <div style={S.logoIcon}>⚔</div>
          <span style={S.logoText}>TournamentOS</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 12, color: "#6a7890" }}>{profile?.name || user?.email}</span>
          <button style={S.btnSm} onClick={onLogout}>Salir</button>
        </div>
      </header>

      <main style={S.main}>
        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 32 }}>
          {["torneos", "mis-inscripciones"].map(t => (
            <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
              {t === "torneos" ? "Torneos disponibles" : "Mis inscripciones"}
            </button>
          ))}
        </div>

        {/* TORNEOS DISPONIBLES */}
        {tab === "torneos" && (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 24px" }}>Torneos</h1>
            {tournaments.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: "#4a5568" }}>
                No hay torneos disponibles aún.
              </div>
            ) : (
              tournaments.map(t => {
                const myInsc = myInscriptions.find(i => i.tournamentId === t.id);
                return (
                  <div key={t.id} style={S.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 12 }}>
                      <div style={{ display: "flex", gap: 16, alignItems: "start" }}>
                        <span style={{ fontSize: 28 }}>{sportEmoji[t.sport] || "🏆"}</span>
                        <div>
                          <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>{t.name}</h3>
                          <p style={{ margin: "0 0 8px", color: "#6a7890", fontSize: 12 }}>{t.sport} · {t.format} · {t.teams?.length || 0} equipos</p>
                          {t.description && <p style={{ margin: "0 0 8px", fontSize: 13, color: "#8a9ab4" }}>{t.description}</p>}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span style={S.tag(statusColor[t.status] || "#94a3b8")}>{t.status}</span>
                            {myInsc && <span style={S.tag(myInsc.status === "aprobada" ? "#4ade80" : myInsc.status === "rechazada" ? "#ff8080" : "#facc15")}>
                              {myInsc.status === "aprobada" ? "✓ Inscrito" : myInsc.status === "rechazada" ? "Rechazado" : "Pendiente"}
                            </span>}
                          </div>
                        </div>
                      </div>
                      <div>
                        {!myInsc && t.status === "Abierto" && (
                          <button style={S.btn} onClick={() => { setSelectedTournament(t); setShowModal(true); }}>
                            Inscribirse
                          </button>
                        )}
                        {myInsc && t.status !== "Abierto" && (
                          <button style={S.btnSm} onClick={() => setSelectedTournament(selectedTournament?.id === t.id ? null : t)}>
                            {selectedTournament?.id === t.id ? "Ocultar" : "Ver partidos"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Bracket visible para inscritos */}
                    {selectedTournament?.id === t.id && t.bracket?.length > 0 && (
                      <div style={{ marginTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 20 }}>
                        <p style={{ ...S.label, marginBottom: 12 }}>Partidos</p>
                        {t.bracket.map((match, idx) => (
                          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, color: "#4a5568", minWidth: 70, letterSpacing: 1 }}>Partido {idx + 1}</span>
                            <span style={{ fontWeight: match.winner === match.teamA ? 700 : 400, color: match.winner === match.teamA ? "#d4a03c" : "#e8edf4", minWidth: 100 }}>{match.teamA}</span>
                            <span style={{ color: "#4a5568" }}>vs</span>
                            <span style={{ fontWeight: match.winner === match.teamB ? 700 : 400, color: match.winner === match.teamB ? "#d4a03c" : "#e8edf4", minWidth: 100 }}>{match.teamB}</span>
                            {match.winner && <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 700, letterSpacing: 3, color: "#d4a03c" }}>{match.scoreA} — {match.scoreB}</span>}
                            {!match.winner && <span style={{ marginLeft: "auto", fontSize: 10, color: "#4a5568", letterSpacing: 1 }}>Pendiente</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {/* MIS INSCRIPCIONES */}
        {tab === "mis-inscripciones" && (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 24px" }}>Mis inscripciones</h1>
            {myInscriptions.length === 0 ? (
              <div style={{ border: "1px dashed rgba(255,255,255,0.08)", padding: 48, textAlign: "center", color: "#4a5568" }}>
                Aún no te has inscrito en ningún torneo.
              </div>
            ) : (
              myInscriptions.map(i => {
                const tournament = tournaments.find(t => t.id === i.tournamentId);
                const myMatches = tournament?.bracket?.filter(m => m.teamA === i.teamName || m.teamB === i.teamName) || [];
                return (
                  <div key={i.id} style={S.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: myMatches.length > 0 ? 16 : 0 }}>
                      <div>
                        <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>{i.tournamentName}</h3>
                        <p style={{ margin: "0 0 8px", color: "#6a7890", fontSize: 12 }}>Equipo: <strong style={{ color: "#e8edf4" }}>{i.teamName}</strong> · {new Date(i.createdAt).toLocaleDateString("es-ES")}</p>
                      </div>
                      <span style={S.tag(i.status === "aprobada" ? "#4ade80" : i.status === "rechazada" ? "#ff8080" : "#facc15")}>
                        {i.status === "aprobada" ? "✓ Aprobado" : i.status === "rechazada" ? "Rechazado" : "Pendiente"}
                      </span>
                    </div>

                    {myMatches.length > 0 && (
                      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
                        <p style={{ ...S.label, marginBottom: 10 }}>Tus partidos</p>
                        {myMatches.map((match, idx) => (
                          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap" }}>
                            <span style={{ fontWeight: match.teamA === i.teamName ? 700 : 400, color: match.teamA === i.teamName ? "#d4a03c" : "#e8edf4", minWidth: 100 }}>{match.teamA}</span>
                            <span style={{ color: "#4a5568" }}>vs</span>
                            <span style={{ fontWeight: match.teamB === i.teamName ? 700 : 400, color: match.teamB === i.teamName ? "#d4a03c" : "#e8edf4", minWidth: 100 }}>{match.teamB}</span>
                            {match.winner ? (
                              <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
                                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3, color: "#d4a03c" }}>{match.scoreA} — {match.scoreB}</span>
                                <span style={S.tag(match.winner === i.teamName ? "#4ade80" : "#ff8080")}>{match.winner === i.teamName ? "Victoria" : "Derrota"}</span>
                              </div>
                            ) : <span style={{ marginLeft: "auto", fontSize: 10, color: "#4a5568", letterSpacing: 1 }}>Pendiente</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </main>
    </div>
  );
}
