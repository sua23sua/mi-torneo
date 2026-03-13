import { useState } from "react";
import { useAuth, AuthProvider } from "./AuthContext";
import { auth } from "./firebase";
import { signOut } from "firebase/auth";
import LoginPage from "./components/LoginPage";
import AdminDashboard from "./components/AdminDashboard";
import UserDashboard from "./components/UserDashboard";
import PublicPage from "./components/PublicPage";

function AppInner() {
  const { user, profile, loading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#07090f", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Georgia',serif", color: "#4f8ef7", letterSpacing: 4, fontSize: 12, textTransform: "uppercase" }}>
      Cargando...
    </div>
  );

  const logout = () => signOut(auth);

  if (!user) {
    if (showLogin) return <LoginPage onBack={() => setShowLogin(false)} />;
    return <PublicPage onLogin={() => setShowLogin(true)} />;
  }

  if (profile?.role === "admin") return <AdminDashboard onLogout={logout} />;
  return <UserDashboard onLogout={logout} />;
}

export default function App() {
  return <AuthProvider><AppInner /></AuthProvider>;
}
