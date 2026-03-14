import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile = null;
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      if (firebaseUser) {
        unsubProfile = onSnapshot(doc(db, "users", firebaseUser.uid), async (snap) => {
          if (snap.exists()) {
            setProfile(snap.data());
          } else {
            const defaultProfile = {
              uid: firebaseUser.uid, email: firebaseUser.email,
              name: firebaseUser.displayName || firebaseUser.email.split("@")[0],
              role: "user", teamId: null,
              createdAt: new Date().toISOString(),
            };
            await setDoc(doc(db, "users", firebaseUser.uid), defaultProfile);
            setProfile(defaultProfile);
          }
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => { unsubAuth(); if (unsubProfile) unsubProfile(); };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
