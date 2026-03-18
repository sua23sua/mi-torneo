import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from "firebase/firestore";
import { C, S } from "../shared.jsx";

const DEFAULT_NORMATIVA = [
  {
    titulo: "1. Registro y participación",
    texto: "Todos los equipos deben estar registrados en la plataforma y tener la inscripción aprobada por la organización antes del inicio del torneo. No se admitirán equipos una vez iniciada la competición.",
  },
  {
    titulo: "2. Puntualidad",
    texto: "Se recomienda respetar la hora acordada. Los 10 minutos de margen son orientativos — si un equipo no puede conectarse a tiempo, debe comunicárselo al rival y a la organización lo antes posible. En caso de que el retraso sea excesivo y no haya comunicación, la organización valorará la situación y tomará la decisión que considere oportuna.",
  },
  {
    titulo: "3. Comunicación previa",
    texto: "Ambos equipos tienen la obligación de contactar con el rival antes del partido para acordar la hora. Los datos de contacto están disponibles en la plataforma. La falta de comunicación no exime de la responsabilidad de jugar.",
  },
  {
    titulo: "4. Reporte de resultados",
    texto: "Al finalizar el partido, ambos equipos deben reportar el resultado en la plataforma. Si ambos reportes coinciden, el resultado queda validado automáticamente. Si hay discrepancia, la organización tomará la decisión final basándose en las pruebas aportadas.",
  },
  {
    titulo: "5. Pruebas y evidencias",
    texto: "En caso de conflicto se recomienda guardar capturas de pantalla del resultado final. La organización podrá solicitar estas pruebas para resolver disputas. Sin evidencias, prevalece el criterio de la organización.",
  },
  {
    titulo: "6. Clasificación en fase de grupos",
    texto: "El orden se determina por puntos (3 victoria, 1 empate, 0 derrota), diferencia de goles, goles a favor y resultado directo entre los equipos empatados, en ese orden.",
  },
  {
    titulo: "7. Fase eliminatoria",
    texto: "No se permiten empates. En caso de igualdad al final del tiempo reglamentario se disputarán penaltis. El ganador avanza a la siguiente ronda.",
  },
  {
    titulo: "8. Conducta deportiva",
    texto: "Se exige un comportamiento respetuoso dentro y fuera del campo. Insultos, amenazas o actitudes antideportivas pueden suponer penalizaciones o expulsión del torneo a criterio de la organización.",
  },
  {
    titulo: "9. Modificaciones",
    texto: "La organización se reserva el derecho de modificar el reglamento en casos excepcionales, comunicándolo a los participantes con la mayor antelación posible.",
  },
];

// ── Read-only view ────────────────────────────────────────────────
export function NormativaView() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "normativa"), orderBy("order", "asc"));
    return onSnapshot(q, snap => {
      setRules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  const display = rules.length > 0 ? rules : DEFAULT_NORMATIVA;

  if (loading) return <div style={{ textAlign: "center", padding: 32, color: C.faint }}>Cargando normativa...</div>;

  return (
    <div>
      {display.map((n, i) => (
        <div key={n.id || i} style={S.card}>
          <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 14, color: C.gold }}>{n.titulo}</p>
          <p style={{ margin: 0, fontSize: 13, color: "#8a9ab4", lineHeight: 1.7 }}>{n.texto}</p>
        </div>
      ))}
      {rules.length === 0 && (
        <p style={{ fontSize: 11, color: C.faint, textAlign: "center", marginTop: 8 }}>
          Normativa por defecto · El admin puede personalizarla en su panel
        </p>
      )}
    </div>
  );
}

