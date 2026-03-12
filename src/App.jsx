import { useState } from "react";

const initialTournaments = [];

const PHASES = ["Grupos", "Octavos", "Cuartos", "Semifinal", "Final"];

function generateBracket(teams) {
  if (teams.length < 2) return [];
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  const matches = [];
  for (let i = 0; i < shuffled.length - 1; i += 2) {
    matches.push({ teamA: shuffled[i], teamB: shuffled[i + 1] || "BYE", scoreA: null, scoreB: null, winner: null });
  }
  return matches;
}

export default function App() {
  const [view, setView] = useState("home");
  const [tournaments, setTournaments] = useState(initialTournaments);
  const [activeTournament, setActiveTournament] = useState(null);
  const [form, setForm] = useState({ name: "", sport: "Fútbol", format: "Eliminatoria" });
  const [teamInput, setTeamInput] = useState("");
  const [teams, setTeams] = useState([]);
  const [activeTab, setActiveTab] = useState("bracket");
  const [scores, setScores] = useState({});
  const [notification, setNotification] = useState(null);

  const sports = ["Fútbol", "Baloncesto", "Tenis", "Voleibol", "Pádel", "Rugby", "Otro"];
  const formats = ["Eliminatoria", "Liga", "Grupos + Eliminatoria"];

  function showNotif(msg) {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  }

  function createTournament() {
    if (!form.name.trim() || teams.length < 2) return showNotif("Añade un nombre y al menos 2 equipos");
    const bracket = generateBracket(teams);
    const t = {
      id: Date.now(),
      ...form,
      teams: [...teams],
      bracket,
      phase: "Grupos",
      status: "En curso",
      createdAt: new Date().toLocaleDateString("es-ES"),
      standings: teams.map(t => ({ name: t, pts: 0, gf: 0, gc: 0, pj: 0 })),
    };
    setTournaments(prev => [t, ...prev]);
    setActiveTournament(t);
    setView("tournament");
    setTeams([]);
    setForm({ name: "", sport: "Fútbol", format: "Eliminatoria" });
    showNotif("¡Torneo creado con éxito!");
  }

  function addTeam() {
    const t = teamInput.trim();
    if (!t || teams.includes(t)) return;
    setTeams(prev => [...prev, t]);
    setTeamInput("");
  }

  function removeTeam(t) {
    setTeams(prev => prev.filter(x => x !== t));
  }

  function openTournament(t) {
    setActiveTournament(t);
    setView("tournament");
  }

  function deleteTournament(id) {
    setTournaments(prev => prev.filter(t => t.id !== id));
    if (activeTournament?.id === id) {
      setActiveTournament(null);
      setView("home");
    }
    showNotif("Torneo eliminado");
  }

  function setMatchScore(idx, field, val) {
    const key = `${activeTournament.id}-${idx}-${field}`;
    setScores(prev => ({ ...prev, [key]: val }));
  }

  function getScore(idx, field) {
    return scores[`${activeTournament.id}-${idx}-${field}`] ?? "";
  }

  function confirmScore(idx) {
    const a = parseInt(getScore(idx, "a"));
    const b = parseInt(getScore(idx, "b"));
    if (isNaN(a) || isNaN(b)) return showNotif("Introduce ambos marcadores");
    const updated = tournaments.map(t => {
      if (t.id !== activeTournament.id) return t;
      const newBracket = t.bracket.map((m, i) => {
        if (i !== idx) return m;
        return { ...m, scoreA: a, scoreB: b, winner: a > b ? m.teamA : b > a ? m.teamB : "Empate" };
      });
      return { ...t, bracket: newBracket };
    });
    setTournaments(updated);
    setActiveTournament(updated.find(t => t.id === activeTournament.id));
    showNotif("Resultado guardado ✓");
  }

  const statusColor = { "En curso": "#4ade80", "Finalizado": "#facc15", "Pendiente": "#94a3b8" };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      color: "#e8e0d4",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background texture */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        background: `
          radial-gradient(ellipse 80% 60% at 10% 20%, rgba(212,160,60,0.07) 0%, transparent 60%),
          radial-gradient(ellipse 60% 80% at 90% 80%, rgba(180,60,60,0.06) 0%, transparent 60%),
          repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.015) 40px, rgba(255,255,255,0.015) 41px),
          repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.015) 40px, rgba(255,255,255,0.015) 41px)
        `,
        pointerEvents: "none",
      }} />

      {/* Notification */}
      {notification && (
        <div style={{
          position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)",
          background: "#d4a03c", color: "#0a0a0f", padding: "10px 24px",
          borderRadius: 2, fontWeight: 700, letterSpacing: 1, zIndex: 1000,
          fontFamily: "'Georgia', serif", fontSize: 13, boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          animation: "fadeIn 0.2s ease",
        }}>
          {notification}
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform: translateX(-50%) translateY(-8px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
        @keyframes slideUp { from { opacity:0; transform: translateY(16px); } to { opacity:1; transform: translateY(0); } }
        .card { animation: slideUp 0.35s ease; }
        input, select { background: rgba(255,255,255,0.05) !important; border: 1px solid rgba(212,160,60,0.3) !important; color: #e8e0d4 !important; }
        input:focus, select:focus { outline: none !important; border-color: #d4a03c !important; }
        input::placeholder { color: rgba(232,224,212,0.3) !important; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(212,160,60,0.3); border-radius: 2px; }
      `}</style>

      {/* Header */}
      <header style={{
        position: "relative", zIndex: 10,
        borderBottom: "1px solid rgba(212,160,60,0.2)",
        padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 64,
        background: "rgba(10,10,15,0.8)", backdropFilter: "blur(12px)",
      }}>
        <div
          onClick={() => setView("home")}
          style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
        >
          <div style={{
            width: 32, height: 32, background: "#d4a03c",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 900, color: "#0a0a0f",
          }}>⚔</div>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#d4a03c" }}>
            TournamentOS
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["home", "new"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "6px 18px", border: "1px solid",
              borderColor: view === v ? "#d4a03c" : "rgba(212,160,60,0.25)",
              background: view === v ? "rgba(212,160,60,0.12)" : "transparent",
              color: view === v ? "#d4a03c" : "#9a9080",
              cursor: "pointer", fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
              fontFamily: "'Georgia', serif",
            }}>
              {v === "home" ? "Torneos" : "Nuevo +"}
            </button>
          ))}
        </div>
      </header>

      <main style={{ position: "relative", zIndex: 5, padding: "40px 32px", maxWidth: 960, margin: "0 auto" }}>

        {/* HOME */}
        {view === "home" && (
          <div className="card">
            <div style={{ marginBottom: 40 }}>
              <p style={{ fontSize: 11, letterSpacing: 4, textTransform: "uppercase", color: "#d4a03c", marginBottom: 8 }}>Panel de control</p>
              <h1 style={{ fontSize: 36, fontWeight: 700, margin: 0, lineHeight: 1.1 }}>Tus Torneos</h1>
            </div>

            {tournaments.length === 0 ? (
              <div style={{
                border: "1px dashed rgba(212,160,60,0.25)", padding: "60px 32px",
                textAlign: "center", borderRadius: 2,
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>⚔</div>
                <p style={{ color: "#9a9080", marginBottom: 20 }}>No hay torneos todavía. ¡Crea el primero!</p>
                <button onClick={() => setView("new")} style={{
                  padding: "10px 28px", background: "#d4a03c", color: "#0a0a0f",
                  border: "none", cursor: "pointer", letterSpacing: 2, textTransform: "uppercase",
                  fontSize: 12, fontWeight: 700, fontFamily: "'Georgia', serif",
                }}>
                  Crear Torneo
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
                {tournaments.map(t => (
                  <div key={t.id} onClick={() => openTournament(t)} style={{
                    border: "1px solid rgba(212,160,60,0.2)",
                    padding: 24, cursor: "pointer",
                    background: "rgba(255,255,255,0.02)",
                    transition: "all 0.2s",
                    borderRadius: 2,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(212,160,60,0.6)"; e.currentTarget.style.background = "rgba(212,160,60,0.05)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(212,160,60,0.2)"; e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
                      <span style={{ fontSize: 20 }}>
                        {t.sport === "Fútbol" ? "⚽" : t.sport === "Baloncesto" ? "🏀" : t.sport === "Tenis" ? "🎾" : t.sport === "Voleibol" ? "🏐" : t.sport === "Pádel" ? "🏓" : t.sport === "Rugby" ? "🏉" : "🏆"}
                      </span>
                      <span style={{
                        fontSize: 9, letterSpacing: 2, padding: "3px 8px",
                        background: `${statusColor[t.status]}22`,
                        color: statusColor[t.status], border: `1px solid ${statusColor[t.status]}44`,
                        textTransform: "uppercase",
                      }}>{t.status}</span>
                    </div>
                    <h3 style={{ margin: "0 0 6px", fontSize: 18 }}>{t.name}</h3>
                    <p style={{ margin: "0 0 12px", color: "#9a9080", fontSize: 12 }}>{t.sport} · {t.format}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#6a6060" }}>{t.teams.length} equipos · {t.createdAt}</span>
                      <button onClick={(e) => { e.stopPropagation(); deleteTournament(t.id); }} style={{
                        background: "none", border: "none", color: "#6a4040", cursor: "pointer", fontSize: 14,
                        padding: "2px 6px",
                      }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* NEW TOURNAMENT */}
        {view === "new" && (
          <div className="card" style={{ maxWidth: 560 }}>
            <p style={{ fontSize: 11, letterSpacing: 4, textTransform: "uppercase", color: "#d4a03c", marginBottom: 8 }}>Configuración</p>
            <h1 style={{ fontSize: 32, fontWeight: 700, margin: "0 0 32px" }}>Nuevo Torneo</h1>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Name */}
              <div>
                <label style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#9a9080", display: "block", marginBottom: 8 }}>Nombre del torneo</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Copa de Campeones 2026"
                  style={{ width: "100%", padding: "10px 14px", fontSize: 14, boxSizing: "border-box", borderRadius: 2 }}
                />
              </div>

              {/* Sport & Format */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#9a9080", display: "block", marginBottom: 8 }}>Deporte</label>
                  <select value={form.sport} onChange={e => setForm(p => ({ ...p, sport: e.target.value }))}
                    style={{ width: "100%", padding: "10px 14px", fontSize: 14, borderRadius: 2 }}>
                    {sports.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#9a9080", display: "block", marginBottom: 8 }}>Formato</label>
                  <select value={form.format} onChange={e => setForm(p => ({ ...p, format: e.target.value }))}
                    style={{ width: "100%", padding: "10px 14px", fontSize: 14, borderRadius: 2 }}>
                    {formats.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              {/* Teams */}
              <div>
                <label style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#9a9080", display: "block", marginBottom: 8 }}>
                  Equipos <span style={{ color: "#d4a03c" }}>({teams.length})</span>
                </label>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input value={teamInput} onChange={e => setTeamInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addTeam()}
                    placeholder="Nombre del equipo..."
                    style={{ flex: 1, padding: "10px 14px", fontSize: 14, borderRadius: 2 }}
                  />
                  <button onClick={addTeam} style={{
                    padding: "10px 20px", background: "rgba(212,160,60,0.15)", border: "1px solid rgba(212,160,60,0.4)",
                    color: "#d4a03c", cursor: "pointer", fontSize: 18, borderRadius: 2,
                  }}>+</button>
                </div>
                {teams.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {teams.map(t => (
                      <span key={t} style={{
                        padding: "4px 12px", background: "rgba(212,160,60,0.1)",
                        border: "1px solid rgba(212,160,60,0.3)", fontSize: 12,
                        display: "flex", alignItems: "center", gap: 8, borderRadius: 2,
                      }}>
                        {t}
                        <span onClick={() => removeTeam(t)} style={{ cursor: "pointer", color: "#9a5050", fontSize: 10 }}>✕</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={createTournament} style={{
                padding: "14px", background: "#d4a03c", color: "#0a0a0f",
                border: "none", cursor: "pointer", letterSpacing: 3, textTransform: "uppercase",
                fontSize: 12, fontWeight: 700, marginTop: 8, fontFamily: "'Georgia', serif",
                borderRadius: 2,
              }}>
                Crear Torneo →
              </button>
            </div>
          </div>
        )}

        {/* TOURNAMENT VIEW */}
        {view === "tournament" && activeTournament && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 32 }}>
              <div>
                <p style={{ fontSize: 11, letterSpacing: 4, textTransform: "uppercase", color: "#d4a03c", marginBottom: 6 }}>
                  {activeTournament.sport} · {activeTournament.format}
                </p>
                <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0 }}>{activeTournament.name}</h1>
                <p style={{ color: "#6a6060", fontSize: 12, margin: "6px 0 0" }}>
                  {activeTournament.teams.length} equipos · Creado {activeTournament.createdAt}
                </p>
              </div>
              <span style={{
                fontSize: 10, letterSpacing: 2, padding: "5px 12px",
                background: `${statusColor[activeTournament.status]}22`,
                color: statusColor[activeTournament.status],
                border: `1px solid ${statusColor[activeTournament.status]}44`,
                textTransform: "uppercase", alignSelf: "center",
              }}>{activeTournament.status}</span>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 32, borderBottom: "1px solid rgba(212,160,60,0.15)" }}>
              {["bracket", "equipos"].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding: "10px 24px", background: "none",
                  border: "none", borderBottom: activeTab === tab ? "2px solid #d4a03c" : "2px solid transparent",
                  color: activeTab === tab ? "#d4a03c" : "#9a9080",
                  cursor: "pointer", fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
                  fontFamily: "'Georgia', serif", marginBottom: -1,
                }}>
                  {tab === "bracket" ? "Partidos" : "Equipos"}
                </button>
              ))}
            </div>

            {/* Bracket tab */}
            {activeTab === "bracket" && (
              <div>
                <p style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#6a6060", marginBottom: 20 }}>
                  {activeTournament.bracket.length} partidos generados
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {activeTournament.bracket.map((match, idx) => (
                    <div key={idx} style={{
                      border: "1px solid",
                      borderColor: match.winner ? "rgba(212,160,60,0.4)" : "rgba(255,255,255,0.08)",
                      padding: "16px 20px",
                      background: match.winner ? "rgba(212,160,60,0.04)" : "rgba(255,255,255,0.015)",
                      borderRadius: 2,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "#6a6060", letterSpacing: 2, minWidth: 60 }}>
                          Partido {idx + 1}
                        </span>

                        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 200 }}>
                          <span style={{
                            fontWeight: match.winner === match.teamA ? 700 : 400,
                            color: match.winner === match.teamA ? "#d4a03c" : "#e8e0d4",
                            minWidth: 100,
                          }}>{match.teamA}</span>
                          <span style={{ color: "#6a6060", fontSize: 12 }}>vs</span>
                          <span style={{
                            fontWeight: match.winner === match.teamB ? 700 : 400,
                            color: match.winner === match.teamB ? "#d4a03c" : "#e8e0d4",
                            minWidth: 100,
                          }}>{match.teamB}</span>
                        </div>

                        {match.winner ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 4, color: "#d4a03c" }}>
                              {match.scoreA} — {match.scoreB}
                            </span>
                            <span style={{ fontSize: 10, color: "#9a9080", letterSpacing: 1 }}>✓ Finalizado</span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="number" min={0} value={getScore(idx, "a")}
                              onChange={e => setMatchScore(idx, "a", e.target.value)}
                              placeholder="0"
                              style={{ width: 50, padding: "6px 10px", fontSize: 14, textAlign: "center", borderRadius: 2 }}
                            />
                            <span style={{ color: "#6a6060" }}>—</span>
                            <input type="number" min={0} value={getScore(idx, "b")}
                              onChange={e => setMatchScore(idx, "b", e.target.value)}
                              placeholder="0"
                              style={{ width: 50, padding: "6px 10px", fontSize: 14, textAlign: "center", borderRadius: 2 }}
                            />
                            <button onClick={() => confirmScore(idx)} style={{
                              padding: "6px 14px", background: "rgba(212,160,60,0.15)",
                              border: "1px solid rgba(212,160,60,0.35)", color: "#d4a03c",
                              cursor: "pointer", fontSize: 10, letterSpacing: 1,
                              textTransform: "uppercase", fontFamily: "'Georgia', serif", borderRadius: 2,
                            }}>OK</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Progress */}
                {activeTournament.bracket.length > 0 && (() => {
                  const done = activeTournament.bracket.filter(m => m.winner).length;
                  const pct = Math.round((done / activeTournament.bracket.length) * 100);
                  return (
                    <div style={{ marginTop: 32, padding: "20px", border: "1px solid rgba(212,160,60,0.15)", borderRadius: 2 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                        <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#9a9080" }}>Progreso del torneo</span>
                        <span style={{ color: "#d4a03c", fontWeight: 700 }}>{pct}%</span>
                      </div>
                      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "#d4a03c", borderRadius: 2, transition: "width 0.4s ease" }} />
                      </div>
                      <p style={{ fontSize: 11, color: "#6a6060", marginTop: 8 }}>{done} de {activeTournament.bracket.length} partidos completados</p>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Equipos tab */}
            {activeTab === "equipos" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                  {activeTournament.teams.map((team, i) => {
                    const wins = activeTournament.bracket.filter(m => m.winner === team).length;
                    const played = activeTournament.bracket.filter(m => (m.teamA === team || m.teamB === team) && m.winner).length;
                    return (
                      <div key={team} style={{
                        border: "1px solid rgba(212,160,60,0.15)",
                        padding: "16px", borderRadius: 2,
                        background: "rgba(255,255,255,0.015)",
                        textAlign: "center",
                      }}>
                        <div style={{
                          width: 40, height: 40, background: `hsl(${i * 47 % 360}, 40%, 30%)`,
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                          margin: "0 auto 12px", fontSize: 16, fontWeight: 700,
                        }}>
                          {team[0].toUpperCase()}
                        </div>
                        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>{team}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "#9a9080" }}>
                          {wins}V · {played - wins}D · {played} PJ
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
