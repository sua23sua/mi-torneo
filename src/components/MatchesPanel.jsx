import { useState } from "react";
import { db } from "../firebase";
import { doc, updateDoc } from "firebase/firestore";
import { C, S, TeamLogo, matchStatusColor, getRoundName, applyGroupResult, computeMatchStatus, formatDatetime } from "../shared.jsx";

// ── helpers ──────────────────────────────────────────────────────

export function collectMatchdays(tournaments, inscriptions) {
  /*
    Returns an array of matchday-groups:
    [
      {
        key: "t_<id>_g_<gi>_d_<day>",
        tournamentId, tournamentName, groupName,
        matchdayNum,         // 1-based
        datetime,            // ISO string or null (from tournament.matchdaySchedule)
        phase: "Grupos" | round name,
        type: "group" | "elim",
        gi, ri (for elim),
        matches: [ { ...match, _mi } ]
      }
    ]
    sorted by: tournament, then matchdayNum ascending.
  */
  const result = [];

  tournaments.forEach(t => {
    if (t.status !== "En curso" && t.status !== "Abierto") return;
    const schedule = t.matchdaySchedule || {}; // key: "g_<gi>_d_<day>" or "elim_<ri>" → ISO

    // Groups
    t.groups?.forEach((g, gi) => {
      // Group matches by matchday number
      const byDay = {};
      (g.matches || []).forEach((m, mi) => {
        const day = m.matchday || 1;
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push({ ...m, _mi: mi });
      });
      Object.entries(byDay).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([day, matches]) => {
        const schedKey = `g_${gi}_d_${day}`;
        result.push({
          key: `t_${t.id}_${schedKey}`,
          tournamentId: t.id, tournamentName: t.name,
          groupName: g.name, matchdayNum: Number(day),
          datetime: schedule[schedKey] || null,
          phase: `Grupo ${g.name}`, type: "group",
          gi, schedKey, matches,
        });
      });
    });

    // Elimination rounds
    t.eliminationRounds?.forEach((round, ri) => {
      const schedKey = `elim_${ri}`;
      const roundName = getRoundName(t.eliminationRounds.length, ri);
      result.push({
        key: `t_${t.id}_${schedKey}`,
        tournamentId: t.id, tournamentName: t.name,
        groupName: null, matchdayNum: null,
        datetime: schedule[schedKey] || null,
        phase: roundName, type: "elim",
        ri, schedKey,
        matches: (round.matches || []).map((m, mi) => ({ ...m, _mi: mi })),
      });
    });
  });

  return result;
}

// ── Rival contact popup ───────────────────────────────────────────
function RivalContact({ name, inscriptions, logoMap, onClose }) {
  const insc = inscriptions.find(i => i.teamName === name);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div style={{ ...S.card, maxWidth: 320, width: "100%", padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <TeamLogo name={name} logoUrl={logoMap[name]} size={52} />
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>{name}</h3>
            {insc?.userName && <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>{insc.userName}</p>}
          </div>
        </div>

        {insc?.phone && (
          <a
            href={`https://wa.me/${insc.phone.replace(/\D/g, "")}`}
            target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.25)", borderRadius: 10, marginBottom: 10, textDecoration: "none", color: C.text }}
          >
            <span style={{ fontSize: 22, flexShrink: 0 }}>💬</span>
            <div>
              <p style={{ margin: "0 0 1px", fontSize: 13, fontWeight: 600, color: "#25d366" }}>WhatsApp</p>
              <p style={{ margin: 0, fontSize: 12, color: C.muted }}>{insc.phone}</p>
            </div>
            <span style={{ marginLeft: "auto", color: C.faint, fontSize: 16 }}>→</span>
          </a>
        )}

        {insc?.twitter && (
          <a
            href={`https://x.com/${insc.twitter.replace("@", "")}`}
            target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, marginBottom: 10, textDecoration: "none", color: C.text }}
          >
            <span style={{ fontSize: 22, flexShrink: 0, fontWeight: 700, color: "#fff" }}>𝕏</span>
            <div>
              <p style={{ margin: "0 0 1px", fontSize: 13, fontWeight: 600, color: "#fff" }}>X / Twitter</p>
              <p style={{ margin: 0, fontSize: 12, color: C.muted }}>{insc.twitter}</p>
            </div>
            <span style={{ marginLeft: "auto", color: C.faint, fontSize: 16 }}>→</span>
          </a>
        )}

        {insc?.managerId && (
          <div style={{ padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, marginBottom: 10 }}>
            <p style={{ margin: "0 0 1px", fontSize: 11, color: C.muted, letterSpacing: 1 }}>ID MANAGER</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{insc.managerId}</p>
          </div>
        )}

        {!insc?.phone && !insc?.twitter && (
          <p style={{ color: C.faint, fontSize: 13, textAlign: "center" }}>Sin datos de contacto registrados.</p>
        )}

        <button style={{ ...S.btnSm, width: "100%", marginTop: 8, textAlign: "center" }} onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

