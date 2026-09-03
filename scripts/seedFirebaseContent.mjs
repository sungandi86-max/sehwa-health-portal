import process from "node:process";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { initializeFirebaseAdmin, loadLocalEnv } from "./lib/firebaseAdminCli.mjs";

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

async function seedContent() {
  loadLocalEnv();
  initializeFirebaseAdmin();

  const db = getFirestore();

  await db.runTransaction(async (transaction) => {
    const refs = seedDocuments.map((seedDocument) => db.collection(seedDocument.collectionName).doc(seedDocument.documentId));
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));

    seedDocuments.forEach((seedDocument, index) => {
      const snapshot = snapshots[index];
      const timestamps = snapshot.exists
        ? { updatedAt: FieldValue.serverTimestamp() }
        : { createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };

      transaction.set(refs[index], { ...seedDocument.data, ...timestamps }, { merge: true });
    });
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
