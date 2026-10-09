import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { PNG } from "pngjs";
import { TARGET_HEADERS, TRAINING_HEADERS, TrainingSourceNotReadyError } from "./trainingCenter.js";

export const SIGNATURE_SHEET = "교직원교육전자서명";
export const SIGNATURE_HEADERS = [
  "signatureId", "eventId", "eventGroupId", "교직원ID", "서명일시", "출석방식", "서명파일ID",
  "상태", "취소여부", "취소사유", "정정자", "정정일시", "createdAt",
];

const TRUE_VALUES = new Set(["TRUE", "Y", "O", "1", "예", "사용", "필수", "제외"]);
const EVENT_STATUSES = new Set(["예정", "진행중", "완료", "비활성"]);
const MAX_QR_AGE_MS = 15 * 60 * 1000;

export function sheetRows(values, headers) {
  const header = (values?.[0] || []).map((cell) => String(cell ?? "").normalize("NFKC").trim());
  if (headers.some((key) => header.filter((cell) => cell === key).length !== 1)) throw new TrainingSourceNotReadyError();
  return values.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    ...Object.fromEntries(headers.map((key) => [key, String(cells[header.indexOf(key)] ?? "").normalize("NFKC").trim()])),
  }));
}

export function truthy(value) {
  return TRUE_VALUES.has(String(value ?? "").normalize("NFKC").trim().toUpperCase());
}

export function activeSignature(row) {
  return row["상태"] === "완료" && !truthy(row["취소여부"]);
}

export function signatureKey(eventId, staffId) {
  return createHash("sha256").update(JSON.stringify([eventId, staffId])).digest("hex");
}

export function newSignatureId() {
  return `SIG-${randomUUID()}`;
}

function uniqueRows(rows, key, label) {
  const values = rows.map((row) => row[key]).filter(Boolean);
  if (new Set(values).size !== values.length) throw new TrainingSourceNotReadyError(`${label} 중복`);
}

export function parseTrainingSource({ trainings, targets, signatures }) {
  const result = {
    trainings: sheetRows(trainings, TRAINING_HEADERS).filter((row) => row.eventId),
    targets: sheetRows(targets, TARGET_HEADERS).filter((row) => row.eventId && row["교직원ID"]),
    signatures: sheetRows(signatures, SIGNATURE_HEADERS).filter((row) => row.signatureId),
  };
  uniqueRows(result.trainings, "eventId", "교육 ID");
  const targetKeys = result.targets.map((row) => JSON.stringify([row.eventId, row["교직원ID"]]));
  if (new Set(targetKeys).size !== targetKeys.length) throw new TrainingSourceNotReadyError();
  uniqueRows(result.signatures, "signatureId", "서명 ID");
  const activeKeys = result.signatures.filter(activeSignature).map((row) => signatureKey(row.eventId, row["교직원ID"]));
  if (new Set(activeKeys).size !== activeKeys.length) throw new TrainingSourceNotReadyError();
  return result;
}

export function resolveEvents(source, { eventId = "", eventGroupId = "" }) {
  const events = eventGroupId
    ? source.trainings.filter((row) => row.eventGroupId === eventGroupId && truthy(row["사용여부"]))
    : source.trainings.filter((row) => row.eventId === eventId && truthy(row["사용여부"]));
  if (!events.length || (eventId && events.length !== 1)) return [];
  return events.sort((a, b) => a.eventId.localeCompare(b.eventId));
}

export function attendanceEligibility(source, events, staffId, now = new Date()) {
  return events.map((event) => {
    const target = source.targets.find((row) => row.eventId === event.eventId && row["교직원ID"] === staffId);
    const already = source.signatures.find((row) => row.eventId === event.eventId && row["교직원ID"] === staffId && activeSignature(row));
    let reason = "";
    if (!target || !["대상", "교육 대상"].includes(target["대상상태"])) reason = "교육 대상이 아닙니다.";
    else if (truthy(target["제외여부"])) reason = "교육 대상에서 제외되었습니다.";
    else if (already) reason = "이미 출석이 기록되었습니다.";
    else {
      const open = Date.parse(event.signatureOpenAt);
      const close = Date.parse(event.signatureCloseAt);
      if (!Number.isFinite(open) || !Number.isFinite(close) || open >= close) reason = "서명 가능 시간이 설정되지 않았습니다.";
      else if (now.getTime() < open || now.getTime() > close) reason = "지금은 서명 가능한 시간이 아닙니다.";
    }
    return { eventId: event.eventId, title: event["교육명"], eligible: !reason, reason };
  });
}

