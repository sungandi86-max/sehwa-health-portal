import { validateFirestoreDb } from "../../common/firestoreResources.js";
import { firebaseRuntimePolicy } from "../../common/firebaseEnvironment.js";
import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

import { initializeFirebaseAdmin, validatedAdminConfiguration } from "./firebaseAdminInitialization.js";

const adminSdk = { cert, getApps, initializeApp };
const LOCAL_ENV_FILE = ".env.local";

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

  if (serviceAccountJson) {
    return JSON.parse(serviceAccountJson);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    return JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"));
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    return JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
  }

  return null;
}

export function getFirebaseServiceAccount() {
  loadLocalEnv();
  return validatedAdminConfiguration(process.env, getServiceAccount).account;
}

export function getFirebaseAdminApp() {
  loadLocalEnv();
  return initializeFirebaseAdmin({ context: process.env, readAccount: getServiceAccount, sdk: adminSdk });
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminDb() {
  const app = getFirebaseAdminApp(); // Loads supported local configuration before resolving policy.
  return validateFirestoreDb(firebaseRuntimePolicy(process.env), getFirestore(app));
}

export function getFirebaseAdminMessaging() {
  return getMessaging(getFirebaseAdminApp());
}
