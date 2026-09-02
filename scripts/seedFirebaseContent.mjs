import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "sehwa-health-portal-v2";
const ENV_FILE = ".env.local";

const seedDocuments = [
  {
    collectionName: "faqs",
    documentId: "seed-health-room-usage",
    data: {
      question: "보건실은 언제 이용할 수 있나요?",
      answer: "수업 중 이용 시 담당 교사의 허락을 받고 방문해 주세요.",
      category: "보건실 이용",
      keywords: ["보건실", "이용"],
      enabled: true,
      order: 1,
    },
  },
  {
    collectionName: "checkups",
    documentId: "seed-staff-tb-checkup",
    data: {
      title: "교직원 결핵검진 안내",
      description: "교직원 결핵검진 대상과 제출 방법을 확인해 주세요.",
      target: "전 교직원",
      status: "안내 중",
      operatingStatus: null,
      details: ["검진 대상 확인", "확인증 제출 방법 안내"],
      enabled: true,
      startAt: null,
      endAt: null,
      linkUrl: null,
      linkLabel: null,
      displayMode: "link",
      imageUrl: null,
      downloadUrl: null,
      order: 1,
    },
  },
  {
    collectionName: "education_resources",
    documentId: "seed-cpr-resource",
    data: {
      title: "심폐소생술 교육자료",
      description: "교직원 심폐소생술 교육에 활용할 수 있는 자료입니다.",
      category: "응급처치",
      target: "교직원",
      duration: "자율 확인",
      schedule: "상시",
      confirmation: "자료 확인 후 필요 시 보건실로 문의",
      status: "자료",
      enabled: true,
      linkUrl: "https://example.com",
      linkLabel: "자료 열기",
      order: 1,
    },
  },
];

function loadLocalEnv() {
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

function getCredentialOptions() {
  const explicitCredentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (explicitCredentialPath) {
    const resolvedPath = path.resolve(explicitCredentialPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`서비스 계정 파일을 찾을 수 없습니다: ${resolvedPath}`);
    }

    return {
      credential: cert(resolvedPath),
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || PROJECT_ID,
    };
  }

  if (getApplicationDefaultCredentialsPath()) {
    return {
      credential: applicationDefault(),
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || PROJECT_ID,
    };
  }

  throw new Error("로컬 Firebase Admin 인증 경로가 없습니다. .env.local에 FIREBASE_SERVICE_ACCOUNT_PATH를 설정해 주세요.");
}

function getApplicationDefaultCredentialsPath() {
  const appData = process.env.APPDATA;
  if (!appData) return "";

  const adcPath = path.join(appData, "gcloud", "application_default_credentials.json");
  return fs.existsSync(adcPath) ? adcPath : "";
}

async function seedContent() {
  loadLocalEnv();

  if (!getApps().length) {
    initializeApp(getCredentialOptions());
  }

  const db = getFirestore();

  await db.runTransaction(async (transaction) => {
    for (const seedDocument of seedDocuments) {
      const ref = db.collection(seedDocument.collectionName).doc(seedDocument.documentId);
      const snapshot = await transaction.get(ref);
      const timestamps = snapshot.exists
        ? { updatedAt: FieldValue.serverTimestamp() }
        : { createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };

      transaction.set(ref, { ...seedDocument.data, ...timestamps }, { merge: true });
    }
  });

  for (const seedDocument of seedDocuments) {
    console.log(`${seedDocument.collectionName}/${seedDocument.documentId}`);
  }
}

// no-excuse-ok: catch - CLI boundary prints a concise failure and exits non-zero.
seedContent().catch((error) => {
  console.error("Firebase content seed failed.");
  console.error(error instanceof Error ? error.message : error);
  console.error(
    "FIREBASE_SERVICE_ACCOUNT_PATH 또는 GOOGLE_APPLICATION_CREDENTIALS에 로컬 서비스 계정 JSON 경로를 설정한 뒤 다시 실행해 주세요."
  );
  process.exitCode = 1;
});
