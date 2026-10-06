export const TRAINING_RUNTIME_CHECKS = [
  { key: "qrSecretConfigured", label: "QR secret 설정" },
  { key: "qrSecretValid", label: "QR secret 유효성" },
  { key: "driveFolderConfigured", label: "Drive 폴더 설정" },
  { key: "driveFolderAccessible", label: "Drive 접근" },
  { key: "driveFolderWritable", label: "Drive 쓰기 가능" },
  { key: "driveFolderPrivate", label: "Drive 비공개" },
  { key: "signatureSheetReady", label: "서명 Sheet 준비" },
  { key: "firebaseAdminReady", label: "Firebase Admin 준비" },
];

export function summarizeTrainingRuntimePreflight(response) {
  const checks = TRAINING_RUNTIME_CHECKS.map(({ key, label }) => ({ key, label, passed: response?.checks?.[key] === true }));
  return { ready: response?.ok === true && checks.every(({ passed }) => passed), checks };
}
