import { useState } from "react";
import { db } from "../firebase";
import { doc, updateDoc } from "firebase/firestore";
import { C, S, TeamLogo, matchStatusColor, getRoundName, applyGroupResult, computeMatchStatus } from "../shared.jsx";

/**
 * Collects all matches from active tournaments.
 * Returns flat list with tournament/phase context attached.
 */
export function collectMatches(tournaments, inscriptions) {
  const matches = [];
  tournaments.forEach(t => {
    if (t.status !== "En curso" && t.status !== "Abierto") return;
    // Group phase
    t.groups?.forEach((g, gi) => {
      g.matches?.forEach((m, mi) => {
        matches.push({
          ...m,
          _tId: t.id, _tName: t.name, _format: t.format,
          _phase: `Grupo ${g.name}`, _gi: gi, _mi: mi, _type: "group",
        });
      });
    });
    // Elimination
    t.eliminationRounds?.forEach((round, ri) => {
      round.matches?.forEach((m, mi) => {
        matches.push({
          ...m,
          _tId: t.id, _tName: t.name, _format: t.format,
          _phase: getRoundName(t.eliminationRounds.length, ri),
          _ri: ri, _mi: mi, _type: "elim",
        });
      });
    });
  });
  return matches;
}

const statusLabel = {
  pendiente: "Sin jugar",
  parcial: "Esperando confirmación",
  conflicto: "Resultado en conflicto",
  validado: "Validado",
};

const statusIcon = {
  pendiente: "⏳",
  parcial: "🕐",
  conflicto: "⚠️",
  validado: "✓",
};

