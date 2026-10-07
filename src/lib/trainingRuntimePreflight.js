export const TRAINING_RUNTIME_CHECKS = [
  { key: "qrSecretConfigured", label: "QR secret 설정" },
  { key: "qrSecretValid", label: "QR secret 유효성" },
  { key: "signatureStorageConfigured", label: "서명 저장소 설정" },
  { key: "signatureDriveAuthReady", label: "Google Drive 인증" },
  { key: "signatureDriveRootReady", label: "서명 저장소 초기화" },
  { key: "signatureDriveRootPrivate", label: "서명 폴더 비공개" },
  { key: "signatureStorageReadReady", label: "서명 읽기 준비" },
  { key: "signatureSheetReady", label: "서명 Sheet 준비" },
  { key: "firebaseAdminReady", label: "Firebase Admin 준비" },
];

export function summarizeTrainingRuntimePreflight(response) {
  const checks = TRAINING_RUNTIME_CHECKS.map(({ key, label }) => ({ key, label, passed: response?.checks?.[key] === true }));
  return { ready: response?.ok === true && checks.every(({ passed }) => passed),
    needsBootstrap: response?.needsBootstrap === true, checks };
}
