import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCSIwxcdU2x5g8BhNLUckWoNFU7uWSHU94",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "sehwa-health-portal-v2.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "sehwa-health-portal-v2",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "sehwa-health-portal-v2.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "30487759503",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:30487759503:web:c97b1169e3bc2318647efa",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, db, GoogleAuthProvider, googleProvider };
