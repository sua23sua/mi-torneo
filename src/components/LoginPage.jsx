import { useState } from "react";
import { auth, db, googleProvider } from "../firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";

async function ensureUserDoc(firebaseUser, extra = {}) {
  const ref = doc(db, "users", firebaseUser.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: firebaseUser.uid, email: firebaseUser.email,
      name: firebaseUser.displayName || extra.name || firebaseUser.email.split("@")[0],
      role: "user", createdAt: new Date().toISOString(),
    });
  }
}

export default function LoginPage({ onBack }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const msgs = {
    "auth/email-already-in-use": "Ese email ya está registrado",
    "auth/invalid-email": "Email no válido",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres",
    "auth/invalid-credential": "Email o contraseña incorrectos",
  };

  async function handleSubmit() {
    setError(""); setLoading(true);
    try {
      if (mode === "register") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await ensureUserDoc(cred.user, { name });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (e) { setError(msgs[e.code] || "Error al iniciar sesión"); }
    setLoading(false);
  }

  async function handleGoogle() {
    setError(""); setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await ensureUserDoc(cred.user);
    } catch (e) { setError("Error al iniciar sesión con Google"); }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#07090f", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Georgia','Times New Roman',serif", padding: 20, boxSizing: "border-box", position: "relative", overflow: "hidden" }}>
      {/* Background blobs */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
        <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(79,142,247,0.07) 0%, transparent 70%)", top: "-10%", left: "-10%" }} />
        <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,184,75,0.05) 0%, transparent 70%)", bottom: "10%", right: "-5%" }} />
      </div>

      <style>{`
        input:focus { outline: none; border-color: #4f8ef7 !important; box-shadow: 0 0 0 3px rgba(79,142,247,0.12); }
        input::placeholder { color: rgba(200,212,228,0.2) !important; }
        .login-btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .mode-link:hover { color: #4f8ef7; }
      `}</style>

      <div style={{ position: "relative", zIndex: 5, width: "100%", maxWidth: 400 }}>
        {/* Back */}
        {onBack && (
          <button onClick={onBack} className="login-btn" style={{ background: "none", border: "none", color: "#5a6880", cursor: "pointer", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontFamily: "'Georgia',serif", padding: "0 0 28px 0", display: "flex", alignItems: "center", gap: 8, transition: "color .15s" }}>
            ← Volver
          </button>
        )}

        <div style={{ background: "rgba(13,17,23,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "clamp(28px,5vw,44px) clamp(22px,5vw,38px)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32, justifyContent: "center" }}>
            <div style={{ width: 36, height: 36, background: "linear-gradient(135deg, #4f8ef7, #2a6fd4)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>⚔</div>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#4f8ef7" }}>TournamentOS</span>
          </div>

          <h2 style={{ margin: "0 0 6px", textAlign: "center", fontSize: 20, fontWeight: 700 }}>
            {mode === "login" ? "Bienvenido de nuevo" : "Crear cuenta"}
          </h2>
          <p style={{ margin: "0 0 28px", textAlign: "center", color: "#5a6880", fontSize: 13 }}>
            {mode === "login" ? "Accede a tu panel de torneos" : "Únete a la competición"}
          </p>

          {error && (
            <div style={{ background: "rgba(247,111,111,0.08)", border: "1px solid rgba(247,111,111,0.25)", color: "#f76f6f", padding: "11px 14px", fontSize: 13, marginBottom: 18, borderRadius: 8 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "register" && (
              <div>
                <label style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#5a6880", display: "block", marginBottom: 7 }}>Nombre</label>
                <input style={{ width: "100%", padding: "11px 14px", fontSize: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#edf0f7", boxSizing: "border-box", fontFamily: "'Georgia',serif", borderRadius: 8, transition: "border-color .15s, box-shadow .15s" }} placeholder="Tu nombre" value={name} onChange={e => setName(e.target.value)} />
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#5a6880", display: "block", marginBottom: 7 }}>Email</label>
              <input type="email" style={{ width: "100%", padding: "11px 14px", fontSize: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#edf0f7", boxSizing: "border-box", fontFamily: "'Georgia',serif", borderRadius: 8, transition: "border-color .15s, box-shadow .15s" }} placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            </div>
            <div>
              <label style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#5a6880", display: "block", marginBottom: 7 }}>Contraseña</label>
              <input type="password" style={{ width: "100%", padding: "11px 14px", fontSize: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "#edf0f7", boxSizing: "border-box", fontFamily: "'Georgia',serif", borderRadius: 8, transition: "border-color .15s, box-shadow .15s" }} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            </div>
          </div>

          <button className="login-btn" style={{ width: "100%", padding: 14, background: "linear-gradient(135deg, #4f8ef7, #2a6fd4)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", letterSpacing: 2, textTransform: "uppercase", fontSize: 12, fontWeight: 700, fontFamily: "'Georgia',serif", marginTop: 22, opacity: loading ? 0.6 : 1, transition: "opacity .15s, transform .1s" }} onClick={handleSubmit} disabled={loading}>
            {loading ? "Cargando..." : mode === "login" ? "Entrar →" : "Crear cuenta →"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
            <span style={{ fontSize: 10, color: "#3e4a5a", letterSpacing: 2 }}>O</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
          </div>

          <button className="login-btn" style={{ width: "100%", padding: 12, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#c8d4e4", cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase", fontSize: 11, fontFamily: "'Georgia',serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "opacity .15s, transform .1s" }} onClick={handleGoogle} disabled={loading}>
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
            Continuar con Google
          </button>

          <div style={{ textAlign: "center", marginTop: 22, fontSize: 13, color: "#5a6880" }}>
            {mode === "login"
              ? <>¿No tienes cuenta? <span className="mode-link" style={{ color: "#4f8ef7", cursor: "pointer", transition: "color .15s" }} onClick={() => { setMode("register"); setError(""); }}>Regístrate</span></>
              : <>¿Ya tienes cuenta? <span className="mode-link" style={{ color: "#4f8ef7", cursor: "pointer", transition: "color .15s" }} onClick={() => { setMode("login"); setError(""); }}>Inicia sesión</span></>}
          </div>
        </div>
      </div>
    </div>
  );
}
