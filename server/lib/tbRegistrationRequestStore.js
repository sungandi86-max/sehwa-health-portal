import { createHash, randomUUID } from "node:crypto";
import { getFirebaseAdminDb } from "./firebaseAdmin.js";
import { submissionEnvironment } from "./submissionConfig.js";

const COLLECTIONS = Object.freeze({
  qa: "tb_registration_requests_qa",
  production: "tb_registration_requests_production",
});

const text = (value) => String(value ?? "").normalize("NFKC").trim();

function fingerprint(parts) {
  return createHash("sha256").update(parts.map(text).join("\u001f"), "utf8").digest("hex");
}

function legacyRequestId(sourceRow, rowFingerprint) {
  return `legacy-tb-registration-${sourceRow}-${rowFingerprint.slice(0, 16)}`;
}

export function buildLegacyTbRegistrationAuditRecord({ environment, sourceRow, original, matchStatus,
  staffId = "", candidateStaffId = "", now = new Date() }) {
  if (!Number.isInteger(sourceRow) || sourceRow < 2) throw new Error("legacy source row가 올바르지 않습니다.");
  if (!["matched", "manual_review"].includes(matchStatus)) throw new Error("legacy match 상태가 올바르지 않습니다.");
  const legacyOriginal = {
    timestamp: text(original?.timestamp),
    name: text(original?.name),
    department: text(original?.department),
    selectedType: text(original?.selectedType),
    note: text(original?.note),
  };
  const rowFingerprint = fingerprint([sourceRow, legacyOriginal.timestamp, legacyOriginal.name,
    legacyOriginal.department, legacyOriginal.selectedType, legacyOriginal.note]);
  const importedAt = now.toISOString();
  const record = {
    requestId: legacyRequestId(sourceRow, rowFingerprint),
    submittedAt: legacyOriginal.timestamp,
    selectedType: legacyOriginal.selectedType,
    source: "legacy_sheet_migration",
    environment,
    originalRowFingerprint: rowFingerprint,
    legacyOriginal,
    migration: {
      imported: true,
      legacySource: "staff_tb_registration_sheet_2026",
      legacyImportedAt: importedAt,
      sourceSheetName: "응답_교직원결핵검진유형선택",
      sourceRow,
    },
    manualReview: matchStatus === "manual_review",
    status: matchStatus === "manual_review" ? "manual_review" : "received",
    schemaVersion: 1,
    createdAt: importedAt,
    updatedAt: importedAt,
  };
  if (matchStatus === "matched") {
    const canonicalStaffId = text(staffId);
    if (!canonicalStaffId) throw new Error("matched legacy record에는 canonical staffId가 필요합니다.");
    record.staffId = canonicalStaffId;
  } else {
    const candidate = text(candidateStaffId);
    if (candidate) record.candidateStaffId = candidate;
  }
  return record;
}

export function planLegacyTbRegistrationMigration({ environment, rows, existing = [], now = new Date() }) {
  const existingById = new Map(existing.map((item) => [item.requestId, item]));
  const records = rows.map((row) => buildLegacyTbRegistrationAuditRecord({ environment, now, ...row }));
  const result = {
    create: 0, manualReview: 0, skip: 0, canonicalSkip: 0, manualReviewSkip: 0,
    conflict: 0, records: [], conflicts: [],
  };
  for (const record of records) {
    const current = existingById.get(record.requestId);
    if (current) {
      if (current.originalRowFingerprint === record.originalRowFingerprint && current.environment === environment) {
        result.skip += 1;
        if (record.manualReview) result.manualReviewSkip += 1;
        else result.canonicalSkip += 1;
      } else {
        result.conflict += 1;
        result.conflicts.push({ sourceRow: record.migration.sourceRow, code: "existing_record_conflict" });
      }
      continue;
    }
    result.records.push(record);
    if (record.manualReview) result.manualReview += 1;
    else result.create += 1;
  }
  return result;
}

export class TbRegistrationRequestStore {
  constructor({ database = getFirebaseAdminDb, context = () => process.env, requestId = randomUUID } = {}) {
    this.database = database;
    this.context = context;
    this.requestId = requestId;
  }

  get environment() {
    return submissionEnvironment(this.context());
  }

  get collectionName() {
    return COLLECTIONS[this.environment];
  }

  async createRequest({ staffId, selectedType, now = new Date(), source = "portal" }) {
    const normalizedStaffId = text(staffId);
    const normalizedType = text(selectedType);
    if (!normalizedStaffId || !normalizedType) throw new Error("결핵검진 신청 원장 필수값이 없습니다.");

    const id = this.requestId();
    const submittedAt = now.toISOString();
    const request = {
      requestId: id,
      staffId: normalizedStaffId,
      submittedAt,
      selectedType: normalizedType,
      source,
      environment: this.environment,
      originalRowFingerprint: fingerprint([normalizedStaffId, submittedAt, normalizedType, source]),
      migration: { imported: false },
      manualReview: false,
      status: "received",
      schemaVersion: 1,
      createdAt: submittedAt,
      updatedAt: submittedAt,
    };
    await this.database().collection(this.collectionName).doc(id).create(request);
    return request;
  }

  async getRequest(requestId) {
    const snapshot = await this.database().collection(this.collectionName).doc(text(requestId)).get();
    return snapshot.exists ? this.readDocument(snapshot) : null;
  }

  async listRequests() {
    const snapshot = await this.database().collection(this.collectionName).get();
    return snapshot.docs.map((doc) => this.readDocument(doc))
      .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  }

  async applyLegacyMigration(plan) {
    if (!plan || plan.conflict !== 0 || !Array.isArray(plan.records)) {
      throw new Error("충돌 없는 legacy migration plan이 필요합니다.");
    }
    const database = this.database();
    const batch = database.batch();
    for (const record of plan.records) {
      if (record.environment !== this.environment || record.requestId !== legacyRequestId(
        record.migration?.sourceRow, record.originalRowFingerprint,
      )) {
        throw new Error("legacy migration record의 환경 또는 ID가 올바르지 않습니다.");
      }
      batch.create(database.collection(this.collectionName).doc(record.requestId), record);
    }
    await batch.commit();
    return { created: plan.records.length };
  }

  readDocument(snapshot) {
    const request = snapshot.data();
    if (request.requestId !== snapshot.id || request.environment !== this.environment) {
      throw new Error("결핵검진 신청 원장의 환경·문서 ID가 일치하지 않습니다.");
    }
    return request;
  }
}

export const tbRegistrationRequestStore = new TbRegistrationRequestStore();
