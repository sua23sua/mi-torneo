import { useState } from "react";
import { auth, db, googleProvider } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";

const S = {
  wrap: {
    minHeight: "100vh", background: "#080c14",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Georgia', 'Times New Roman', serif",
    position: "relative", overflow: "hidden",
  },
  bg: {
    position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
    background: `
      radial-gradient(ellipse 70% 60% at 20% 30%, rgba(56,139,255,0.08) 0%, transparent 60%),
      radial-gradient(ellipse 50% 70% at 80% 70%, rgba(255,180,56,0.06) 0%, transparent 60%),
      repeating-linear-gradient(0deg, transparent, transparent 50px, rgba(255,255,255,0.012) 50px, rgba(255,255,255,0.012) 51px),
      repeating-linear-gradient(90deg, transparent, transparent 50px, rgba(255,255,255,0.012) 50px, rgba(255,255,255,0.012) 51px)
    `,
  },
  card: {
    position: "relative", zIndex: 5,
    width: "100%", maxWidth: 420,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(20px)",
    padding: "48px 40px",
    boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
  },
  logo: {
    display: "flex", alignItems: "center", gap: 12, marginBottom: 40, justifyContent: "center",
  },
  logoIcon: {
    width: 36, height: 36, background: "#388bff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 18, color: "#fff", fontWeight: 900,
  },
  logoText: {
    fontSize: 20, fontWeight: 700, letterSpacing: 3,
    textTransform: "uppercase", color: "#388bff",
  },
  label: {
    fontSize: 10, letterSpacing: 3, textTransform: "uppercase",
    color: "#6a7890", display: "block", marginBottom: 8,
  },
  input: {
    width: "100%", padding: "11px 14px", fontSize: 14,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    color: "#e8edf4", boxSizing: "border-box", outline: "none",
    fontFamily: "'Georgia', serif", transition: "border-color 0.2s",
  },
  btn: {
    width: "100%", padding: 14, background: "#388bff",
    border: "none", color: "#fff", cursor: "pointer",
    letterSpacing: 3, textTransform: "uppercase", fontSize: 12,
    fontWeight: 700, fontFamily: "'Georgia', serif", marginTop: 8,
  },
  btnGoogle: {
    width: "100%", padding: 12, background: "transparent",
    border: "1px solid rgba(255,255,255,0.15)", color: "#c8d4e4",
    cursor: "pointer", letterSpacing: 2, textTransform: "uppercase",
    fontSize: 11, fontFamily: "'Georgia', serif", display: "flex",
    alignItems: "center", justifyContent: "center", gap: 10,
  },
  divider: {
    display: "flex", alignItems: "center", gap: 12, margin: "20px 0",
  },
  divLine: { flex: 1, height: 1, background: "rgba(255,255,255,0.08)" },
  divText: { fontSize: 10, color: "#4a5568", letterSpacing: 2 },
  toggle: {
    textAlign: "center", marginTop: 24, fontSize: 12, color: "#6a7890",
  },
  toggleLink: {
    color: "#388bff", cursor: "pointer", textDecoration: "underline",
  },
  error: {
    background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)",
    color: "#ff8080", padding: "10px 14px", fontSize: 12,
    marginBottom: 16, letterSpacing: 0.5,
  },
};

async function ensureUserDoc(firebaseUser, extra = {}) {
  const ref = doc(db, "users", firebaseUser.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      name: firebaseUser.displayName || extra.name || firebaseUser.email.split("@")[0],
      role: "user",
      createdAt: new Date().toISOString(),
    });
  }
}

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(""); setLoading(true);
    try {
      if (mode === "register") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await ensureUserDoc(cred.user, { name });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (e) {
      const msgs = {
        "auth/email-already-in-use": "Ese email ya está registrado",
        "auth/invalid-email": "Email no válido",
        "auth/weak-password": "La contraseña debe tener al menos 6 caracteres",
        "auth/invalid-credential": "Email o contraseña incorrectos",
      };
      setError(msgs[e.code] || "Error al iniciar sesión");
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setError(""); setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await ensureUserDoc(cred.user);
    } catch (e) {
      setError("Error al iniciar sesión con Google");
    }
    setLoading(false);
  }

  return (
    <div style={S.wrap}>
      <div style={S.bg} />
      <style>{`
        input:focus { border-color: #388bff !important; }
        input::placeholder { color: rgba(200,212,228,0.25) !important; }
        button:hover { opacity: 0.85; }
      `}</style>
      <div style={S.card}>
        <div style={S.logo}>
          <div style={S.logoIcon}>⚔</div>
          <span style={S.logoText}>TournamentOS</span>
        </div>

        {error && <div style={S.error}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {mode === "register" && (
            <div>
              <label style={S.label}>Nombre</label>
              <input style={S.input} placeholder="Tu nombre" value={name} onChange={e => setName(e.target.value)} />
            </div>
          )}
          <div>
            <label style={S.label}>Email</label>
            <input style={S.input} type="email" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()} />
          </div>
          <div>
            <label style={S.label}>Contraseña</label>
            <input style={S.input} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()} />
          </div>
        </div>

        <button style={{ ...S.btn, marginTop: 24, opacity: loading ? 0.6 : 1 }} onClick={handleSubmit} disabled={loading}>
          {loading ? "Cargando..." : mode === "login" ? "Entrar →" : "Crear cuenta →"}
        </button>

        <div style={S.divider}>
          <div style={S.divLine} /><span style={S.divText}>O</span><div style={S.divLine} />
        </div>

        <button style={S.btnGoogle} onClick={handleGoogle} disabled={loading}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continuar con Google
        </button>

        <div style={S.toggle}>
          {mode === "login" ? (
            <>¿No tienes cuenta? <span style={S.toggleLink} onClick={() => { setMode("register"); setError(""); }}>Regístrate</span></>
          ) : (
            <>¿Ya tienes cuenta? <span style={S.toggleLink} onClick={() => { setMode("login"); setError(""); }}>Inicia sesión</span></>
          )}
        </div>
      </div>
    </div>
  );
}
