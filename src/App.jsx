import { useAuth, AuthProvider } from "./AuthContext";
import { auth } from "./firebase";
import { signOut } from "firebase/auth";
import LoginPage from "./components/LoginPage";
import AdminDashboard from "./components/AdminDashboard";
import UserDashboard from "./components/UserDashboard";

function AppInner() {
  const { user, profile, loading } = useAuth();

  if (loading) return (
    <div style={{
      minHeight: "100vh", background: "#080c14",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Georgia', serif", color: "#388bff", letterSpacing: 4,
      fontSize: 12, textTransform: "uppercase",
    }}>
      Cargando...
    </div>
  );

  if (!user) return <LoginPage />;

  const logout = () => signOut(auth);

  if (profile?.role === "admin") return <AdminDashboard onLogout={logout} />;
  return <UserDashboard onLogout={logout} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
