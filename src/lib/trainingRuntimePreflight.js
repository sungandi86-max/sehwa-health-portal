export const TRAINING_RUNTIME_CHECKS = [
  { key: "qrSecretConfigured", label: "QR secret 설정" },
  { key: "qrSecretValid", label: "QR secret 유효성" },
  { key: "signatureStorageConfigured", label: "서명 저장소 설정" },
  { key: "signatureDriveAuthReady", label: "Google Drive 인증" },
  { key: "signatureDriveRootReady", label: "서명 저장소 초기화" },
  { key: "signatureDriveRootPrivate", label: "서명 폴더 비공개" },
  { key: "signatureStorageReadReady", label: "서명 읽기 준비" },
  { key: "signatureSheetReady", label: "서명 원장 준비" },
  { key: "firebaseAdminReady", label: "Firebase Admin 준비" },
];

export const TRAINING_STORAGE_BOOTSTRAP_CONFIRM_MESSAGE =
  "서명 저장소용 비공개 Google Drive 폴더를 생성합니다. 이 작업은 최초 1회만 필요합니다.";

export function getTrainingStorageBootstrapUiState(result) {
  const rootReady = result?.checks?.some(({ key, passed }) => key === "signatureDriveRootReady" && passed === true) === true;
  if (rootReady) return { visible: true, enabled: false, completed: true, label: "서명 저장소 초기화 완료" };
  if (result?.needsBootstrap === true) return { visible: true, enabled: true, completed: false, label: "서명 저장소 초기화" };
  return { visible: false, enabled: false, completed: false, label: "서명 저장소 초기화" };
}

export async function performTrainingStorageBootstrap({ confirmAction, bootstrapStorage, refresh }) {
  if (!confirmAction(TRAINING_STORAGE_BOOTSTRAP_CONFIRM_MESSAGE)) return { status: "cancelled" };
  try {
    await bootstrapStorage();
    return { status: "success", result: await refresh() };
  } catch {
    return { status: "error" };
  }
}

export function summarizeTrainingRuntimePreflight(response) {
  const checks = TRAINING_RUNTIME_CHECKS.map(({ key, label }) => ({ key, label, passed: response?.checks?.[key] === true }));
  return { ready: response?.ok === true && checks.every(({ passed }) => passed),
    needsBootstrap: response?.needsBootstrap === true, checks };
}
