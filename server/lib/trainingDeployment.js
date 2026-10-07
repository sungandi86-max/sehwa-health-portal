export class TrainingDeploymentError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export function trainingEnvironment(context = process.env) {
  if (context.VERCEL_ENV === "preview" && context.VERCEL_GIT_COMMIT_REF === "qa") return "qa";
  if (context.VERCEL_ENV === "production" && context.VERCEL_GIT_COMMIT_REF === "main") return "production";
  return null;
}

export function requireTrainingEnvironment(context = process.env) {
  const environment = trainingEnvironment(context);
  if (!environment) {
    throw new TrainingDeploymentError("교육센터 쓰기는 승인된 배포 환경에서만 가능합니다.", "training-deployment-not-allowed");
  }
  return environment;
}

export function trainingLockCollection(context = process.env) {
  return `training_attendance_locks_${requireTrainingEnvironment(context)}`;
}

export const DEFAULT_HEALTH_SPREADSHEET_ID = "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs";

export function trainingSpreadsheetId(context = process.env) {
  const configured = String(context.STAFF_ROSTER_SOURCE_SPREADSHEET_ID || "").trim();
  if (trainingEnvironment(context) === "qa") {
    if (!configured || configured === DEFAULT_HEALTH_SPREADSHEET_ID) {
      throw new TrainingDeploymentError("QA 교육센터 워크북이 설정되지 않았습니다.", "training-qa-workbook-required");
    }
    return configured;
  }
  if (trainingEnvironment(context) === "production") return DEFAULT_HEALTH_SPREADSHEET_ID;
  return configured || DEFAULT_HEALTH_SPREADSHEET_ID;
}

export function trainingCenterSpreadsheetId(context = process.env) {
  const environment = trainingEnvironment(context);
  if (environment === "production") return DEFAULT_HEALTH_SPREADSHEET_ID;
  const approvedFeature = context.VERCEL_ENV === "preview" && context.VERCEL_GIT_COMMIT_REF === "feature/training-center-phase2";
  if (environment !== "qa" && !approvedFeature) {
    throw new TrainingDeploymentError("이 배포 환경에서는 교육센터에 접근할 수 없습니다.", "training-environment-not-allowed");
  }
  const configured = String(context.STAFF_ROSTER_SOURCE_SPREADSHEET_ID || "").trim();
  if (!configured || configured === DEFAULT_HEALTH_SPREADSHEET_ID) {
    throw new TrainingDeploymentError("교육센터 QA 워크북이 설정되지 않았습니다.", "training-workbook-not-configured");
  }
  return configured;
}
