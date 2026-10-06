import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const TEMPLATE_URL = new URL("./templates/child-abuse-result-report.hwpx", import.meta.url);
const SECTION_PATH = "Contents/section0.xml";
const REQUIRED_ENTRIES = [
  "mimetype",
  "Contents/content.hpf",
  "Contents/header.xml",
  SECTION_PATH,
  "META-INF/container.xml",
  "META-INF/container.rdf",
  "META-INF/manifest.xml",
  "settings.xml",
  "version.xml",
];

export const CHILD_ABUSE_EDUCATION_METHODS = [
  "집합 강사교육",
  "집합 온라인 교육",
  "(인터넷) 복지부 위탁 기관",
  "(인터넷) 기타 원격교육기관",
];

export const CHILD_ABUSE_HWPX_FILENAME = "2026_아동학대_신고의무자교육_교육결과보고서.hwpx";

const FIELD_NAMES = [
  "institutionName",
  "address",
  "principal",
  "trainingPeriod",
  "instructor",
  "totalCount",
  "completedCount",
  "referenceDate",
  "educationHours",
  "educationMethod",
  "platformOrg",
  "platformUrl",
];

const REQUIRED_TEXT_FIELDS = [
  "institutionName",
  "address",
  "principal",
  "trainingPeriod",
  "referenceDate",
  "educationHours",
  "educationMethod",
];
const MAX_TEXT_LENGTH = 1_000;

export class ChildAbuseHwpxValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ChildAbuseHwpxValidationError";
  }
}

function text(value) {
  return String(value ?? "").normalize("NFKC").trim();
}

function count(value, label) {
  if (value === undefined || value === null || text(value) === "") {
    throw new ChildAbuseHwpxValidationError(`${label}을 입력해 주세요.`);
  }
  const parsed = typeof value === "number" ? value : Number(text(value));
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ChildAbuseHwpxValidationError(`${label}은 0 이상의 정수여야 합니다.`);
  }
  return parsed;
}

function referenceDate(value) {
  const normalized = text(value);
  const match = normalized.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})\.?$/);
  if (!match) throw new ChildAbuseHwpxValidationError("총 인원수 기준일을 확인해 주세요.");
  const [, year, monthText, dayText] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(Number(year), month - 1, day));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ChildAbuseHwpxValidationError("총 인원수 기준일을 확인해 주세요.");
  }
  return `${year}.${month}.${day}.`;
}

function escapeXmlText(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function placeholder(name) {
  return `{{${name}}}`;
}

function occurrences(source, token) {
  return source.split(token).length - 1;
}

export function normalizeChildAbuseHwpxInput(input = {}) {
  const normalized = Object.fromEntries(FIELD_NAMES.map((name) => [name, text(input[name])]));
  normalized.totalCount = count(input.totalCount, "총 인원수");
  normalized.completedCount = count(input.completedCount, "교육 수료인원");
  normalized.referenceDate = referenceDate(input.referenceDate);

  for (const name of REQUIRED_TEXT_FIELDS) {
    if (!normalized[name]) {
      throw new ChildAbuseHwpxValidationError("필수 결과보고서 항목을 모두 입력해 주세요.");
    }
  }
  for (const name of FIELD_NAMES) {
    if (typeof normalized[name] === "string" && normalized[name].length > MAX_TEXT_LENGTH) {
      throw new ChildAbuseHwpxValidationError("결과보고서 입력값은 항목별 1,000자 이하로 입력해 주세요.");
    }
  }
  if (!CHILD_ABUSE_EDUCATION_METHODS.includes(normalized.educationMethod)) {
    throw new ChildAbuseHwpxValidationError("교육방법을 목록에서 선택해 주세요.");
  }
  if (normalized.completedCount > normalized.totalCount) {
    throw new ChildAbuseHwpxValidationError("교육 수료인원은 총 인원수보다 많을 수 없습니다.");
  }
  if (normalized.educationMethod === "집합 강사교육" && !normalized.instructor) {
    throw new ChildAbuseHwpxValidationError("집합 강사교육은 강사명과 소속을 입력해 주세요.");
  }
  if (normalized.educationMethod === "(인터넷) 기타 원격교육기관") {
    if (!normalized.platformOrg || !normalized.platformUrl) {
      throw new ChildAbuseHwpxValidationError("기타 원격교육기관의 기관명과 사이트 주소를 입력해 주세요.");
    }
  }
  if (normalized.educationMethod !== "집합 강사교육") normalized.instructor = "";
  if (normalized.educationMethod !== "(인터넷) 기타 원격교육기관") {
    normalized.platformOrg = "";
    normalized.platformUrl = "";
  }
  return normalized;
}

function assertTemplateContract(entries, section) {
  for (const name of REQUIRED_ENTRIES) {
    if (!entries[name]) throw new Error(`HWPX 템플릿 필수 항목이 없습니다: ${name}`);
  }
  if (strFromU8(entries.mimetype) !== "application/hwp+zip") {
    throw new Error("HWPX 템플릿 mimetype을 확인해 주세요.");
  }
  for (const name of FIELD_NAMES) {
    const token = placeholder(name);
    if (occurrences(section, token) !== 1) {
      throw new Error(`HWPX 템플릿 placeholder를 확인해 주세요: ${name}`);
    }
    const paragraphStart = section.lastIndexOf("<hp:p", section.indexOf(token));
    const paragraphEnd = section.indexOf("</hp:p>", section.indexOf(token));
    if (paragraphStart < 0 || paragraphEnd < 0) throw new Error(`HWPX 템플릿 문단을 확인해 주세요: ${name}`);
    if (section.slice(paragraphStart, paragraphEnd).includes("<hp:linesegarray")) {
      throw new Error(`HWPX 템플릿에 오래된 줄 배치 정보가 남아 있습니다: ${name}`);
    }
  }
  if (!section.includes("교육방법에 따른 증빙자료 목록")) {
    throw new Error("HWPX 템플릿의 고정 안내 영역을 확인해 주세요.");
  }
}

export async function generateChildAbuseHwpxReport(input, { templateUrl = TEMPLATE_URL } = {}) {
  const normalized = normalizeChildAbuseHwpxInput(input);
  const template = await readFile(fileURLToPath(templateUrl));
  const entries = unzipSync(template);
  let section = strFromU8(entries[SECTION_PATH]);
  assertTemplateContract(entries, section);

  for (const name of FIELD_NAMES) {
    section = section.replace(placeholder(name), escapeXmlText(String(normalized[name])));
  }
  if (FIELD_NAMES.some((name) => section.includes(placeholder(name)))) {
    throw new Error("HWPX 결과보고서에 치환되지 않은 항목이 남아 있습니다.");
  }

  const output = {
    mimetype: [entries.mimetype, { level: 0 }],
  };
  for (const [name, bytes] of Object.entries(entries)) {
    if (name === "mimetype") continue;
    output[name] = [name === SECTION_PATH ? strToU8(section) : bytes, { level: 6 }];
  }
  return Buffer.from(zipSync(output));
}