export function issueQrChallenge({ eventId = "", eventGroupId = "", secret, now = Date.now() }) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32 || Boolean(eventId) === Boolean(eventGroupId)) throw new Error("QR 설정을 확인해 주세요.");
  const payload = { eventId, eventGroupId, expiresAt: now + MAX_QR_AGE_MS, nonce: randomUUID() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyQrChallenge(token, { eventId = "", eventGroupId = "", secret, now = Date.now() }) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32 || typeof token !== "string" || token.length > 1000) return false;
  const [encoded, actual, extra] = token.split(".");
  if (!encoded || !actual || extra) return false;
  const expected = createHmac("sha256", secret).update(encoded).digest();
  let provided;
  try { provided = Buffer.from(actual, "base64url"); } catch { return false; }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return payload.eventId === eventId && payload.eventGroupId === eventGroupId &&
      Number.isSafeInteger(payload.expiresAt) && payload.expiresAt > now && payload.expiresAt <= now + MAX_QR_AGE_MS;
  } catch { return false; }
}

export function decodeInkSignature(dataUrl) {
  if (typeof dataUrl !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl) || dataUrl.length > 400000) {
    throw new RangeError("PNG 서명을 다시 입력해 주세요.");
  }
  const bytes = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
  if (bytes.length < 100 || bytes.length > 300000) throw new RangeError("서명 이미지 크기를 확인해 주세요.");
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.readUInt32BE(16) > 1600 || bytes.readUInt32BE(20) > 1000) throw new RangeError("서명 이미지 크기를 확인해 주세요.");
  let image;
  try { image = PNG.sync.read(bytes); } catch { throw new RangeError("PNG 서명을 다시 입력해 주세요."); }
  if (image.width < 100 || image.height < 40 || image.width > 1600 || image.height > 1000) throw new RangeError("서명 이미지 크기를 확인해 주세요.");
  let ink = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] > 80 && Math.min(image.data[i], image.data[i + 1], image.data[i + 2]) < 190) ink += 1;
  }
  if (ink < 20) throw new RangeError("빈 서명은 제출할 수 없습니다.");
  return bytes;
}

export function validateTrainingInput(input, { existing = null, year = 2026 } = {}) {
  const fields = Object.fromEntries(TRAINING_HEADERS.map((key) => [key, String(input?.[key] ?? existing?.[key] ?? "").normalize("NFKC").trim()]));
  if (!fields.eventId) fields.eventId = `TR-${year}-${randomUUID()}`;
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(fields.eventId) || (existing && existing.eventId !== fields.eventId)) throw new RangeError("교육 ID가 올바르지 않습니다.");
  if (fields.eventGroupId && !/^[A-Za-z0-9_-]{3,120}$/.test(fields.eventGroupId)) throw new RangeError("묶음 ID가 올바르지 않습니다.");
  if (!fields["교육명"] || fields["교육명"].length > 150 || !fields["담당부서"] || !fields["일자"] || !EVENT_STATUSES.has(fields["상태"])) throw new RangeError("교육 필수 정보를 확인해 주세요.");
  const date = new Date(`${fields["일자"]}T00:00:00+09:00`);
  const timeValid = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields["일자"]) || !Number.isFinite(date.getTime()) ||
    new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) !== fields["일자"] ||
    !timeValid(fields["시작시간"]) || !timeValid(fields["종료시간"]) || fields["시작시간"] >= fields["종료시간"]) {
    throw new RangeError("교육 일시를 확인해 주세요.");
  }
  const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/;
  const open = Date.parse(fields.signatureOpenAt);
  const close = Date.parse(fields.signatureCloseAt);
  if (!timestampPattern.test(fields.signatureOpenAt) || !timestampPattern.test(fields.signatureCloseAt) || !Number.isFinite(open) || !Number.isFinite(close) || open >= close) throw new RangeError("서명 가능 시간을 확인해 주세요.");
  fields["교육연도"] = String(year);
  fields["사용여부"] = truthy(fields["사용여부"]) ? "사용" : "미사용";
  return fields;
}

export function finalSheetModel(source, directory, eventId) {
  const event = source.trainings.find((row) => row.eventId === eventId);
  if (!event) return null;
  const people = new Map(directory.filter((row) => row.employmentStatus === "재직").map((row) => [row.staffId, row]));
  const rows = source.targets.filter((row) => row.eventId === eventId && ["대상", "교육 대상", "제외"].includes(row["대상상태"]) && people.has(row["교직원ID"]))
    .map((target) => {
      const staff = people.get(target["교직원ID"]);
      const signature = source.signatures.find((row) => row.eventId === eventId && row["교직원ID"] === staff.staffId && activeSignature(row));
      const excluded = truthy(target["제외여부"]) || target["대상상태"] === "제외";
      return { staffId: staff.staffId, name: staff.name, department: staff.department, position: staff.position,
        status: excluded ? "제외" : signature ? "서명 완료" : "미서명", signedAt: signature?.["서명일시"] || "", method: signature?.["출석방식"] || "", fileId: signature?.["서명파일ID"] || "" };
    }).sort((a, b) => a.name.localeCompare(b.name, "ko") || a.staffId.localeCompare(b.staffId));
  return { event: { eventId, title: event["교육명"], date: event["일자"], location: event["장소"] }, rows,
    counts: { target: rows.filter((row) => row.status !== "제외").length, signed: rows.filter((row) => row.status === "서명 완료").length, excluded: rows.filter((row) => row.status === "제외").length } };
}
