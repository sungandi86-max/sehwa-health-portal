import { createHash } from "node:crypto";
import { CmsInputError, dateKey, isSafeLink } from "./portalContentCms.js";

export const CHECKUP_HEADERS = [
  "사용여부", "제목", "설명", "대상", "세부항목", "버튼명", "링크", "상태", "정렬순서",
  "표시방식", "운영표상태", "이미지URL", "다운로드URL", "보조버튼명", "보조동작",
  "복사문구", "업데이트안내", "노출시작일", "노출종료일", "노출상태",
];

const text = (value) => String(value ?? "").normalize("NFKC").trim();
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const enabled = (value) => ["TRUE", "Y", "YES", "1", "사용"].includes(text(value).toUpperCase());

function checkupRecord(row, rowNumber) {
  const value = (header) => text(row[CHECKUP_HEADERS.indexOf(header)]);
  const title = value("제목");
  const content = value("설명");
  if (!title || !content) throw new CmsInputError("검진 안내 제목과 설명이 필요합니다.");
  const rawLink = value("링크");
  if (rawLink && !isSafeLink(rawLink) && rawLink !== "안내문 링크") {
    throw new CmsInputError("검진 안내 링크 형식을 확인해 주세요.");
  }
  for (const header of ["이미지URL", "다운로드URL"]) {
    if (!isSafeLink(value(header))) throw new CmsInputError("검진 안내 이미지·다운로드 링크를 확인해 주세요.");
  }
  const displayMode = value("표시방식") || "link";
  const secondaryAction = value("보조동작");
  const sortOrder = Number(value("정렬순서"));
  if (!["link", "pending", "image"].includes(displayMode) || !["", "notice"].includes(secondaryAction)
    || !Number.isInteger(sortOrder) || sortOrder < 1) throw new CmsInputError("검진 안내 동작 또는 정렬순서를 확인해 주세요.");
  const startAt = dateKey(value("노출시작일"));
  const endAt = dateKey(value("노출종료일"));
  if (startAt && endAt && startAt > endAt) throw new CmsInputError("검진 안내 노출기간을 확인해 주세요.");
  const active = enabled(value("사용여부"));
  return {
    id: `checkup_${digest(["checkup", title]).slice(0, 20)}`,
    kind: "item", schemaVersion: 1, type: "checkup", title, content, category: "",
    link: isSafeLink(rawLink) ? rawLink : "", attachment: "",
    fields: {
      target: value("대상"), details: value("세부항목"), buttonLabel: value("버튼명"),
      linkText: isSafeLink(rawLink) ? "" : rawLink, status: value("상태"), displayMode,
      operationStatus: value("운영표상태"), imageUrl: value("이미지URL"), downloadUrl: value("다운로드URL"),
      secondaryButtonLabel: value("보조버튼명"), secondaryAction, copyText: value("복사문구"),
      updateNotice: value("업데이트안내"),
    },
    active, visible: active, startAt, endAt, sortOrder,
    legacy: { sheetName: "앱_검진검사", sourceRow: rowNumber,
      fingerprint: digest(CHECKUP_HEADERS.map((_, index) => text(row[index]))),
      sourceExposureState: value("노출상태") },
  };
}

function matchesExpected(actual, expected) {
  return Object.entries(expected).every(([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value));
}

export function planCheckupCmsMigration(values, existingRecords) {
  const conflicts = [];
  const headers = (values?.[0] || []).map(text);
  if (CHECKUP_HEADERS.some((header, index) => headers[index] !== header)) {
    conflicts.push({ row: 1, code: "header_mismatch" });
  }
  const records = [];
  const seen = new Set();
  if (!conflicts.length) (values || []).slice(1).forEach((row, index) => {
    if (!row.some((cell) => text(cell))) return;
    try {
      const record = checkupRecord(row, index + 2);
      if (seen.has(record.id)) conflicts.push({ row: index + 2, code: "duplicate_title" });
      else { seen.add(record.id); records.push(record); }
    } catch (error) {
      if (!(error instanceof CmsInputError)) throw error;
      conflicts.push({ row: index + 2, code: "invalid_row" });
    }
  });
  const existing = Array.isArray(existingRecords) ? existingRecords : [];
  const config = existing.find((record) => record.id === "_config");
  if (!config || config.kind !== "config" || config.migrationComplete !== true) {
    conflicts.push({ row: 0, code: "cms_config_missing" });
  }
  const configCounts = { ...(config?.counts || {}), checkup: records.length };
  if (config?.counts?.checkup !== undefined && config.counts.checkup !== records.length) {
    conflicts.push({ row: 0, code: "cms_checkup_count_conflict" });
  }
  const expectedIds = new Set(records.map((record) => record.id));
  for (const item of existing) {
    if (item.type === "checkup" && !expectedIds.has(item.id)) conflicts.push({ row: 0, code: "unexpected_checkup_document" });
  }
  let create = 0;
  let skip = existing.filter((record) => record.id !== "_config" && record.type !== "checkup").length;
  for (const record of records) {
    const current = existing.find((item) => item.id === record.id);
    if (!current) create += 1;
    else if (matchesExpected(current, record)) skip += 1;
    else conflicts.push({ row: record.legacy.sourceRow, code: "existing_checkup_conflict" });
  }
  const update = config && config.counts?.checkup === undefined ? 1 : 0;
  if (config && !update) skip += 1;
  return { records, configCounts, conflicts,
    operations: { create, update, skip, conflict: conflicts.length } };
}
