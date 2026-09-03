import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";

const ENV_FILE = ".env.local";
const PROJECT_ID = "sehwa-health-portal-v2";

export function loadLocalEnv() {
  const envPath = path.resolve(ENV_FILE);
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function getCredentialPath() {
  return process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
}

export function getProjectId() {
  return process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || PROJECT_ID;
}

export function getApplicationDefaultCredentialsPath() {
  const appData = process.env.APPDATA;
  if (!appData) return "";

  const adcPath = path.join(appData, "gcloud", "application_default_credentials.json");
  return fs.existsSync(adcPath) ? adcPath : "";
}

export function readServiceAccountJson() {
  const credentialPath = getCredentialPath();
  if (!credentialPath) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH 또는 GOOGLE_APPLICATION_CREDENTIALS가 필요합니다.");
  }

  const resolvedPath = path.resolve(credentialPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`서비스 계정 파일을 찾을 수 없습니다: ${resolvedPath}`);
  }

  return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
}

export function initializeFirebaseAdmin() {
  const credentialPath = getCredentialPath();
  if (getApps().length) return;

  if (credentialPath) {
    const resolvedPath = path.resolve(credentialPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`서비스 계정 파일을 찾을 수 없습니다: ${resolvedPath}`);
    }

    initializeApp({ credential: cert(resolvedPath), projectId: getProjectId() });
    return;
  }

  if (getApplicationDefaultCredentialsPath()) {
    initializeApp({ credential: applicationDefault(), projectId: getProjectId() });
    return;
  }

  throw new Error("Firebase Admin 인증 경로가 없습니다. FIREBASE_SERVICE_ACCOUNT_PATH를 설정해 주세요.");
}
