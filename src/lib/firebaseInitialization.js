import { FirebaseConfigurationError, PRODUCTION_FIREBASE_PROJECT_ID, rejectFirebaseConfiguration, validateFirebaseProject } from "../../common/firebaseEnvironment.js";
import { resolveFirebaseAuthDomain } from "./firebaseAuthDomain.js";

const PRODUCTION_DEFAULTS = {
  apiKey: "AIzaSyCSIwxcdU2x5g8BhNLUckWoNFU7uWSHU94",
  projectId: PRODUCTION_FIREBASE_PROJECT_ID,
  storageBucket: "sehwa-health-portal-v2.firebasestorage.app",
  messagingSenderId: "30487759503",
  appId: "1:30487759503:web:c97b1169e3bc2318647efa",
};

// SDK functions are injected so validation and initialization can be tested offline.
export function initializeFirebaseClient({ policy, env = {}, hostname = "", sdk }) {
  if (env.VITE_APP_ENV && env.VITE_APP_ENV !== policy?.environment) rejectFirebaseConfiguration("client-environment");
  if ((hostname === "sehwa-health-portal-git-qa-sungandi86-maxs-projects.vercel.app" && policy?.environment === "production") ||
      (hostname === "sehwa-health-portal.vercel.app" && policy?.environment !== "production")) {
    rejectFirebaseConfiguration("client-host");
  }
  const defaults = policy?.environment === "production" ? PRODUCTION_DEFAULTS : {};
  const config = Object.fromEntries(Object.keys(PRODUCTION_DEFAULTS).map((key) => {
    const variable = { apiKey: "API_KEY", projectId: "PROJECT_ID", storageBucket: "STORAGE_BUCKET",
      messagingSenderId: "MESSAGING_SENDER_ID", appId: "APP_ID" }[key];
    return [key, env[`VITE_FIREBASE_${variable}`] || defaults[key]];
  }));
  validateFirebaseProject(policy, config.projectId);
  if (Object.values(config).some((value) => typeof value !== "string" || !value.trim())) rejectFirebaseConfiguration("client-config");
  if (policy.environment !== "production") {
    // Auth uses apiKey to select a project: reject known production identifiers too.
    if (["apiKey", "messagingSenderId", "appId"].some((key) => config[key] === PRODUCTION_DEFAULTS[key])) {
      rejectFirebaseConfiguration("production-client-identity");
    }
    if (!/^\d+$/.test(config.messagingSenderId) ||
        !config.appId.startsWith(`1:${config.messagingSenderId}:web:`)) rejectFirebaseConfiguration("client-identity");
    // Never inherit the production redirect domain or bucket in QA/local.
    if (env.VITE_FIREBASE_AUTH_DOMAIN !== `${config.projectId}.firebaseapp.com` ||
        ![`${config.projectId}.appspot.com`, `${config.projectId}.firebasestorage.app`].includes(config.storageBucket)) {
      rejectFirebaseConfiguration("client-resource");
    }
    config.authDomain = env.VITE_FIREBASE_AUTH_DOMAIN;
  } else {
    config.authDomain = resolveFirebaseAuthDomain(hostname, env.VITE_FIREBASE_AUTH_DOMAIN);
    if (![`${PRODUCTION_FIREBASE_PROJECT_ID}.firebaseapp.com`, "sehwa-health-portal.vercel.app"].includes(config.authDomain)) {
      rejectFirebaseConfiguration("client-resource");
    }
    if (![`${PRODUCTION_FIREBASE_PROJECT_ID}.appspot.com`, `${PRODUCTION_FIREBASE_PROJECT_ID}.firebasestorage.app`].includes(config.storageBucket)) {
      rejectFirebaseConfiguration("client-resource");
    }
  }
  try {
    const apps = sdk.getApps();
    if (apps.length > 1) rejectFirebaseConfiguration("existing-app");
    if (apps.length && Object.entries(config).some(([key, value]) => apps[0].options?.[key] !== value)) {
      rejectFirebaseConfiguration("existing-app");
    }
    const app = apps.length ? sdk.getApp() : sdk.initializeApp(config);
    return { app, auth: sdk.getAuth(app), db: sdk.getFirestore(app) };
  } catch (error) {
    if (error instanceof FirebaseConfigurationError) throw error;
    rejectFirebaseConfiguration("client-initialization");
  }
}
