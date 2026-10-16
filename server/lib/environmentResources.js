import { firebaseRuntimePolicy } from "../../common/firebaseEnvironment.js";

export const PRODUCTION_SHEETS = Object.freeze({
  staff: "1ZCsztyIDuvcTzGdE4zZvexJmLuz8aNIIiuGuSyIBwbs",
  research: "1rn4CVt41lq2f_o8Uiodij4h_R4Q9lVbpPMNFJjy6-IM",
});
export const PRODUCTION_DRIVE_FOLDERS = Object.freeze([
  "19foLN446v5ggGN6hxLBuH8tNAQuSXgtM", "1MfxNVL1muROzpi1ZbV7WDWr4SKMU7ghm",
  "1T2yMxeKmab1SDqdVCRgdxpHMx3Fu2EO6", "1hUmRQ8kK0OYx_h4IxzFy8GXv9Ilm1w63",
]);
const KNOWN_PRODUCTION_GAS_IDS = [
  "AKfycby74IilU88WnpwbJNNcXxO1llF8VdBuhrMVk5PnFUzZy0DfXm-dSqyBhPB3_Uu2KNQ",
  "AKfycbxVONfUYNf63cvJhiehe8N9TAka14MuKAXxXDVQG79H_R1DeX4kwXfHtjo25hDGsYFU",
];
export class ResourcePolicyError extends Error {
  constructor(code) {
    super("External resource configuration rejected.");
    this.name = "ResourcePolicyError";
    this.code = code;
    this.status = 503;
  }
}
const deny = (code) => { throw new ResourcePolicyError(code); };
const list = (value) => String(value || "").split(",").map((id) => id.trim()).filter(Boolean);
const identifier = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{3,200}$/.test(id);
export function resourceEnvironment(context = process.env) {
  const environment = firebaseRuntimePolicy(context).environment;
  if (environment === "unknown") deny("ENVIRONMENT_UNRESOLVED");
  return environment;
}
function prefix(environment) { return environment === "production" ? "" : `${environment.toUpperCase()}_`; }
function opposingValues(context, environment, suffixes) {
  return ["production", "qa", "local"].filter((e) => e !== environment)
    .flatMap((e) => suffixes.map((s) => context[`${prefix(e)}${s}`])).filter(Boolean);
}
export function gasResource(kind, context = process.env) {
  const environment = resourceEnvironment(context);
  const suffix = { submission: "SUBMISSION_GAS_URL", portal: "PORTAL_GAS_URL", studentCare: "STUDENT_CARE_GAS_URL" }[kind];
  if (!suffix) deny("RESOURCE_ENV_MISMATCH");
  const url = environment === "production" ? context.GAS_URL || context.VITE_GAS_BASE_URL
    : context[`${prefix(environment)}${suffix}`];
  if (!url) deny(environment === "qa" ? "QA_GAS_REQUIRED" : "RESOURCE_MISSING");
  const match = typeof url === "string" && url.match(/^https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec$/);
  if (!match) deny("RESOURCE_ENV_MISMATCH");
  const otherUrls = opposingValues(context, environment, ["SUBMISSION_GAS_URL", "PORTAL_GAS_URL", "STUDENT_CARE_GAS_URL"]);
  if (environment !== "production") otherUrls.push(context.GAS_URL, context.VITE_GAS_BASE_URL);
  if (otherUrls.includes(url) || (environment !== "production" && KNOWN_PRODUCTION_GAS_IDS.includes(match[1]))) deny("RESOURCE_ENV_MISMATCH");
  return url;
}
export function resourceSecret(kind, context = process.env) {
  const environment = resourceEnvironment(context);
  const suffix = { submission: "SUBMISSION_PROXY_SECRET", studentCare: "STUDENT_CARE_PROXY_SECRET", qr: "TRAINING_QR_SECRET" }[kind];
  if (!suffix) deny("RESOURCE_ENV_MISMATCH");
  // Select by binding name only. Never compare, log or include secret values in errors.
  const secret = context[`${prefix(environment)}${suffix}`];
  if (typeof secret !== "string" || !secret.trim()) deny(environment === "qa" ? "QA_RESOURCE_MISSING" : "RESOURCE_MISSING");
  return secret;
}
export function sheetResource(kind, context = process.env, access = "read") {
  const environment = resourceEnvironment(context);
  const suffix = kind === "staff" ? "STAFF_ROSTER_SOURCE_SPREADSHEET_ID" : kind === "research" ? "RESEARCH_TRAINING_SPREADSHEET_ID" : null;
  if (!suffix) deny("RESOURCE_ENV_MISMATCH");
  const id = environment === "production" ? PRODUCTION_SHEETS[kind] : context[`${prefix(environment)}${suffix}`];
  if (!id) deny(environment === "qa" ? "QA_SHEET_REQUIRED" : "RESOURCE_MISSING");
  assertSheetResource(id, context, access);
  return id;
}
export function assertSheetResource(id, context = process.env, access = "read") {
  const environment = resourceEnvironment(context);
  if (!identifier(id) || !["read", "write"].includes(access)) deny("RESOURCE_ENV_MISMATCH");
  const suffixes = ["STAFF_ROSTER_SOURCE_SPREADSHEET_ID", "RESEARCH_TRAINING_SPREADSHEET_ID"];
  if (environment === "production") {
    for (const other of ["qa", "local"]) {
      const selected = suffixes.some((suffix) => context[`${prefix(other)}${suffix}`] === id);
      if (selected && !list(context[`${prefix(other)}SHARED_READONLY_SHEET_IDS`]).includes(id)) deny("RESOURCE_ENV_MISMATCH");
    }
    return { policy: "productionOnly" };
  }
  const shared = list(context[`${prefix(environment)}SHARED_READONLY_SHEET_IDS`]);
  if (shared.includes(id)) {
    if (access !== "read") deny("SHARED_RESOURCE_READ_ONLY");
    return { policy: "sharedReadOnly" };
  }
  if (Object.values(PRODUCTION_SHEETS).includes(id) || opposingValues(context, environment, suffixes).includes(id)) deny("RESOURCE_ENV_MISMATCH");
  if (!suffixes.some((suffix) => context[`${prefix(environment)}${suffix}`] === id)) deny(environment === "qa" ? "QA_SHEET_REQUIRED" : "RESOURCE_MISSING");
  return { policy: environment === "qa" ? "qaDedicated" : "localDedicated" };
}
export function driveFolderResource(kind, context = process.env) {
  const environment = resourceEnvironment(context);
  const suffix = { cpr: "CPR_DRIVE_FOLDER_ID", tb: "TB_CERTIFICATE_DRIVE_FOLDER_ID", student_tb_reply: "STUDENT_REPLY_DRIVE_FOLDER_ID" }[kind];
  if (!suffix) deny("RESOURCE_ENV_MISMATCH");
  const suffixes = ["CPR_DRIVE_FOLDER_ID", "TB_CERTIFICATE_DRIVE_FOLDER_ID", "STUDENT_REPLY_DRIVE_FOLDER_ID"];
  if (environment === "production") {
    // Apps Script retains its existing canonical folder selection; never send a QA folder.
    if (opposingValues(context, environment, suffixes).some((id) => PRODUCTION_DRIVE_FOLDERS.includes(id))) deny("RESOURCE_ENV_MISMATCH");
    return "";
  }
  const id = context[`${prefix(environment)}${suffix}`];
  if (!id) deny(environment === "qa" ? "QA_DRIVE_REQUIRED" : "RESOURCE_MISSING");
  if (!identifier(id) || PRODUCTION_DRIVE_FOLDERS.includes(id) || opposingValues(context, environment, suffixes).includes(id) ||
      list(context.PRODUCTION_DRIVE_FOLDER_IDS).includes(id)) deny("RESOURCE_ENV_MISMATCH");
  return id;
}
export function trainingDriveConfig(context = process.env) {
  const environment = resourceEnvironment(context);
  const start = `${prefix(environment)}TRAINING_DRIVE_OAUTH_`;
  const result = { clientId: context[`${start}CLIENT_ID`], clientSecret: context[`${start}CLIENT_SECRET`], refreshToken: context[`${start}REFRESH_TOKEN`] };
  if (Object.values(result).some((value) => typeof value !== "string" || !value.trim())) deny(environment === "qa" ? "QA_DRIVE_REQUIRED" : "RESOURCE_MISSING");
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, value.trim()]));
}
export function sendResourceError(res, error) {
  return res.status(503).json({ ok: false, success: false, status: "error", result: "error",
    code: error.code, message: "외부 연동 자원 설정을 확인해 주세요." });
}