// ── Match status helpers ──────────────────────────────────────────
const statusLabel = { pendiente: "Sin jugar", parcial: "Esperando confirmación", conflicto: "Conflicto", validado: "Validado" };
const statusIcon = { pendiente: "⏳", parcial: "🕐", conflicto: "⚠️", validado: "✓" };

// ── Main component ────────────────────────────────────────────────
export default function MatchesPanel({ tournaments, inscriptions, currentUser, isAdmin, logoMap }) {
  const [filter, setFilter] = useState("todos");
  const [expandedDays, setExpandedDays] = useState({});
  const [reportMatch, setReportMatch] = useState(null);
  const [reportDay, setReportDay] = useState(null);
  const [rScoreA, setRScoreA] = useState("");
  const [rScoreB, setRScoreB] = useState("");
  const [adminEdit, setAdminEdit] = useState(null);
  const [adminEditDay, setAdminEditDay] = useState(null);
  const [aScoreA, setAScoreA] = useState("");
  const [aScoreB, setAScoreB] = useState("");
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState(null);
  const [rivalPopup, setRivalPopup] = useState(null);

  function showNotif(msg, color = C.blue) { setNotif({ msg, color }); setTimeout(() => setNotif(null), 3500); }
  function toggleDay(key) { setExpandedDays(p => ({ ...p, [key]: !p[key] })); }

  const myTeamNames = new Set(
    inscriptions.filter(i => i.userId === currentUser?.uid && i.status === "aprobada").map(i => i.teamName)
  );

  const allDays = collectMatchdays(tournaments, inscriptions);

  // Filter
  const filteredDays = allDays.map(day => {
    let matches = day.matches;
    if (filter === "mis") matches = matches.filter(m => myTeamNames.has(m.teamA) || myTeamNames.has(m.teamB));
    if (filter === "pendiente") matches = matches.filter(m => (m.matchStatus || "pendiente") === "pendiente" || m.matchStatus === "parcial");
    if (filter === "conflicto") matches = matches.filter(m => m.matchStatus === "conflicto");
    if (filter === "validado") matches = matches.filter(m => m.matchStatus === "validado");
    return { ...day, matches };
  }).filter(day => day.matches.length > 0);

  // ── Persist match update to Firestore ──────────────────────────
  async function saveMatchUpdate(day, matchWithMi, updates) {
    const t = tournaments.find(t => t.id === day.tournamentId);
    if (!t) return;

    if (day.type === "group") {
      const newGroups = t.groups.map((g, gi) => {
        if (gi !== day.gi) return g;
        const newMatches = g.matches.map((m, mi) => mi !== matchWithMi._mi ? m : { ...m, ...updates });
        let standings = g.standings;
        if (updates.matchStatus === "validado") {
          standings = g.teams.map(t => ({ name: t, pts: 0, gf: 0, gc: 0, pj: 0, gd: 0 }));
          newMatches.forEach(m => { if (m.played) standings = applyGroupResult(standings, m.teamA, m.teamB, m.scoreA, m.scoreB); });
        }
        return { ...g, matches: newMatches, standings };
      });
      await updateDoc(doc(db, "tournaments", t.id), { groups: newGroups });
    } else {
      // elim
      const { buildEliminationRound } = await import("../shared.jsx");
      const newRounds = t.eliminationRounds.map((r, ri) => {
        if (ri !== day.ri) return r;
        return { ...r, matches: r.matches.map((m, mi) => mi !== matchWithMi._mi ? m : { ...m, ...updates }) };
      });
      const round = newRounds[day.ri];
      const allDone = round.matches.every(m => m.matchStatus === "validado");
      let finalRounds = newRounds, winner = null;
      if (allDone) {
        const winners = round.matches.map(m => m.winner).filter(w => w && w !== "BYE");
        if (winners.length === 1) winner = winners[0];
        else if (winners.length > 1) finalRounds = [...newRounds, { round: newRounds.length + 1, matches: buildEliminationRound(winners) }];
      }
      await updateDoc(doc(db, "tournaments", t.id), {
        eliminationRounds: finalRounds,
        ...(winner ? { winner, status: "Finalizado" } : {}),
      });
    }
  }

  // ── User report ────────────────────────────────────────────────
  async function submitReport(day, match) {
    const sA = parseInt(rScoreA), sB = parseInt(rScoreB);
    if (isNaN(sA) || isNaN(sB)) return showNotif("Introduce ambos marcadores", C.red);
    setSaving(true);
    const side = myTeamNames.has(match.teamA) ? "A" : "B";
    const report = { scoreA: sA, scoreB: sB, userId: currentUser.uid, userName: currentUser.displayName || currentUser.email, at: new Date().toISOString() };
    const newStatus = isAdmin ? "validado" : computeMatchStatus(match, side, sA, sB);
    const updates = {
      ...(side === "A" || isAdmin ? { reportByA: report } : {}),
      ...(side === "B" ? { reportByB: report } : {}),
      ...(isAdmin ? { reportByB: report } : {}),
      matchStatus: newStatus,
      ...(newStatus === "validado" ? { scoreA: sA, scoreB: sB, played: true, winner: sA > sB ? match.teamA : sA < sB ? match.teamB : null } : {}),
    };
    await saveMatchUpdate(day, match, updates);
    setReportMatch(null); setReportDay(null); setRScoreA(""); setRScoreB("");
    if (newStatus === "validado") showNotif("Resultado validado ✓", C.green);
    else if (newStatus === "parcial") showNotif("Resultado enviado ✓ Esperando confirmación del rival", C.orange);
    else showNotif("⚠️ Resultados en conflicto. Un admin resolverá.", C.red);
    setSaving(false);
  }

  // ── Admin validate ─────────────────────────────────────────────
  async function adminValidate(day, match, forceSA, forceSB) {
    const sA = parseInt(forceSA ?? aScoreA), sB = parseInt(forceSB ?? aScoreB);
    if (isNaN(sA) || isNaN(sB)) return showNotif("Introduce ambos marcadores", C.red);
    setSaving(true);
    const report = { scoreA: sA, scoreB: sB, userId: currentUser.uid, userName: "Admin", at: new Date().toISOString() };
    await saveMatchUpdate(day, match, {
      reportByA: report, reportByB: report,
      matchStatus: "validado", scoreA: sA, scoreB: sB, played: true,
      winner: sA > sB ? match.teamA : sA < sB ? match.teamB : null,
    });
    setAdminEdit(null); setAdminEditDay(null); setAScoreA(""); setAScoreB("");
    showNotif("Resultado validado ✓", C.green);
    setSaving(false);
  }

  const FILTERS = [
    { id: "todos", label: "Todos" },
    { id: "mis", label: "Mis partidos" },
    { id: "pendiente", label: "Pendientes" },
    { id: "conflicto", label: "Conflictos" },
    { id: "validado", label: "Validados" },
  ];

  return (
    <div>
      {notif && (
        <div style={{ position: "fixed", top: 16, left: 16, right: 16, background: notif.color, color: notif.color === C.gold || notif.color === C.green ? "#07090f" : "#fff", padding: "13px 16px", zIndex: 9999, fontSize: 13, fontFamily: "'Georgia',serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", borderRadius: 10, textAlign: "center", fontWeight: 600 }}>{notif.msg}</div>
      )}

      {rivalPopup && (
        <RivalContact
          name={rivalPopup}
          inscriptions={inscriptions}
          logoMap={logoMap}
          onClose={() => setRivalPopup(null)}
        />
      )}

      {/* Report modal */}
      {reportMatch && reportDay && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ ...S.card, maxWidth: 380, width: "100%", padding: 24 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>Reportar resultado</h3>
            <p style={{ margin: "0 0 20px", color: C.muted, fontSize: 13 }}>{reportDay.tournamentName} · {reportDay.phase}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <TeamLogo name={reportMatch.teamA} logoUrl={logoMap[reportMatch.teamA]} size={40} />
                <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 600 }}>{reportMatch.teamA}</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" min={0} max={99} placeholder="0" value={rScoreA} onChange={e => setRScoreA(e.target.value)} style={{ ...S.numInput, width: 58, padding: 12, fontSize: 22 }} />
                <span style={{ color: C.faint, fontSize: 20 }}>–</span>
                <input type="number" min={0} max={99} placeholder="0" value={rScoreB} onChange={e => setRScoreB(e.target.value)} style={{ ...S.numInput, width: 58, padding: 12, fontSize: 22 }} />
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <TeamLogo name={reportMatch.teamB} logoUrl={logoMap[reportMatch.teamB]} size={40} />
                <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 600 }}>{reportMatch.teamB}</p>
              </div>
            </div>
            {(reportMatch.reportByA || reportMatch.reportByB) && (
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
                <p style={{ ...S.label, marginBottom: 6 }}>Reportes existentes</p>
                {reportMatch.reportByA && <p style={{ margin: "0 0 3px", fontSize: 12, color: C.muted }}><strong style={{ color: C.text }}>{reportMatch.teamA}</strong>: {reportMatch.reportByA.scoreA}–{reportMatch.reportByA.scoreB}</p>}
                {reportMatch.reportByB && <p style={{ margin: 0, fontSize: 12, color: C.muted }}><strong style={{ color: C.text }}>{reportMatch.teamB}</strong>: {reportMatch.reportByB.scoreA}–{reportMatch.reportByB.scoreB}</p>}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...S.btn(), flex: 1, opacity: saving ? 0.6 : 1 }} onClick={() => submitReport(reportDay, reportMatch)} disabled={saving}>
                {saving ? "Enviando..." : "Enviar →"}
              </button>
              <button style={S.btnSm} onClick={() => { setReportMatch(null); setReportDay(null); setRScoreA(""); setRScoreB(""); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin edit modal */}
      {adminEdit && adminEditDay && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ ...S.card, maxWidth: 380, width: "100%", padding: 24 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700 }}>Validar resultado</h3>
            <p style={{ margin: "0 0 16px", color: C.muted, fontSize: 13 }}>{adminEditDay.tournamentName} · {adminEditDay.phase}</p>

            {(adminEdit.reportByA || adminEdit.reportByB) && (
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
                <p style={{ ...S.label, marginBottom: 8 }}>Reportes recibidos</p>
                {adminEdit.reportByA && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <p style={{ margin: 0, fontSize: 12, color: C.muted }}><strong style={{ color: C.text }}>{adminEdit.teamA}</strong>: {adminEdit.reportByA.scoreA}–{adminEdit.reportByA.scoreB}</p>
                    <button style={{ ...S.btnInline(C.green), padding: "6px 12px", fontSize: 10 }} onClick={() => adminValidate(adminEditDay, adminEdit, adminEdit.reportByA.scoreA, adminEdit.reportByA.scoreB)}>✓ Aceptar</button>
                  </div>
                )}
                {adminEdit.reportByB && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ margin: 0, fontSize: 12, color: C.muted }}><strong style={{ color: C.text }}>{adminEdit.teamB}</strong>: {adminEdit.reportByB.scoreA}–{adminEdit.reportByB.scoreB}</p>
                    <button style={{ ...S.btnInline(C.green), padding: "6px 12px", fontSize: 10 }} onClick={() => adminValidate(adminEditDay, adminEdit, adminEdit.reportByB.scoreA, adminEdit.reportByB.scoreB)}>✓ Aceptar</button>
                  </div>
                )}
              </div>
            )}

            <p style={{ ...S.label, marginBottom: 8 }}>Resultado manual</p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ margin: "0 0 6px", fontSize: 11, color: C.muted }}>{adminEdit.teamA}</p>
                <input type="number" min={0} max={99} placeholder="0" value={aScoreA} onChange={e => setAScoreA(e.target.value)} style={{ ...S.numInput, width: 58, padding: 12, fontSize: 22 }} />
              </div>
              <span style={{ color: C.faint, fontSize: 22, marginTop: 20 }}>–</span>
              <div style={{ textAlign: "center" }}>
                <p style={{ margin: "0 0 6px", fontSize: 11, color: C.muted }}>{adminEdit.teamB}</p>
                <input type="number" min={0} max={99} placeholder="0" value={aScoreB} onChange={e => setAScoreB(e.target.value)} style={{ ...S.numInput, width: 58, padding: 12, fontSize: 22 }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...S.btn(C.blue), flex: 1, opacity: saving ? 0.6 : 1 }} onClick={() => adminValidate(adminEditDay, adminEdit)} disabled={saving}>
                {saving ? "Guardando..." : "Guardar y validar →"}
              </button>
              <button style={S.btnSm} onClick={() => { setAdminEdit(null); setAdminEditDay(null); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            ...S.btnSm, flexShrink: 0,
            borderColor: filter === f.id ? C.blue : undefined,
            color: filter === f.id ? C.blue : undefined,
            background: filter === f.id ? "rgba(79,142,247,0.08)" : undefined,
          }}>{f.label}</button>
        ))}
      </div>

      {filteredDays.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 40, color: C.faint }}>No hay partidos en esta categoría.</div>
      ) : filteredDays.map(day => {
        const isOpen = expandedDays[day.key] !== false; // default open
        const validatedCount = day.matches.filter(m => m.matchStatus === "validado").length;
        const conflictCount = day.matches.filter(m => m.matchStatus === "conflicto").length;
        const hasMyMatch = day.matches.some(m => myTeamNames.has(m.teamA) || myTeamNames.has(m.teamB));

        return (
          <div key={day.key} style={{ marginBottom: 10 }}>
            {/* Matchday header */}
            <div
              onClick={() => toggleDay(day.key)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: isOpen ? "12px 12px 0 0" : 12, cursor: "pointer", userSelect: "none" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    {day.type === "group"
                      ? `Jornada ${day.matchdayNum} · Grupo ${day.groupName}`
                      : day.phase}
                  </span>
                  <span style={{ fontSize: 10, color: C.muted }}>{day.tournamentName}</span>
                  {hasMyMatch && !isAdmin && <span style={{ ...S.tag(C.gold), fontSize: 8 }}>Tu partido</span>}
                  {conflictCount > 0 && <span style={{ ...S.tag(C.red), fontSize: 8 }}>⚠️ {conflictCount}</span>}
                </div>
                {day.datetime && (
                  <p style={{ margin: "3px 0 0", fontSize: 11, color: C.blue }}>🕐 {formatDatetime(day.datetime)}</p>
                )}
                {!day.datetime && (
                  <p style={{ margin: "3px 0 0", fontSize: 11, color: C.faint }}>Sin fecha asignada</p>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: C.muted }}>{validatedCount}/{day.matches.length} ✓</span>
                <span style={{ color: C.faint, fontSize: 14 }}>{isOpen ? "▲" : "▼"}</span>
              </div>
            </div>

            {/* Matches */}
            {isOpen && (
              <div style={{ border: "1px solid rgba(255,255,255,0.07)", borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
                {day.matches.map((m, idx) => {
                  const st = m.matchStatus || "pendiente";
                  const stColor = matchStatusColor[st] || C.muted;
                  const canReport = (myTeamNames.has(m.teamA) || myTeamNames.has(m.teamB)) && st !== "validado" && !isAdmin;
                  const alreadyReported = (myTeamNames.has(m.teamA) && m.reportByA?.userId === currentUser?.uid) ||
                    (myTeamNames.has(m.teamB) && m.reportByB?.userId === currentUser?.uid);
                  const isMyMatch = myTeamNames.has(m.teamA) || myTeamNames.has(m.teamB);
                  const rivalName = isMyMatch ? (myTeamNames.has(m.teamA) ? m.teamB : m.teamA) : null;

                  return (
                    <div key={idx} style={{ padding: "14px 14px", borderBottom: idx < day.matches.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", background: isMyMatch ? "rgba(232,184,75,0.03)" : "transparent" }}>
                      {/* Status badge */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: 9, letterSpacing: 1, color: C.faint, textTransform: "uppercase" }}>
                          {m.leg === 2 ? "Vuelta · " : ""}
                        </span>
                        <span style={{ ...S.tag(stColor) }}>{statusIcon[st]} {statusLabel[st]}</span>
                      </div>

                      {/* Teams row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {/* Team A */}
                        <div
                          style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0, cursor: rivalName === m.teamA || isAdmin ? "pointer" : "default" }}
                          onClick={() => { if (rivalName === m.teamA || isAdmin) setRivalPopup(m.teamA); }}
                        >
                          <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={32} />
                          <span style={{ fontSize: 14, fontWeight: myTeamNames.has(m.teamA) ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: rivalName === m.teamA ? C.blue : C.text }}>{m.teamA}</span>
                          {(rivalName === m.teamA || isAdmin) && <span style={{ fontSize: 10, color: C.faint, flexShrink: 0 }}>ℹ</span>}
                        </div>

                        {/* Score */}
                        <div style={{ flexShrink: 0, minWidth: 56, textAlign: "center" }}>
                          {st === "validado"
                            ? <span style={{ fontWeight: 700, fontSize: 20, color: C.gold, letterSpacing: 2 }}>{m.scoreA}–{m.scoreB}</span>
                            : <span style={{ fontSize: 13, color: C.faint }}>vs</span>}
                        </div>

                        {/* Team B */}
                        <div
                          style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", minWidth: 0, cursor: rivalName === m.teamB || isAdmin ? "pointer" : "default" }}
                          onClick={() => { if (rivalName === m.teamB || isAdmin) setRivalPopup(m.teamB); }}
                        >
                          {(rivalName === m.teamB || isAdmin) && <span style={{ fontSize: 10, color: C.faint, flexShrink: 0 }}>ℹ</span>}
                          <span style={{ fontSize: 14, fontWeight: myTeamNames.has(m.teamB) ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: rivalName === m.teamB ? C.blue : C.text }}>{m.teamB}</span>
                          <TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={32} />
                        </div>
                      </div>

                      {/* Partial/conflict info */}
                      {st === "parcial" && (
                        <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(247,147,79,0.08)", borderRadius: 8, border: "1px solid rgba(247,147,79,0.2)" }}>
                          {m.reportByA && <p style={{ margin: "0 0 2px", fontSize: 11, color: C.muted }}>{m.teamA}: <strong style={{ color: C.text }}>{m.reportByA.scoreA}–{m.reportByA.scoreB}</strong></p>}
                          {m.reportByB && <p style={{ margin: 0, fontSize: 11, color: C.muted }}>{m.teamB}: <strong style={{ color: C.text }}>{m.reportByB.scoreA}–{m.reportByB.scoreB}</strong></p>}
                          {!m.reportByA && <p style={{ margin: 0, fontSize: 11, color: C.faint }}>Falta reporte de {m.teamA}</p>}
                          {!m.reportByB && <p style={{ margin: 0, fontSize: 11, color: C.faint }}>Falta reporte de {m.teamB}</p>}
                        </div>
                      )}
                      {st === "conflicto" && (
                        <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(247,111,111,0.07)", borderRadius: 8, border: "1px solid rgba(247,111,111,0.2)" }}>
                          {m.reportByA && <p style={{ margin: "0 0 2px", fontSize: 11, color: C.muted }}>{m.teamA}: <strong style={{ color: C.text }}>{m.reportByA.scoreA}–{m.reportByA.scoreB}</strong></p>}
                          {m.reportByB && <p style={{ margin: 0, fontSize: 11, color: C.muted }}>{m.teamB}: <strong style={{ color: C.text }}>{m.reportByB.scoreA}–{m.reportByB.scoreB}</strong></p>}
                          <p style={{ margin: "5px 0 0", fontSize: 10, color: C.red, letterSpacing: 0.5 }}>Un admin debe resolver este conflicto</p>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        {canReport && (
                          <button style={{ ...S.btnInline(alreadyReported ? C.orange : C.blue), flex: 1 }}
                            onClick={() => { setReportMatch(m); setReportDay(day); setRScoreA(""); setRScoreB(""); }}>
                            {alreadyReported ? "Modificar resultado" : "Reportar resultado"}
                          </button>
                        )}
                        {isAdmin && st !== "validado" && (
                          <button style={{ ...S.btnInline(st === "conflicto" ? C.red : C.blue), flex: 1 }}
                            onClick={() => { setAdminEdit(m); setAdminEditDay(day); setAScoreA(m.scoreA != null ? String(m.scoreA) : ""); setAScoreB(m.scoreB != null ? String(m.scoreB) : ""); }}>
                            {st === "conflicto" ? "⚠️ Resolver" : st === "parcial" ? "Validar" : "Introducir resultado"}
                          </button>
                        )}
                        {isAdmin && st === "validado" && (
                          <button style={{ ...S.btnSm }}
                            onClick={() => { setAdminEdit(m); setAdminEditDay(day); setAScoreA(String(m.scoreA)); setAScoreB(String(m.scoreB)); }}>
                            Editar resultado
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