// ── Admin editor ──────────────────────────────────────────────────
export function NormativaEditor() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ titulo: "", texto: "" });
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState(null);

  function showNotif(msg, color = C.green) {
    setNotif({ msg, color });
    setTimeout(() => setNotif(null), 2500);
  }

  useEffect(() => {
    const q = query(collection(db, "normativa"), orderBy("order", "asc"));
    return onSnapshot(q, snap => {
      setRules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  async function saveRule() {
    if (!form.titulo.trim() || !form.texto.trim()) return showNotif("Rellena título y texto", C.red);
    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "normativa", editingId), { titulo: form.titulo.trim(), texto: form.texto.trim() });
        showNotif("Actualizado ✓");
      } else {
        const maxOrder = rules.length > 0 ? Math.max(...rules.map(r => r.order || 0)) : 0;
        await addDoc(collection(db, "normativa"), {
          titulo: form.titulo.trim(), texto: form.texto.trim(),
          order: maxOrder + 1, createdAt: new Date().toISOString(),
        });
        showNotif("Añadido ✓");
      }
      setForm({ titulo: "", texto: "" });
      setEditingId(null);
    } catch (e) { showNotif("Error: " + e.message, C.red); }
    setSaving(false);
  }

  async function deleteRule(id) {
    if (!window.confirm("¿Eliminar esta norma?")) return;
    await deleteDoc(doc(db, "normativa", id));
    showNotif("Eliminado");
  }

  async function moveRule(id, direction) {
    const idx = rules.findIndex(r => r.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rules.length) return;
    const a = rules[idx], b = rules[swapIdx];
    await Promise.all([
      updateDoc(doc(db, "normativa", a.id), { order: b.order }),
      updateDoc(doc(db, "normativa", b.id), { order: a.order }),
    ]);
  }

  function startEdit(rule) {
    setEditingId(rule.id);
    setForm({ titulo: rule.titulo, texto: rule.texto });
    window.scrollTo(0, 0);
  }

  async function loadDefaults() {
    if (!window.confirm("¿Cargar la normativa por defecto? Se añadirán las 9 normas estándar.")) return;
    setSaving(true);
    for (let i = 0; i < DEFAULT_NORMATIVA.length; i++) {
      await addDoc(collection(db, "normativa"), {
        ...DEFAULT_NORMATIVA[i], order: (rules.length + i + 1),
        createdAt: new Date().toISOString(),
      });
    }
    setSaving(false);
    showNotif("Normativa por defecto cargada ✓");
  }

  if (loading) return <div style={{ textAlign: "center", padding: 32, color: C.faint }}>Cargando...</div>;

  return (
    <div>
      {notif && <div style={{ position: "fixed", top: 16, left: 16, right: 16, background: notif.color, color: notif.color === C.green ? "#07090f" : "#fff", padding: "13px 16px", zIndex: 9999, fontSize: 13, fontFamily: "'Georgia',serif", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", borderRadius: 10, textAlign: "center", fontWeight: 600 }}>{notif.msg}</div>}

      {/* Form */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <p style={{ ...S.label, color: C.gold, marginBottom: 14 }}>{editingId ? "✏ Editando norma" : "+ Nueva norma"}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={S.label}>Título</label>
            <input style={S.input} placeholder="Ej: 1. Participación" value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} />
          </div>
          <div>
            <label style={S.label}>Texto</label>
            <textarea style={S.textarea} placeholder="Descripción de la norma..." value={form.texto} onChange={e => setForm(p => ({ ...p, texto: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ ...S.btn(), opacity: saving ? 0.6 : 1 }} onClick={saveRule} disabled={saving}>
              {saving ? "Guardando..." : editingId ? "Actualizar →" : "Añadir norma →"}
            </button>
            {editingId && <button style={S.btnSm} onClick={() => { setEditingId(null); setForm({ titulo: "", texto: "" }); }}>Cancelar</button>}
          </div>
        </div>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 32 }}>
          <p style={{ color: C.muted, marginBottom: 16 }}>No hay normas personalizadas todavía.</p>
          <p style={{ color: C.faint, fontSize: 12, marginBottom: 20 }}>Se muestra la normativa por defecto a los usuarios.</p>
          <button style={{ ...S.btnInline(C.blue) }} onClick={loadDefaults} disabled={saving}>
            Cargar normativa por defecto (9 normas)
          </button>
        </div>
      ) : (
        <>
          {rules.map((rule, idx) => (
            <div key={rule.id} style={{ ...S.card, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 5px", fontWeight: 700, fontSize: 14, color: C.gold }}>{rule.titulo}</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#8a9ab4", lineHeight: 1.6 }}>{rule.texto}</p>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, flexDirection: "column", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...S.btnSm, padding: "6px 10px" }} onClick={() => moveRule(rule.id, "up")} disabled={idx === 0}>↑</button>
                    <button style={{ ...S.btnSm, padding: "6px 10px" }} onClick={() => moveRule(rule.id, "down")} disabled={idx === rules.length - 1}>↓</button>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...S.btnSm }} onClick={() => startEdit(rule)}>Editar</button>
                    <button style={S.btnDanger} onClick={() => deleteRule(rule.id)}>Borrar</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button style={{ ...S.btnSm, fontSize: 10 }} onClick={loadDefaults} disabled={saving}>
              + Añadir normativa por defecto
            </button>
          </div>
        </>
      )}
    </div>
  );
}
