import { firebaseRuntimePolicy } from "../../common/firebaseEnvironment.js";
import { PRODUCTION_SHEETS, sheetResource } from "./environmentResources.js";
export class TrainingDeploymentError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export function trainingEnvironment(context = process.env) {
  const { environment } = firebaseRuntimePolicy(context);
  return ["qa", "production"].includes(environment) ? environment : null;
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

export const DEFAULT_HEALTH_SPREADSHEET_ID = PRODUCTION_SHEETS.staff;

export function trainingSpreadsheetId(context = process.env) {
  return sheetResource("staff", context);
}

export function trainingCenterSpreadsheetId(context = process.env) {
  return sheetResource("staff", context);
}
