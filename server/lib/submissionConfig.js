import { randomUUID } from "node:crypto";
import { getTbRegistrationWindowState } from "../../src/lib/portalContent.js";

const PUBLIC_PREFIX = "submission_public_config";
const ADMIN_PREFIX = "submission_admin_config";
const CONFIG_ID = "_config";
const PUBLIC_FIELDS = ["canonicalType", "title", "titleLine1", "titleLine2", "description", "target",
  "submissionMaterial", "deadlineText", "guideText", "buttonLabel", "publicUrl", "statusText",
  "emphasis", "sortOrder", "visible", "active", "startAt", "endAt"];
const PUBLIC_TYPES = new Set(["cpr", "tb", "recruit", "infection", "student_tb_reply", "tb_registration"]);

export class SubmissionConfigError extends Error {}

const text = (value) => String(value ?? "").normalize("NFKC").trim();
const date = (value) => {
  const input = text(value);
  if (!input) return "";
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = match && new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (!match || !parsed || parsed.toISOString().slice(0, 10) !== input) {
    throw new SubmissionConfigError("날짜는 YYYY-MM-DD 형식이어야 합니다.");
  }
  return input;
};

export function submissionEnvironment(context = process.env) {
  if (context.VERCEL_ENV === "production" && context.VERCEL_GIT_COMMIT_REF === "main") return "production";
  if (context.VERCEL_ENV === "preview" && context.VERCEL_GIT_COMMIT_REF === "qa") return "qa";
  throw new SubmissionConfigError("승인된 배포 환경에서만 제출 설정을 사용할 수 있습니다.");
}

export function submissionCollections(context = process.env) {
  const environment = submissionEnvironment(context);
  return { public: `${PUBLIC_PREFIX}_${environment}`, admin: `${ADMIN_PREFIX}_${environment}` };
}

