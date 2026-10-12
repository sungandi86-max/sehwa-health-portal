import { createHash, randomUUID } from "node:crypto";
import { getFirebaseAdminDb } from "./firebaseAdmin.js";
import { submissionEnvironment } from "./submissionConfig.js";
import { buildTbRegistrationStatus, TB_SCREENING_TASK_ID } from "./tbScreeningStatus.js";

export const TB_REGISTRATION_RESPONSE_SHEET = "응답_교직원결핵검진유형선택";
export const TB_REGISTRATION_AUDIT_COLLECTIONS = Object.freeze({
  qa: "tb_registration_requests_qa",
  production: "tb_registration_requests_production",
});
const QA_STATUS_COLLECTION = "staff_submission_status_qa";
const SELECTED_TYPE = "단체검진 신청";

export class TbRegistrationAuditError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}

const cell = (value) => String(value ?? "").trim();
const legacyId = (sheetId, rowNumber) => `legacy_${sheetId}_${rowNumber}`;

export function legacyRowFingerprint({ sheetId, rowNumber, values }) {
  const original = [0, 1, 2, 3, 4].map((index) => String(values[index] ?? ""));
  return createHash("sha256").update(JSON.stringify([sheetId, rowNumber, original])).digest("hex");
}

function sheetTimestamp(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{1,2}) (\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const normalized = `${match[1]}-${match[2]}-${match[3].padStart(2, "0")}T${match[4].padStart(2, "0")}:${match[5]}:${match[6]}+09:00`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function dryRunTbRegistrationRows({ rows, directory, existing = [], sheetId, environment }) {
  if (!TB_REGISTRATION_AUDIT_COLLECTIONS[environment]) throw new Error("승인되지 않은 감사 원장 환경입니다.");
  const byId = new Map(existing.map((item) => [item.requestId, item]));
  const byFingerprint = new Map();
  for (const item of existing) {
    if (!item.sourceFingerprint) continue;
    const ids = byFingerprint.get(item.sourceFingerprint) || new Set();
    ids.add(item.requestId);
    byFingerprint.set(item.sourceFingerprint, ids);
  }
  return rows.map(({ rowNumber, values }) => {
    const [timestamp, name, department, selectedType, note] = [0, 1, 2, 3, 4].map((index) => cell(values[index]));
    const base = { rowNumber, classification: "incomplete", action: "manual-review", staffId: null };
    const submittedAt = sheetTimestamp(timestamp);
    if (!submittedAt || !name || !department || selectedType !== SELECTED_TYPE) return base;
    const nameCandidates = directory.filter((staff) => cell(staff.name) === name);
    const exact = nameCandidates.filter((staff) => cell(staff.department) === department && cell(staff.staffId));
    if (exact.length !== 1) return { ...base, classification: exact.length > 1 ? "ambiguous" : "unmatched" };
    const staffId = cell(exact[0].staffId);
    const requestId = legacyId(sheetId, rowNumber);
    const sourceFingerprint = legacyRowFingerprint({ sheetId, rowNumber, values });
    const document = {
      requestId, staffId, submittedAt, selectedType, status: "received", manualReview: false,
      source: "legacy_sheet", environment, schemaVersion: 1,
      sourceSheet: TB_REGISTRATION_RESPONSE_SHEET, sourceSheetId: sheetId, sourceRow: rowNumber,
      sourceTimestamp: timestamp, sourceName: name, sourceDepartment: department, sourceNote: note,
      sourceFingerprint, migratedAt: null,
    };
    const current = byId.get(requestId);
    const duplicateIds = byFingerprint.get(sourceFingerprint);
    const canonicalFields = ["requestId", "staffId", "submittedAt", "selectedType", "status", "manualReview",
      "source", "environment", "schemaVersion", "sourceSheet", "sourceSheetId", "sourceRow",
      "sourceTimestamp", "sourceName", "sourceDepartment", "sourceNote", "sourceFingerprint"];
    const conflict = (duplicateIds && (duplicateIds.size !== 1 || !duplicateIds.has(requestId))) ||
      (current && canonicalFields.some((field) => current[field] !== document[field]));
    return { rowNumber, classification: "matched", action: conflict ? "conflict" : current ? "skip" : "create",
      staffId, document };
  });
}

export class TbRegistrationAuditStore {
  constructor({ database = getFirebaseAdminDb, context = () => process.env, requestId = randomUUID } = {}) {
    this.database = database;
    this.context = context;
    this.requestId = requestId;
  }

  get environment() { return submissionEnvironment(this.context()); }
  get collectionName() { return TB_REGISTRATION_AUDIT_COLLECTIONS[this.environment]; }

  assertQa() {
    if (this.environment !== "qa") throw new TbRegistrationAuditError("QA 전용 감사 원장입니다.", 403);
  }

  async listQaRequests() {
    this.assertQa();
    const snapshot = await this.database().collection(this.collectionName).get();
    return snapshot.docs.map((doc) => {
      const request = doc.data();
      if (request.requestId !== doc.id || request.environment !== "qa") {
        throw new TbRegistrationAuditError("QA 감사 원장의 환경·문서 ID가 일치하지 않습니다.", 503);
      }
      return request;
    }).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || a.requestId.localeCompare(b.requestId));
  }

  async createQaRequest({ staffId, identity, registrationType, now = new Date() }) {
    this.assertQa();
    if (!/^QA-TB-[A-Z0-9-]+$/.test(staffId)) {
      throw new TbRegistrationAuditError("QA 합성 교직원만 이 경로를 사용할 수 있습니다.", 403);
    }
    if (cell(registrationType) !== SELECTED_TYPE || identity?.staffId !== staffId ||
      !cell(identity?.name)?.startsWith("[QA]") || !cell(identity?.department)?.startsWith("[QA]")) {
      throw new TbRegistrationAuditError("단체검진 신청값을 확인해 주세요.", 400);
    }
    const db = this.database();
    const requestId = this.requestId();
    const submittedAt = now.toISOString();
    const request = {
      requestId, staffId, submittedAt, selectedType: SELECTED_TYPE, status: "received",
      manualReview: false, source: "portal", environment: "qa", schemaVersion: 1,
      sourceSheet: null, sourceRow: null, sourceFingerprint: null,
      sourceName: cell(identity.name), sourceDepartment: cell(identity.department), createdAt: submittedAt,
    };
    const requestRef = db.collection(this.collectionName).doc(requestId);
    const statusRef = db.collection(QA_STATUS_COLLECTION).doc(`${staffId}_${TB_SCREENING_TASK_ID}`);
    await db.runTransaction(async (transaction) => {
      const [existingRequest, existingStatus] = await Promise.all([transaction.get(requestRef), transaction.get(statusRef)]);
      if (existingRequest.exists) throw new TbRegistrationAuditError("중복된 QA 접수 ID입니다.");
      const current = existingStatus.exists ? existingStatus.data() : null;
      if (current?.status === "completed") throw new TbRegistrationAuditError("이미 결핵검진 완료가 확인되었습니다.");
      const status = buildTbRegistrationStatus({ staffId, registrationType: SELECTED_TYPE });
      transaction.create(requestRef, request);
      transaction.set(statusRef, { ...status, screening: { ...(current?.screening || {}), ...status.screening },
        sourceType: "qa_portal_registration", environment: "qa", updatedAt: submittedAt }, { merge: true });
    });
    return request;
  }
}

export const tbRegistrationAuditStore = new TbRegistrationAuditStore();
