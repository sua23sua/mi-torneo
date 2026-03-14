import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { C, S, TeamLogo, EloBar, eloLabel } from "../shared.jsx";

const TIER_ICONS = { Élite: "💎", Oro: "🥇", Plata: "🥈", Bronce: "🥉", Hierro: "⚙️" };

export default function RankingPanel({ logoMap, inscriptions }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("elo"); // elo | titulos | pg

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("elo", "desc"), limit(100));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.stats?.pj > 0 || u.elo !== 1000); // only show active players
      setPlayers(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Build a map teamName -> logoUrl from inscriptions
  const teamLogoMap = { ...logoMap };
  inscriptions.forEach(i => { if (i.teamName && i.logoUrl) teamLogoMap[i.teamName] = i.logoUrl; });

  // Sort based on filter
  const sorted = [...players].sort((a, b) => {
    if (filter === "elo") return (b.elo ?? 1000) - (a.elo ?? 1000);
    if (filter === "titulos") return ((b.stats?.titulos ?? 0) - (a.stats?.titulos ?? 0)) || ((b.elo ?? 1000) - (a.elo ?? 1000));
    if (filter === "pg") return ((b.stats?.pg ?? 0) - (a.stats?.pg ?? 0)) || ((b.elo ?? 1000) - (a.elo ?? 1000));
    return 0;
  });

  const podium = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.faint }}>Cargando ranking...</div>;

  if (sorted.length === 0) {
    return (
      <div style={{ ...S.card, textAlign: "center", padding: 48 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
        <p style={{ color: C.muted, marginBottom: 4 }}>El ranking estará disponible</p>
        <p style={{ color: C.faint, fontSize: 13 }}>una vez se hayan jugado partidos</p>
      </div>
    );
  }

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {[["elo", "🏆 ELO"], ["titulos", "🎖 Títulos"], ["pg", "⚽ Victorias"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={{ ...S.btnSm, flexShrink: 0, borderColor: filter === id ? C.purple : undefined, color: filter === id ? C.purple : undefined, background: filter === id ? "rgba(167,139,250,0.08)" : undefined }}>{label}</button>
        ))}
      </div>

      {/* Podium */}
      {filter === "elo" && podium.length >= 2 && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 20, padding: "20px 8px 0" }}>
          {/* 2nd */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <TeamLogo name={podium[1]?.teamName || podium[1]?.name} logoUrl={teamLogoMap[podium[1]?.teamName]} size={44} />
            <div style={{ background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: "10px 10px 0 0", padding: "12px 8px 16px", marginTop: 8 }}>
              <p style={{ margin: "0 0 2px", fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>🥈 2º</p>
              <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{podium[1]?.teamName || podium[1]?.name}</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#94a3b8" }}>{podium[1]?.elo ?? 1000}</p>
            </div>
          </div>
          {/* 1st */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <TeamLogo name={podium[0]?.teamName || podium[0]?.name} logoUrl={teamLogoMap[podium[0]?.teamName]} size={56} />
            <div style={{ background: "rgba(232,184,75,0.1)", border: "1px solid rgba(232,184,75,0.3)", borderRadius: "10px 10px 0 0", padding: "16px 8px 20px", marginTop: 8 }}>
              <p style={{ margin: "0 0 2px", fontSize: 12, color: C.gold, fontWeight: 700 }}>👑 1º</p>
              <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{podium[0]?.teamName || podium[0]?.name}</p>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.gold }}>{podium[0]?.elo ?? 1000}</p>
            </div>
          </div>
          {/* 3rd */}
          {podium[2] && (
            <div style={{ flex: 1, textAlign: "center" }}>
              <TeamLogo name={podium[2]?.teamName || podium[2]?.name} logoUrl={teamLogoMap[podium[2]?.teamName]} size={38} />
              <div style={{ background: "rgba(184,115,51,0.1)", border: "1px solid rgba(184,115,51,0.2)", borderRadius: "10px 10px 0 0", padding: "10px 8px 14px", marginTop: 8 }}>
                <p style={{ margin: "0 0 2px", fontSize: 10, color: "#b87333", fontWeight: 700 }}>🥉 3º</p>
                <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{podium[2]?.teamName || podium[2]?.name}</p>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#b87333" }}>{podium[2]?.elo ?? 1000}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full table */}
      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        {sorted.map((p, idx) => {
          const teamName = p.teamName || p.name;
          const elo = p.elo ?? 1000;
          const stats = p.stats || { pj: 0, pg: 0, pe: 0, pp: 0, titulos: 0 };
          const { label, color } = eloLabel(elo);
          const tierIcon = TIER_ICONS[label] || "⚙️";
          const eloChange = p.lastEloChange;
          const isTop3 = idx < 3;

          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: idx < sorted.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", background: isTop3 ? `rgba(${idx === 0 ? "232,184,75" : idx === 1 ? "148,163,184" : "184,115,51"},0.04)` : "transparent" }}>
              {/* Position */}
              <div style={{ minWidth: 28, textAlign: "center" }}>
                <span style={{ fontSize: isTop3 ? 16 : 12, color: isTop3 ? C.gold : C.faint }}>
                  {idx === 0 ? "👑" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                </span>
              </div>

              {/* Logo */}
              <TeamLogo name={teamName} logoUrl={teamLogoMap[teamName]} size={36} />

              {/* Name + ELO bar */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{teamName || p.email}</span>
                  <span style={{ fontSize: 10 }}>{tierIcon}</span>
                  {eloChange != null && (
                    <span style={{ fontSize: 10, color: eloChange > 0 ? C.green : C.red, flexShrink: 0 }}>
                      {eloChange > 0 ? `+${eloChange}` : eloChange}
                    </span>
                  )}
                </div>
                <EloBar elo={elo} />
              </div>

              {/* Stats */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {filter === "elo" && (
                  <>
                    <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color }}>ELO {elo}</p>
                    <p style={{ margin: 0, fontSize: 10, color: C.faint }}>{stats.pj}PJ · {stats.pg}V · {stats.pe}E · {stats.pp}D</p>
                  </>
                )}
                {filter === "titulos" && (
                  <>
                    <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: C.gold }}>{"🏆".repeat(Math.min(stats.titulos, 4))} {stats.titulos}</p>
                    <p style={{ margin: 0, fontSize: 10, color: C.faint }}>ELO {elo}</p>
                  </>
                )}
                {filter === "pg" && (
                  <>
                    <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: C.green }}>{stats.pg} victorias</p>
                    <p style={{ margin: 0, fontSize: 10, color: C.faint }}>{stats.pj}PJ · ELO {elo}</p>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11, color: C.faint, textAlign: "center", marginTop: 12 }}>
        ELO calculado con K=32 · Solo partidos validados cuentan
      </p>
    </div>
  );
}