function safePublicUrl(value) {
  const url = text(value);
  if (!url) return "";
  if (/^\/(?!\/)[\w\-/?=&%#]*$/.test(url)) return url;
  let parsed;
  try { parsed = new URL(url); } catch { throw new SubmissionConfigError("공개 링크는 HTTPS 또는 포털 내부 경로만 허용됩니다."); }
  if (parsed.protocol === "https:" && parsed.hostname && !parsed.username && !parsed.password
    && !/^(drive|docs)\.google\.com$/i.test(parsed.hostname)) return url;
  throw new SubmissionConfigError("공개 링크는 HTTPS 또는 포털 내부 경로만 허용됩니다.");
}

export function validatePublicCard(input) {
  const card = {};
  for (const key of PUBLIC_FIELDS) {
    if (key === "sortOrder") {
      const order = Number(input?.sortOrder);
      if (!Number.isInteger(order) || order < 1 || order > 100000) throw new SubmissionConfigError("정렬순서를 확인해 주세요.");
      card.sortOrder = order;
    } else if (["visible", "active", "emphasis"].includes(key)) card[key] = input?.[key] === true;
    else if (["startAt", "endAt"].includes(key)) card[key] = date(input?.[key]);
    else card[key] = text(input?.[key]);
  }
  if (!PUBLIC_TYPES.has(card.canonicalType)) throw new SubmissionConfigError("제출 유형을 확인해 주세요.");
  if (!card.title || card.title.length > 200 || card.description.length > 3000) throw new SubmissionConfigError("카드 제목·설명을 확인해 주세요.");
  if (card.startAt && card.endAt && card.startAt > card.endAt) throw new SubmissionConfigError("종료일이 시작일보다 빠릅니다.");
  card.publicUrl = safePublicUrl(card.publicUrl);
  return card;
}

function records(snapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function requireMigrated(items) {
  const config = items.find((item) => item.id === CONFIG_ID);
  if (!config || config.kind !== "config" || config.migrationComplete !== true) {
    throw new SubmissionConfigError("제출 설정 저장소가 아직 준비되지 않았습니다.");
  }
  return items;
}

export async function readSubmissionConfig(db, { context = process.env } = {}) {
  const names = submissionCollections(context);
  const [publicSnapshot, adminSnapshot] = await Promise.all([
    db.collection(names.public).get(), db.collection(names.admin).get(),
  ]);
  const publicRecords = requireMigrated(records(publicSnapshot));
  const adminRecords = requireMigrated(records(adminSnapshot));
  const registration = adminRecords.find((record) => record.id === "tb_registration" && record.kind === "registration");
  if (!registration) throw new SubmissionConfigError("단체검진 신청 설정이 없습니다.");
  return {
    cards: publicRecords.filter((item) => item.kind === "card")
      .map((item) => ({ id: item.id, ...validatePublicCard(item), createdAt: item.createdAt, updatedAt: item.updatedAt }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    registration,
    adminRecords: adminRecords.filter((item) => item.id !== CONFIG_ID),
  };
}

export function publicSubmissionConfig(config, now = new Date()) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const tbConfig = {
    enabled: config.registration.enabled === true ? "TRUE" : "FALSE",
    startDate: config.registration.startAt || "", endDate: config.registration.endAt || "",
    closedButton: config.registration.closedButton || "", closedMessage: config.registration.closedMessage || "",
  };
  const uploads = config.cards.filter((card) => card.active && card.visible
    && (!card.startAt || card.startAt <= today) && (!card.endAt || card.endAt >= today)
    && (card.canonicalType !== "tb_registration" || getTbRegistrationWindowState(tbConfig, now) === "open"))
    .map((card) => ({
      id: card.id, canonicalType: card.canonicalType, title: card.title,
      titleLines: [card.titleLine1, card.titleLine2].filter(Boolean), description: card.description,
      target: card.target, documentType: card.submissionMaterial, deadline: card.deadlineText,
      fileGuide: card.guideText, buttonText: card.buttonLabel, url: card.publicUrl,
      status: card.statusText, uploadType: card.canonicalType, highlight: card.emphasis,
    }));
  return { tbConfig, uploads };
}

export function assertRegistrationOpen(config, now = new Date()) {
  const status = getTbRegistrationWindowState({ enabled: config.registration.enabled ? "TRUE" : "FALSE",
    startDate: config.registration.startAt, endDate: config.registration.endAt }, now);
  if (status !== "open") throw new SubmissionConfigError(
    status === "before" ? "단체검진 신청 기간이 시작되지 않았습니다." : "단체검진 신청 기간이 마감되었습니다.");
}

export async function saveSubmissionCard(db, { context = process.env, action, id, input, actorUid }) {
  await readSubmissionConfig(db, { context });
  const names = submissionCollections(context);
  const collection = db.collection(names.public);
  const now = new Date().toISOString();
  if (["hide", "show", "deactivate", "restore"].includes(action)) {
    const ref = collection.doc(id);
    const current = await ref.get();
    if (!current.exists || current.data()?.kind !== "card") throw new SubmissionConfigError("카드를 찾지 못했습니다.");
    const change = action === "hide" ? { visible: false } : action === "show" ? { visible: true }
      : action === "deactivate" ? { active: false } : { active: true };
    await ref.update({ ...change, updatedAt: now, updatedBy: actorUid });
    return { id };
  }
  if (!["add", "update"].includes(action)) throw new SubmissionConfigError("지원하지 않는 변경입니다.");
  const card = validatePublicCard(input);
  if (action === "add") {
    const newId = `${card.canonicalType}_${randomUUID()}`;
    await collection.doc(newId).create({ kind: "card", schemaVersion: 1, ...card,
      createdAt: now, updatedAt: now, createdBy: actorUid, updatedBy: actorUid });
    return { id: newId };
  }
  const ref = collection.doc(id);
  const current = await ref.get();
  if (!current.exists || current.data()?.kind !== "card" || current.data()?.canonicalType !== card.canonicalType) {
    throw new SubmissionConfigError("수정할 카드를 찾지 못했습니다.");
  }
  await ref.update({ ...card, updatedAt: now, updatedBy: actorUid });
  return { id };
}

export async function saveRegistrationConfig(db, { context = process.env, input, actorUid }) {
  await readSubmissionConfig(db, { context });
  const names = submissionCollections(context);
  const ref = db.collection(names.admin).doc("tb_registration");
  const existing = await ref.get();
  if (!existing.exists || existing.data()?.kind !== "registration") throw new SubmissionConfigError("단체검진 설정이 없습니다.");
  const startAt = date(input?.startAt);
  const endAt = date(input?.endAt);
  if (startAt && endAt && startAt > endAt) throw new SubmissionConfigError("신청 종료일이 시작일보다 빠릅니다.");
  await ref.update({ enabled: input?.enabled === true, startAt, endAt,
    status: text(input?.status).slice(0, 100), operationNote: text(input?.operationNote).slice(0, 1000),
    updatedAt: new Date().toISOString(), updatedBy: actorUid });
  return { id: "tb_registration" };
}