export default function MatchesPanel({ tournaments, inscriptions, currentUser, isAdmin, logoMap }) {
  const [filter, setFilter] = useState("todos"); // todos | pendiente | validado | conflicto
  const [reportMatch, setReportMatch] = useState(null);
  const [rScoreA, setRScoreA] = useState("");
  const [rScoreB, setRScoreB] = useState("");
  const [adminEdit, setAdminEdit] = useState(null);
  const [aScoreA, setAScoreA] = useState("");
  const [aScoreB, setAScoreB] = useState("");
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState(null);

  function showNotif(msg, color = C.blue) { setNotif({ msg, color }); setTimeout(() => setNotif(null), 3000); }

  // My approved team names
  const myTeamNames = new Set(
    inscriptions
      .filter(i => i.userId === currentUser?.uid && i.status === "aprobada")
      .map(i => i.teamName)
  );

  const allMatches = collectMatches(tournaments, inscriptions);

  const filtered = allMatches.filter(m => {
    const st = m.matchStatus || "pendiente";
    if (filter === "todos") return true;
    if (filter === "pendiente") return st === "pendiente" || st === "parcial";
    if (filter === "validado") return st === "validado";
    if (filter === "conflicto") return st === "conflicto";
    if (filter === "mis") return myTeamNames.has(m.teamA) || myTeamNames.has(m.teamB);
    return true;
  });

  // ── Save a user report ──
  async function submitReport(match) {
    const sA = parseInt(rScoreA), sB = parseInt(rScoreB);
    if (isNaN(sA) || isNaN(sB)) return showNotif("Introduce ambos marcadores", C.red);
    setSaving(true);

    const t = tournaments.find(t => t.id === match._tId);
    if (!t) return;

    // Determine which side the current user is (A or B)
    const side = myTeamNames.has(match.teamA) ? "A" : myTeamNames.has(match.teamB) ? "B" : null;
    if (!side && !isAdmin) { showNotif("No perteneces a este partido", C.red); setSaving(false); return; }

    const report = { scoreA: sA, scoreB: sB, userId: currentUser.uid, userName: currentUser.displayName || currentUser.email, at: new Date().toISOString() };
    const otherReport = side === "A" ? match.reportByB : match.reportByA;
    let newStatus = computeMatchStatus(match, side, sA, sB);

    // If admin force-reports, treat as both sides agreed
    if (isAdmin) newStatus = "validado";

    await saveMatchUpdate(t, match, {
      ...(side === "A" || isAdmin ? { reportByA: report } : {}),
      ...(side === "B" ? { reportByB: report } : {}),
      ...(isAdmin ? { reportByB: report } : {}),
      matchStatus: newStatus,
      ...(newStatus === "validado" ? { scoreA: sA, scoreB: sB, played: true, winner: sA > sB ? match.teamA : sA < sB ? match.teamB : null } : {}),
    });

    setReportMatch(null); setRScoreA(""); setRScoreB("");
    if (newStatus === "validado") showNotif("Resultado validado ✓", C.green);
    else if (newStatus === "parcial") showNotif("Resultado enviado ✓ Esperando confirmación del rival", C.orange);
    else if (newStatus === "conflicto") showNotif("⚠️ Los resultados no coinciden. Un admin resolverá el conflicto.", C.red);
    setSaving(false);
  }

  // ── Admin validate / override ──
  async function adminValidate(match, forceScoreA, forceScoreB) {
    const sA = parseInt(forceScoreA ?? aScoreA), sB = parseInt(forceScoreB ?? aScoreB);
    if (isNaN(sA) || isNaN(sB)) return showNotif("Introduce ambos marcadores", C.red);
    setSaving(true);
    const t = tournaments.find(t => t.id === match._tId);
    if (!t) return;
    const report = { scoreA: sA, scoreB: sB, userId: currentUser.uid, userName: "Admin", at: new Date().toISOString() };
    await saveMatchUpdate(t, match, {
      reportByA: report, reportByB: report,
      matchStatus: "validado",
      scoreA: sA, scoreB: sB, played: true,
      winner: sA > sB ? match.teamA : sA < sB ? match.teamB : null,
    });
    setAdminEdit(null); setAScoreA(""); setAScoreB("");
    showNotif("Resultado validado por admin ✓", C.green);
    setSaving(false);
  }

  async function saveMatchUpdate(tournament, match, updates) {
    if (match._type === "group") {
      const newGroups = tournament.groups.map((g, gi) => {
        if (gi !== match._gi) return g;
        const newMatches = g.matches.map((m, mi) => mi !== match._mi ? m : { ...m, ...updates });
        // Recalculate standings if validated
        let standings = g.standings;
        if (updates.matchStatus === "validado") {
          standings = g.teams.map(t => ({ name: t, pts: 0, gf: 0, gc: 0, pj: 0, gd: 0 }));
          newMatches.forEach(m => { if (m.played) standings = applyGroupResult(standings, m.teamA, m.teamB, m.scoreA, m.scoreB); });
        }
        return { ...g, matches: newMatches, standings };
      });
      await updateDoc(doc(db, "tournaments", tournament.id), { groups: newGroups });
      // Check if all groups done → auto-generate elimination if format needs it
    } else {
      const newRounds = tournament.eliminationRounds.map((r, ri) => {
        if (ri !== match._ri) return r;
        return { ...r, matches: r.matches.map((m, mi) => mi !== match._mi ? m : { ...m, ...updates }) };
      });
      // Check if round complete
      const round = newRounds[match._ri];
      const allDone = round.matches.every(m => m.matchStatus === "validado");
      let finalRounds = newRounds, winner = null;
      if (allDone) {
        const winners = round.matches.map(m => m.winner).filter(w => w && w !== "BYE");
        if (winners.length === 1) winner = winners[0];
        else if (winners.length > 1) {
          const { buildEliminationRound } = await import("../shared.jsx");
          finalRounds = [...newRounds, { round: newRounds.length + 1, matches: buildEliminationRound(winners) }];
        }
      }
      await updateDoc(doc(db, "tournaments", tournament.id), {
        eliminationRounds: finalRounds,
        ...(winner ? { winner, status: "Finalizado" } : {}),
      });
    }
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
        <div style={{ position: "fixed", top: 16, left: 16, right: 16, background: notif.color, color: notif.color === C.gold ? "#07090f" : "#fff", padding: "13px 16px", zIndex: 9999, fontSize: 13, fontFamily: "'Georgia',serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", borderRadius: 10, textAlign: "center", fontWeight: 600 }}>{notif.msg}</div>
      )}

      {/* Report modal */}
      {reportMatch && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ ...S.card, maxWidth: 380, width: "100%", padding: 24 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700 }}>Reportar resultado</h3>
            <p style={{ margin: "0 0 20px", color: C.muted, fontSize: 13 }}>{reportMatch._tName} · {reportMatch._phase}</p>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <TeamLogo name={reportMatch.teamA} logoUrl={logoMap[reportMatch.teamA]} size={40} />
                <span style={{ fontSize: 12, textAlign: "center", fontWeight: 600 }}>{reportMatch.teamA}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="number" min={0} max={99} placeholder="0" value={rScoreA} onChange={e => setRScoreA(e.target.value)} style={{ ...S.numInput, width: 58, padding: 12, fontSize: 22 }} />
                <span style={{ color: C.faint, fontSize: 20, fontWeight: 700 }}>–</span>
                <input type="number" min={0} max={99} placeholder="0" value={rScoreB} onChange={e => setRScoreB(e.target.value)} style={{ ...S.numInput, width: 58, padding: 12, fontSize: 22 }} />
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <TeamLogo name={reportMatch.teamB} logoUrl={logoMap[reportMatch.teamB]} size={40} />
                <span style={{ fontSize: 12, textAlign: "center", fontWeight: 600 }}>{reportMatch.teamB}</span>
              </div>
            </div>

            {/* Show existing reports */}
            {(reportMatch.reportByA || reportMatch.reportByB) && (
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <p style={{ ...S.label, marginBottom: 8 }}>Reportes existentes</p>
                {reportMatch.reportByA && (
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: C.muted }}>
                    <strong style={{ color: C.text }}>{reportMatch.teamA}</strong>: {reportMatch.reportByA.scoreA}–{reportMatch.reportByA.scoreB}
                    <span style={{ color: C.faint }}> ({reportMatch.reportByA.userName})</span>
                  </p>
                )}
                {reportMatch.reportByB && (
                  <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
                    <strong style={{ color: C.text }}>{reportMatch.teamB}</strong>: {reportMatch.reportByB.scoreA}–{reportMatch.reportByB.scoreB}
                    <span style={{ color: C.faint }}> ({reportMatch.reportByB.userName})</span>
                  </p>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...S.btn(), flex: 1, opacity: saving ? 0.6 : 1 }} onClick={() => submitReport(reportMatch)} disabled={saving}>
                {saving ? "Enviando..." : "Enviar resultado →"}
              </button>
              <button style={{ ...S.btnSm }} onClick={() => { setReportMatch(null); setRScoreA(""); setRScoreB(""); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin edit modal */}
      {adminEdit && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ ...S.card, maxWidth: 380, width: "100%", padding: 24 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700 }}>Validar resultado (Admin)</h3>
            <p style={{ margin: "0 0 16px", color: C.muted, fontSize: 13 }}>{adminEdit._tName} · {adminEdit._phase}</p>

            {(adminEdit.reportByA || adminEdit.reportByB) && (
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <p style={{ ...S.label, marginBottom: 8 }}>Reportes recibidos</p>
                {adminEdit.reportByA && (
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: C.muted }}>
                    <strong style={{ color: C.text }}>{adminEdit.teamA}</strong>: {adminEdit.reportByA.scoreA}–{adminEdit.reportByA.scoreB}
                  </p>
                )}
                {adminEdit.reportByB && (
                  <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
                    <strong style={{ color: C.text }}>{adminEdit.teamB}</strong>: {adminEdit.reportByB.scoreA}–{adminEdit.reportByB.scoreB}
                  </p>
                )}
              </div>
            )}

            {/* Quick validate button if both reported and conflict */}
            {adminEdit.reportByA && adminEdit.reportByB && adminEdit.matchStatus === "conflicto" && (
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button style={{ ...S.btnInline("rgba(82,214,138,0.15)"), flex: 1, border: "1px solid rgba(82,214,138,0.4)", color: C.green }} onClick={() => adminValidate(adminEdit, adminEdit.reportByA.scoreA, adminEdit.reportByA.scoreB)}>
                  Aceptar resultado de {adminEdit.teamA}
                </button>
                <button style={{ ...S.btnInline("rgba(82,214,138,0.15)"), flex: 1, border: "1px solid rgba(82,214,138,0.4)", color: C.green }} onClick={() => adminValidate(adminEdit, adminEdit.reportByB.scoreA, adminEdit.reportByB.scoreB)}>
                  Aceptar resultado de {adminEdit.teamB}
                </button>
              </div>
            )}

            {/* Validate with partial report */}
            {adminEdit.matchStatus === "parcial" && adminEdit.reportByA && (
              <button style={{ ...S.btn(C.green), color: "#07090f", marginBottom: 14 }} onClick={() => adminValidate(adminEdit, adminEdit.reportByA.scoreA, adminEdit.reportByA.scoreB)}>
                ✓ Validar resultado de {adminEdit.teamA} ({adminEdit.reportByA.scoreA}–{adminEdit.reportByA.scoreB})
              </button>
            )}
            {adminEdit.matchStatus === "parcial" && adminEdit.reportByB && (
              <button style={{ ...S.btn(C.green), color: "#07090f", marginBottom: 14 }} onClick={() => adminValidate(adminEdit, adminEdit.reportByB.scoreA, adminEdit.reportByB.scoreB)}>
                ✓ Validar resultado de {adminEdit.teamB} ({adminEdit.reportByB.scoreA}–{adminEdit.reportByB.scoreB})
              </button>
            )}

            <p style={{ ...S.label, marginBottom: 8 }}>O introduce resultado manualmente</p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, justifyContent: "center" }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ margin: "0 0 6px", fontSize: 11, color: C.muted }}>{adminEdit.teamA}</p>
                <input type="number" min={0} max={99} placeholder="0" value={aScoreA} onChange={e => setAScoreA(e.target.value)} style={{ ...S.numInput, width: 58, padding: 12, fontSize: 22 }} />
              </div>
              <span style={{ color: C.faint, fontSize: 22, fontWeight: 700, marginTop: 20 }}>–</span>
              <div style={{ textAlign: "center" }}>
                <p style={{ margin: "0 0 6px", fontSize: 11, color: C.muted }}>{adminEdit.teamB}</p>
                <input type="number" min={0} max={99} placeholder="0" value={aScoreB} onChange={e => setAScoreB(e.target.value)} style={{ ...S.numInput, width: 58, padding: 12, fontSize: 22 }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...S.btn(C.blue), flex: 1, opacity: saving ? 0.6 : 1 }} onClick={() => adminValidate(adminEdit)} disabled={saving}>
                {saving ? "Guardando..." : "Guardar y validar →"}
              </button>
              <button style={S.btnSm} onClick={() => { setAdminEdit(null); setAScoreA(""); setAScoreB(""); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {FILTERS.filter(f => isAdmin || f.id !== "conflicto" || filtered.some(m => (m.matchStatus || "pendiente") === "conflicto")).map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            ...S.btnSm, flexShrink: 0,
            borderColor: filter === f.id ? C.blue : undefined,
            color: filter === f.id ? C.blue : undefined,
            background: filter === f.id ? "rgba(79,142,247,0.08)" : undefined,
          }}>{f.label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 40, color: C.faint }}>
          No hay partidos en esta categoría.
        </div>
      ) : (
        // Group by tournament
        Object.entries(
          filtered.reduce((acc, m) => { (acc[m._tName] = acc[m._tName] || []).push(m); return acc; }, {})
        ).map(([tName, tMatches]) => (
          <div key={tName} style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.muted, margin: "0 0 8px", padding: "0 4px" }}>{tName}</p>
            {tMatches.map((m, idx) => {
              const st = m.matchStatus || "pendiente";
              const stColor = matchStatusColor[st] || C.muted;
              const canReport = (myTeamNames.has(m.teamA) || myTeamNames.has(m.teamB)) && st !== "validado";
              const alreadyReported = (myTeamNames.has(m.teamA) && m.reportByA) || (myTeamNames.has(m.teamB) && m.reportByB);
              const isMyMatch = myTeamNames.has(m.teamA) || myTeamNames.has(m.teamB);

              return (
                <div key={idx} style={{ ...S.card, marginBottom: 8, borderColor: isMyMatch ? "rgba(232,184,75,0.2)" : undefined }}>
                  {/* Phase + status */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 10, letterSpacing: 1.5, color: C.faint, textTransform: "uppercase" }}>{m._phase}</span>
                    <span style={{ ...S.tag(stColor) }}>{statusIcon[st]} {statusLabel[st]}</span>
                  </div>

                  {/* Teams + score */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <TeamLogo name={m.teamA} logoUrl={logoMap[m.teamA]} size={32} />
                      <span style={{ fontSize: 14, fontWeight: myTeamNames.has(m.teamA) ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamA}</span>
                    </div>
                    <div style={{ flexShrink: 0, minWidth: 60, textAlign: "center" }}>
                      {st === "validado"
                        ? <span style={{ fontWeight: 700, fontSize: 20, color: C.gold, letterSpacing: 2 }}>{m.scoreA}–{m.scoreB}</span>
                        : <span style={{ fontSize: 13, color: C.faint }}>vs</span>
                      }
                    </div>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: myTeamNames.has(m.teamB) ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.teamB}</span>
                      <TeamLogo name={m.teamB} logoUrl={logoMap[m.teamB]} size={32} />
                    </div>
                  </div>

                  {/* Partial reports summary */}
                  {st === "parcial" && (
                    <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(247,147,79,0.08)", borderRadius: 8, border: "1px solid rgba(247,147,79,0.2)" }}>
                      {m.reportByA && <p style={{ margin: "0 0 2px", fontSize: 12, color: C.muted }}>{m.teamA}: <strong style={{ color: C.text }}>{m.reportByA.scoreA}–{m.reportByA.scoreB}</strong></p>}
                      {m.reportByB && <p style={{ margin: 0, fontSize: 12, color: C.muted }}>{m.teamB}: <strong style={{ color: C.text }}>{m.reportByB.scoreA}–{m.reportByB.scoreB}</strong></p>}
                      {!m.reportByA && <p style={{ margin: 0, fontSize: 12, color: C.faint }}>Falta confirmación de {m.teamA}</p>}
                      {!m.reportByB && <p style={{ margin: 0, fontSize: 12, color: C.faint }}>Falta confirmación de {m.teamB}</p>}
                    </div>
                  )}

                  {/* Conflict summary */}
                  {st === "conflicto" && (
                    <div style={{ marginTop: 10, padding: "8px 10px", background: "rgba(247,111,111,0.08)", borderRadius: 8, border: "1px solid rgba(247,111,111,0.2)" }}>
                      {m.reportByA && <p style={{ margin: "0 0 2px", fontSize: 12, color: C.muted }}>{m.teamA}: <strong style={{ color: C.text }}>{m.reportByA.scoreA}–{m.reportByA.scoreB}</strong></p>}
                      {m.reportByB && <p style={{ margin: 0, fontSize: 12, color: C.muted }}>{m.teamB}: <strong style={{ color: C.text }}>{m.reportByB.scoreA}–{m.reportByB.scoreB}</strong></p>}
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: C.red }}>Los resultados no coinciden. Un admin debe resolver.</p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    {canReport && !isAdmin && (
                      <button
                        style={{ ...S.btnInline(alreadyReported ? C.orange : C.blue), flex: 1 }}
                        onClick={() => {
                          setReportMatch(m);
                          setRScoreA(alreadyReported ? (myTeamNames.has(m.teamA) ? String(m.reportByA?.scoreA ?? "") : String(m.reportByB?.scoreA ?? "")) : "");
                          setRScoreB(alreadyReported ? (myTeamNames.has(m.teamA) ? String(m.reportByA?.scoreB ?? "") : String(m.reportByB?.scoreB ?? "")) : "");
                        }}
                      >
                        {alreadyReported ? "Modificar resultado" : "Reportar resultado"}
                      </button>
                    )}
                    {isAdmin && st !== "validado" && (
                      <button style={{ ...S.btnInline(C.blue), flex: 1 }} onClick={() => {
                        setAdminEdit(m);
                        setAScoreA(m.scoreA != null ? String(m.scoreA) : "");
                        setAScoreB(m.scoreB != null ? String(m.scoreB) : "");
                      }}>
                        {st === "conflicto" ? "⚠️ Resolver conflicto" : st === "parcial" ? "Validar resultado" : "Introducir resultado"}
                      </button>
                    )}
                    {isAdmin && st === "validado" && (
                      <button style={{ ...S.btnSm, color: C.muted }} onClick={() => {
                        setAdminEdit(m);
                        setAScoreA(String(m.scoreA));
                        setAScoreB(String(m.scoreB));
                      }}>
                        Editar resultado
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
