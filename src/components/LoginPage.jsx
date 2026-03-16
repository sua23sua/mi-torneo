import { useState } from "react";
import { auth, db, googleProvider } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";

async function ensureUserDoc(firebaseUser, extra = {}) {
  const ref = doc(db, "users", firebaseUser.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: firebaseUser.uid, email: firebaseUser.email,
      name: firebaseUser.displayName || extra.name || firebaseUser.email.split("@")[0],
      role: "user", teamId: null,
      createdAt: new Date().toISOString(),
    });
  }
}

export default function LoginPage({ onBack }) {
  const [mode, setMode] = useState("login"); // login | register | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const msgs = {
    "auth/email-already-in-use": "Ese email ya está registrado",
    "auth/invalid-email": "Email no válido",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres",
    "auth/invalid-credential": "Email o contraseña incorrectos",
    "auth/user-not-found": "No existe ninguna cuenta con ese email",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento.",
  };

  async function handleSubmit() {
    setError(""); setSuccess(""); setLoading(true);
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
    setError(""); setSuccess(""); setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await ensureUserDoc(cred.user);
    } catch (e) { setError("Error al iniciar sesión con Google"); }
    setLoading(false);
  }

  async function handleReset() {
    setError(""); setSuccess(""); setLoading(true);
    if (!email.trim()) { setError("Introduce tu email primero"); setLoading(false); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSuccess("Email enviado ✓ Revisa tu bandeja de entrada");
    } catch (e) { setError(msgs[e.code] || "Error al enviar el email"); }
    setLoading(false);
  }

  const inputStyle = {
    width: "100%", padding: "15px 14px", fontSize: 16, borderRadius: 10,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
    color: "#edf0f7", boxSizing: "border-box", fontFamily: "'Georgia',serif",
    WebkitAppearance: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#07090f", display: "flex", flexDirection: "column", fontFamily: "'Georgia','Times New Roman',serif", boxSizing: "border-box" }}>
      <style>{`input:focus{outline:none;border-color:#4f8ef7!important;box-shadow:0 0 0 3px rgba(79,142,247,0.12);}input::placeholder{color:rgba(200,212,228,0.2)!important;}*{box-sizing:border-box;}`}</style>

      {onBack && (
        <div style={{ padding: "16px 16px 0" }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: "#5a6880", cursor: "pointer", fontSize: 14, fontFamily: "'Georgia',serif", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
            ← Volver
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ width: "100%", maxWidth: 400 }}>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32, justifyContent: "center" }}>
            <div style={{ width: 40, height: 40, background: "linear-gradient(135deg,#4f8ef7,#2a6fd4)", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚔</div>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#4f8ef7" }}>TournamentOS</span>
          </div>

          {/* Title */}
          <h2 style={{ margin: "0 0 6px", textAlign: "center", fontSize: 22, fontWeight: 700 }}>
            {mode === "login" ? "Bienvenido" : mode === "register" ? "Crear cuenta" : "Recuperar contraseña"}
          </h2>
          <p style={{ margin: "0 0 28px", textAlign: "center", color: "#5a6880", fontSize: 14 }}>
            {mode === "login" ? "Accede a tu panel" : mode === "register" ? "Únete a la competición" : "Te enviaremos un email para restablecer tu contraseña"}
          </p>

          {/* Error / Success */}
          {error && <div style={{ background: "rgba(247,111,111,0.08)", border: "1px solid rgba(247,111,111,0.25)", color: "#f76f6f", padding: "13px 14px", fontSize: 14, marginBottom: 18, borderRadius: 10 }}>{error}</div>}
          {success && <div style={{ background: "rgba(82,214,138,0.08)", border: "1px solid rgba(82,214,138,0.25)", color: "#52d68a", padding: "13px 14px", fontSize: 14, marginBottom: 18, borderRadius: 10 }}>{success}</div>}

          {/* Fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "register" && (
              <div>
                <label style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#5a6880", display: "block", marginBottom: 8 }}>Nombre</label>
                <input style={inputStyle} placeholder="Tu nombre" value={name} onChange={e => setName(e.target.value)} />
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#5a6880", display: "block", marginBottom: 8 }}>Email</label>
              <input type="email" style={inputStyle} placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && (mode === "reset" ? handleReset() : handleSubmit())} />
            </div>
            {mode !== "reset" && (
              <div>
                <label style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#5a6880", display: "block", marginBottom: 8 }}>Contraseña</label>
                <input type="password" style={inputStyle} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} />
              </div>
            )}
          </div>

          {/* Main button */}
          {mode === "reset" ? (
            <button style={{ width: "100%", padding: 16, background: "linear-gradient(135deg,#4f8ef7,#2a6fd4)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontSize: 14, fontWeight: 700, fontFamily: "'Georgia',serif", marginTop: 22, opacity: loading ? 0.6 : 1 }} onClick={handleReset} disabled={loading}>
              {loading ? "Enviando..." : "Enviar email →"}
            </button>
          ) : (
            <button style={{ width: "100%", padding: 16, background: "linear-gradient(135deg,#4f8ef7,#2a6fd4)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontSize: 14, fontWeight: 700, fontFamily: "'Georgia',serif", marginTop: 22, opacity: loading ? 0.6 : 1 }} onClick={handleSubmit} disabled={loading}>
              {loading ? "Cargando..." : mode === "login" ? "Entrar →" : "Crear cuenta →"}
            </button>
          )}

          {/* Forgot password link — only on login */}
          {mode === "login" && (
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <span style={{ fontSize: 13, color: "#4f8ef7", cursor: "pointer" }} onClick={() => { setMode("reset"); setError(""); setSuccess(""); }}>
                ¿Olvidaste tu contraseña?
              </span>
            </div>
          )}

          {/* Divider — only on login/register */}
          {mode !== "reset" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                <span style={{ fontSize: 11, color: "#3e4a5a", letterSpacing: 2 }}>O</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
              </div>
              <button style={{ width: "100%", padding: 15, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#c8d4e4", cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontSize: 13, fontFamily: "'Georgia',serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }} onClick={handleGoogle} disabled={loading}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                Continuar con Google
              </button>
            </>
          )}

          {/* Footer links */}
          <div style={{ textAlign: "center", marginTop: 24, fontSize: 14, color: "#5a6880" }}>
            {mode === "login" && <>¿No tienes cuenta? <span style={{ color: "#4f8ef7", cursor: "pointer" }} onClick={() => { setMode("register"); setError(""); setSuccess(""); }}>Regístrate</span></>}
            {mode === "register" && <>¿Ya tienes cuenta? <span style={{ color: "#4f8ef7", cursor: "pointer" }} onClick={() => { setMode("login"); setError(""); setSuccess(""); }}>Inicia sesión</span></>}
            {mode === "reset" && <span style={{ color: "#4f8ef7", cursor: "pointer" }} onClick={() => { setMode("login"); setError(""); setSuccess(""); }}>← Volver al login</span>}
          </div>

        </div>
      </div>
    </div>
  );
}
