import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const DEFAULT_PROJECT_ID = "sehwa-health-portal-v2";
const LOCAL_ENV_FILE = ".env.local";

export function logDiagnostic(scope, event, fields = {}) {
  const details = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.log(`[${scope}] ${event}${details ? ` ${details}` : ""}`);
}

export function getErrorCode(error) {
  if (error && typeof error === "object" && "code" in error) {
    return String(error.code);
  }
  return "unknown";
}

export function getErrorName(error) {
  if (error instanceof Error) return error.name;
  return "unknown";
}

function loadLocalEnv() {
  const envPath = path.resolve(LOCAL_ENV_FILE);
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

function getServiceAccount() {
  loadLocalEnv();

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  logDiagnostic("firebase-admin", "env-present", { value: Boolean(serviceAccountJson) });

  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      logDiagnostic("firebase-admin", "json-parse", { value: "success" });
      logDiagnostic("firebase-admin", "project-match", {
        value: serviceAccount.project_id === DEFAULT_PROJECT_ID,
      });
      return serviceAccount;
    } catch (error) {
      logDiagnostic("firebase-admin", "json-parse", { value: "fail", code: getErrorCode(error) });
      throw error;
    }
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
      const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"));
      logDiagnostic("firebase-admin", "base64-parse", { value: "success" });
      logDiagnostic("firebase-admin", "project-match", {
        value: serviceAccount.project_id === DEFAULT_PROJECT_ID,
      });
      return serviceAccount;
    } catch (error) {
      logDiagnostic("firebase-admin", "base64-parse", { value: "fail", code: getErrorCode(error) });
      throw error;
    }
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    logDiagnostic("firebase-admin", "path-parse", { value: "success" });
    logDiagnostic("firebase-admin", "project-match", {
      value: serviceAccount.project_id === DEFAULT_PROJECT_ID,
    });
    return serviceAccount;
  }

  return null;
}

export function getFirebaseAdminApp() {
  if (getApps().length) {
    logDiagnostic("firebase-admin", "initialize", { value: "reuse" });
    return getApps()[0];
  }

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    logDiagnostic("firebase-admin", "initialize", { value: "fail", code: "missing-credential" });
    throw new Error("Firebase Admin 서비스 계정 환경변수가 필요합니다.");
  }

  try {
    const app = initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID,
    });
    logDiagnostic("firebase-admin", "initialize", { value: "success" });
    return app;
  } catch (error) {
    logDiagnostic("firebase-admin", "initialize", { value: "fail", code: getErrorCode(error) });
    throw error;
  }
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminDb() {
  return getFirestore(getFirebaseAdminApp());
}
