import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, OAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { initializeFirebaseClient } from "./firebaseInitialization.js";

// Vite supplies only non-secret policy fields from server-owned configuration.
const policy = typeof __FIREBASE_RUNTIME_POLICY__ === "undefined"
  ? { environment: "unknown", qaProjectId: "" } : __FIREBASE_RUNTIME_POLICY__;
const { app, auth, db } = initializeFirebaseClient({
  policy,
  env: import.meta.env,
  hostname: typeof window !== "undefined" ? window.location.hostname : "",
  sdk: { initializeApp, getApp, getApps, getAuth, getFirestore },
});
const googleProvider = new GoogleAuthProvider();
const microsoftProvider = new OAuthProvider("microsoft.com");
const microsoftTenantId = import.meta.env.VITE_MICROSOFT_TENANT_ID || "sehwa-gs.hs.kr";

microsoftProvider.setCustomParameters({ tenant: microsoftTenantId });

export { app, auth, db, GoogleAuthProvider, googleProvider, microsoftProvider };
