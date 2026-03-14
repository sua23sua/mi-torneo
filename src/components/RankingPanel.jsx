import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { C, S, TeamLogo, EloBar, eloLabel, eloTierIcon } from "../shared.jsx";

export default function RankingPanel({ myTeamId }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("elo");

  useEffect(() => {
    const q = query(collection(db, "teams"), orderBy("elo", "desc"));
    return onSnapshot(q, snap => {
      setTeams(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => (t.stats?.pj || 0) > 0 || (t.elo || 1000) !== 1000));
      setLoading(false);
    });
  }, []);

  const sorted = [...teams].sort((a, b) => {
    if (sortBy === "elo") return (b.elo ?? 1000) - (a.elo ?? 1000);
    if (sortBy === "titulos") return (b.stats?.titulos ?? 0) - (a.stats?.titulos ?? 0) || (b.elo ?? 1000) - (a.elo ?? 1000);
    if (sortBy === "pg") return (b.stats?.pg ?? 0) - (a.stats?.pg ?? 0) || (b.elo ?? 1000) - (a.elo ?? 1000);
    return 0;
  });

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: C.faint }}>Cargando ranking...</div>;
  if (sorted.length === 0) return (
    <div style={{ ...S.card, textAlign: "center", padding: 48 }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
      <p style={{ color: C.muted, marginBottom: 4 }}>El ranking se mostrará aquí</p>
      <p style={{ color: C.faint, fontSize: 13 }}>una vez se hayan jugado partidos</p>
    </div>
  );

  return (
    <div>
      {/* Sort buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {[["elo", "🏆 ELO"], ["titulos", "🎖 Títulos"], ["pg", "⚽ Victorias"]].map(([id, label]) => (
          <button key={id} onClick={() => setSortBy(id)} style={{ ...S.btnSm, flexShrink: 0, borderColor: sortBy === id ? C.purple : undefined, color: sortBy === id ? C.purple : undefined, background: sortBy === id ? "rgba(167,139,250,0.08)" : undefined }}>{label}</button>
        ))}
      </div>

      {/* Podium — top 3 */}
      {sorted.length >= 2 && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 20, padding: "16px 0 0" }}>
          {[sorted[1], sorted[0], sorted[2]].filter(Boolean).map((t, podIdx) => {
            const realIdx = podIdx === 0 ? 1 : podIdx === 1 ? 0 : 2;
            const heights = [56, 72, 44];
            const podColors = ["#94a3b8", C.gold, "#b87333"];
            const podLabels = ["🥈 2º", "👑 1º", "🥉 3º"];
            return (
              <div key={t.id} style={{ flex: realIdx === 0 ? 1.1 : 1, textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                  <TeamLogo name={t.name} logoUrl={t.logoUrl} size={heights[realIdx]} />
                </div>
                <div style={{ background: `${podColors[realIdx]}14`, border: `1px solid ${podColors[realIdx]}30`, borderRadius: "10px 10px 0 0", padding: `${12 + realIdx * 4}px 6px ${14 + realIdx * 4}px` }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: podColors[realIdx], fontWeight: 700 }}>{podLabels[realIdx]}</p>
                  <p style={{ margin: "0 0 3px", fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: podColors[realIdx] }}>{t.elo ?? 1000}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full table */}
      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 52px 36px 36px 36px 36px 44px", gap: 4, padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {["#", "Equipo", "ELO", "PJ", "V", "E", "D", "DG"].map(h => <span key={h} style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: C.muted, textAlign: h === "Equipo" ? "left" : "center" }}>{h}</span>)}
        </div>
        {sorted.map((t, idx) => {
          const elo = t.elo ?? 1000;
          const stats = t.stats || { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, gd: 0, titulos: 0 };
          const { color } = eloLabel(elo);
          const isMe = t.id === myTeamId;
          const change = t.lastEloChange;
          return (
            <div key={t.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr 52px 36px 36px 36px 36px 44px", gap: 4, padding: "11px 12px", borderBottom: idx < sorted.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none", background: isMe ? "rgba(232,184,75,0.05)" : idx < 3 ? `rgba(${idx === 0 ? "232,184,75" : idx === 1 ? "148,163,184" : "184,115,51"},0.03)` : "transparent", alignItems: "center" }}>
              <span style={{ fontSize: idx < 3 ? 15 : 12, color: idx === 0 ? C.gold : idx === 1 ? "#94a3b8" : idx === 2 ? "#b87333" : C.faint, textAlign: "center" }}>{idx === 0 ? "👑" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <TeamLogo name={t.name} logoUrl={t.logoUrl} size={28} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: isMe ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isMe ? C.gold : C.text }}>{t.name}</span>
                    {isMe && <span style={{ fontSize: 9, color: C.gold }}>◀</span>}
                  </div>
                  <EloBar elo={elo} />
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color }}>{elo}</span>
                {change != null && <div style={{ fontSize: 9, color: change > 0 ? C.green : change < 0 ? C.red : C.faint }}>{change > 0 ? `+${change}` : change}</div>}
              </div>
              <span style={{ fontSize: 12, textAlign: "center", color: C.muted }}>{stats.pj}</span>
              <span style={{ fontSize: 12, textAlign: "center", color: C.green, fontWeight: 600 }}>{stats.pg}</span>
              <span style={{ fontSize: 12, textAlign: "center", color: C.gold }}>{stats.pe}</span>
              <span style={{ fontSize: 12, textAlign: "center", color: C.red }}>{stats.pp}</span>
              <span style={{ fontSize: 12, textAlign: "center", color: (stats.gd ?? 0) >= 0 ? C.green : C.red }}>{(stats.gd ?? 0) > 0 ? "+" : ""}{stats.gd ?? 0}</span>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: C.faint, textAlign: "center", marginTop: 10 }}>ELO con K=32 · Solo partidos validados cuentan</p>
    </div>
  );
}
