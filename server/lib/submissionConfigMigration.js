import { createHash } from "node:crypto";
import { validatePublicCard } from "./submissionConfig.js";

const UPLOAD_HEADERS = ["사용여부", "제목", "제목1줄", "제목2줄", "설명", "대상", "제출자료", "마감", "안내문",
  "버튼명", "링크", "상태", "유형", "강조", "정렬순서", "노출시작일", "노출종료일", "노출상태"];
const ITEM_HEADERS = ["제출항목ID", "사용여부", "홈노출", "표시순서", "상태", "제출명", "담당부서", "대상",
  "연수시간/기준", "연수내용", "마감일", "저장폴더ID", "AI추출여부", "필수추출항목", "링크", "비고",
  "노출시작일", "노출종료일", "최종수정일"];
const ROW_TYPES = ["cpr", "tb", "recruit", "infection", "student_tb_reply", "tb_registration"];
const ROW_TITLES = ["심폐소생술 이수증 제출", "개별 건강검진 확인서 제출", "채용검진 대체 인정 확인 요청",
  "감염병 발생 보고", "결핵검진 진료회신 제출", "교직원 결핵검진 단체검진 신청"];

function checkedRows(values, headers, expected) {
  if (!Array.isArray(values) || values.length !== expected + 1 || headers.some((header, index) => values[0]?.[index] !== header)) {
    throw new Error("submission_source_shape_changed");
  }
  return values.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

const truthy = (value) => ["TRUE", "사용", "노출", "YES", "1"].includes(String(value ?? "").trim().toUpperCase());
const normalizedDate = (value) => {
  const match = String(value ?? "").trim().match(/^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : "";
};
const fingerprint = (row) => createHash("sha256").update(JSON.stringify(row)).digest("hex");

export function submissionConfigMigrationRecords(uploadValues, itemValues) {
  const uploads = checkedRows(uploadValues, UPLOAD_HEADERS, 6);
  const items = checkedRows(itemValues, ITEM_HEADERS, 3);
  const cards = uploads.map((row, index) => {
    if (row["제목"] !== ROW_TITLES[index]) throw new Error("submission_card_identity_changed");
    const url = String(row["링크"] || "").trim();
    const publicUrl = /^(https:\/\/(?!drive\.google\.com\/)|\/(?!\/))/i.test(url) ? url : "";
    const card = validatePublicCard({
      canonicalType: ROW_TYPES[index], title: row["제목"], titleLine1: row["제목1줄"], titleLine2: row["제목2줄"],
      description: row["설명"], target: row["대상"], submissionMaterial: row["제출자료"], deadlineText: row["마감"],
      guideText: row["안내문"], buttonLabel: row["버튼명"], publicUrl, statusText: row["상태"],
      emphasis: truthy(row["강조"]), sortOrder: row["정렬순서"], visible: truthy(row["사용여부"]),
      active: truthy(row["사용여부"]), startAt: normalizedDate(row["노출시작일"]), endAt: normalizedDate(row["노출종료일"]),
    });
    return { id: ROW_TYPES[index], kind: "card", schemaVersion: 1, ...card };
  });
  const registrationRow = uploads[5];
  const registration = {
    id: "tb_registration", kind: "registration", schemaVersion: 1,
    enabled: truthy(registrationRow["사용여부"]), startAt: normalizedDate(registrationRow["노출시작일"]),
    endAt: normalizedDate(registrationRow["노출종료일"]), status: String(registrationRow["상태"] || ""),
    closedButton: "", closedMessage: "접수 기한이 지나 제출할 수 없습니다. 필요한 경우 보건실로 문의해주세요.", operationNote: "",
  };
  const legacy = items.map((row, index) => ({
    id: `legacy_${row["제출항목ID"]}`, kind: "legacy_item", schemaVersion: 1,
    sourceSheet: "제출항목관리", sourceRow: index + 2, sourceFingerprint: fingerprint(row),
    sourceId: String(row["제출항목ID"]), title: String(row["제출명"] || ""),
    status: String(row["상태"] || ""), active: truthy(row["사용여부"]),
    homeVisible: truthy(row["홈노출"]), aiExtractionRuntimeEnabled: false,
    canonicalType: row["제출항목ID"] === "TB-REPLY-2026-001" ? "student_tb_reply" : "",
  }));
  if (legacy[2].canonicalType !== "student_tb_reply" || legacy.slice(0, 2).some((item) => item.active)) {
    throw new Error("submission_items_identity_changed");
  }
  return {
    public: [{ id: "_config", kind: "config", schemaVersion: 1, migrationComplete: true, sourceRows: 6 }, ...cards],
    admin: [{ id: "_config", kind: "config", schemaVersion: 1, migrationComplete: true, sourceRows: 3 }, registration, ...legacy],
  };
}

function comparable(record) {
  const { createdAt, updatedAt, createdBy, updatedBy, legacyImportedAt, ...stable } = record;
  return JSON.stringify(Object.fromEntries(Object.entries(stable).sort(([left], [right]) => left.localeCompare(right))));
}

export function planSubmissionConfigMigration(expected, existing) {
  const actions = { create: 0, update: 0, skip: 0, conflict: 0 };
  const conflicts = [];
  for (const group of ["public", "admin"]) {
    const byId = new Map(existing[group].map((record) => [record.id, record]));
    if (byId.size !== existing[group].length) throw new Error("duplicate_existing_submission_document");
    for (const record of expected[group]) {
      const current = byId.get(record.id);
      if (!current) actions.create += 1;
      else if (comparable(record) === comparable(current)) actions.skip += 1;
      else { actions.conflict += 1; conflicts.push({ group, id: record.id }); }
    }
    for (const record of existing[group]) {
      if (!expected[group].some((item) => item.id === record.id)) {
        actions.conflict += 1;
        conflicts.push({ group, id: record.id, code: "unexpected_existing_document" });
      }
    }
  }
  return { actions, conflicts };
}
