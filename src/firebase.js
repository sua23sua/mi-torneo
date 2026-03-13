import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDRT2FFy9KZPZeAZ3CX7Wwd1EP1VMILPbQ",
  authDomain: "mi-torneo-1e637.firebaseapp.com",
  projectId: "mi-torneo-1e637",
  storageBucket: "mi-torneo-1e637.firebasestorage.app",
  messagingSenderId: "1555929038",
  appId: "1:1555929038:web:9ec013504d9cd52631bd9f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();