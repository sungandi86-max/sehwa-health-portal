import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DOMParser } from "@xmldom/xmldom";
import { strFromU8, unzipSync } from "fflate";
import {
  CHILD_ABUSE_EDUCATION_METHODS,
  ChildAbuseHwpxValidationError,
  generateChildAbuseHwpxReport,
  normalizeChildAbuseHwpxInput,
} from "./childAbuseHwpxReport.js";

const templateUrl = new URL("./templates/child-abuse-result-report.hwpx", import.meta.url);
const requiredEntries = [
  "mimetype",
  "Contents/content.hpf",
  "Contents/header.xml",
  "Contents/section0.xml",
  "META-INF/container.xml",
  "META-INF/container.rdf",
  "META-INF/manifest.xml",
  "settings.xml",
  "version.xml",
];

function fixture(overrides = {}) {
  return {
    institutionName: "세화여자고등학교",
    address: "서울특별시 서초구",
    principal: "테스트 교장",
    trainingPeriod: "2026. 3. 2. ~ 9. 30.",
    instructor: "",
    totalCount: 84,
    completedCount: 51,
    referenceDate: "2026-12-31",
    educationHours: "1시간",
    educationMethod: "(인터넷) 복지부 위탁 기관",
    platformOrg: "",
    platformUrl: "",
    ...overrides,
  };
}

function parseXml(source, name) {
  const errors = [];
  const document = new DOMParser({
    onError(level, message) {
      if (level === "error" || level === "fatalError") errors.push(message);
    },
  }).parseFromString(source, "application/xml");
  assert.deepEqual(errors, [], `${name} must be well-formed XML`);
  assert.notEqual(document.documentElement?.nodeName, "parsererror", `${name} must have a document element`);
  return document;
}

async function generated(input = fixture()) {
  const bytes = await generateChildAbuseHwpxReport(input);
  const entries = unzipSync(bytes);
  return { bytes, entries, section: strFromU8(entries["Contents/section0.xml"]) };
}

test("generates a valid HWPX package with all required entries", async () => {
  const templateEntries = unzipSync(await readFile(fileURLToPath(templateUrl)));
  const { bytes, entries } = await generated();
  assert.equal(Buffer.from(bytes).subarray(0, 2).toString(), "PK");
  assert.equal(strFromU8(entries.mimetype), "application/hwp+zip");
  for (const name of requiredEntries) assert.ok(entries[name], `missing ${name}`);
  assert.deepEqual(Object.keys(entries).sort(), Object.keys(templateEntries).sort());
});

test("keeps every XML package entry well formed", async () => {
  const { entries } = await generated();
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.endsWith(".xml") || name.endsWith(".hpf")) parseXml(strFromU8(bytes), name);
  }
});

test("replaces every placeholder and removes the original sample values", async () => {
  const { section } = await generated();
  assert.equal(section.includes("{{"), false);
  for (const value of ["서울특별시 서초구", "테스트 교장", "2026. 3. 2. ~ 9. 30.", "84", "51", "*2026.12.31.기준"]) {
    assert.ok(section.includes(value), `missing replacement ${value}`);
  }
  for (const sample of ["오삼찬", "2025. 3. 4. ~ 12.16.", "93명", "*2025.12.31.기준"]) {
    assert.equal(section.includes(sample), false, `stale sample remains: ${sample}`);
  }
});

test("escapes XML-sensitive input while preserving Korean text", async () => {
  const value = "서울 & 서초 <보건> \"교육\" '담당'";
  const { section } = await generated(fixture({ address: value }));
  assert.ok(section.includes("서울 &amp; 서초 &lt;보건&gt; &quot;교육&quot; &apos;담당&apos;"));
  assert.equal(parseXml(section, "section0.xml").documentElement.textContent.includes(value), true);
});

test("validates counts and required fields", () => {
  assert.throws(() => normalizeChildAbuseHwpxInput(fixture({ totalCount: undefined })), /총 인원수/);
  assert.throws(() => normalizeChildAbuseHwpxInput(fixture({ completedCount: undefined })), /교육 수료인원/);
  assert.throws(() => normalizeChildAbuseHwpxInput(fixture({ totalCount: -1 })), ChildAbuseHwpxValidationError);
  assert.throws(() => normalizeChildAbuseHwpxInput(fixture({ completedCount: 85 })), /총 인원수보다 많을 수 없습니다/);
  assert.throws(() => normalizeChildAbuseHwpxInput(fixture({ trainingPeriod: " " })), /필수 결과보고서/);
  assert.throws(() => normalizeChildAbuseHwpxInput(fixture({ totalCount: 1.5 })), /정수/);
  assert.throws(() => normalizeChildAbuseHwpxInput(fixture({ referenceDate: "2026-02-30" })), /기준일/);
  assert.throws(() => normalizeChildAbuseHwpxInput(fixture({ address: "가".repeat(1001) })), /1,000자 이하/);
});

test("validates method-specific fields and allows unrelated blanks", () => {
  assert.throws(() => normalizeChildAbuseHwpxInput(fixture({ educationMethod: "집합 강사교육" })), /강사명/);
  assert.doesNotThrow(() => normalizeChildAbuseHwpxInput(fixture({ educationMethod: "집합 강사교육", instructor: "강사 (기관)" })));
  assert.throws(() => normalizeChildAbuseHwpxInput(fixture({ educationMethod: "(인터넷) 기타 원격교육기관" })), /기관명과 사이트 주소/);
  assert.doesNotThrow(() => normalizeChildAbuseHwpxInput(fixture({
    educationMethod: "(인터넷) 기타 원격교육기관",
    platformOrg: "원격교육기관",
    platformUrl: "https://example.test",
  })));
  assert.doesNotThrow(() => normalizeChildAbuseHwpxInput(fixture({ instructor: "", platformOrg: "", platformUrl: "" })));
  assert.deepEqual(
    normalizeChildAbuseHwpxInput(fixture({ instructor: "이전 강사", platformOrg: "이전 기관", platformUrl: "https://stale.example" })),
    fixture({ instructor: "", platformOrg: "", platformUrl: "", referenceDate: "2026.12.31." }),
  );
  assert.deepEqual(CHILD_ABUSE_EDUCATION_METHODS.length, 4);
});

test("preserves fixed evidence guidance, nested tables, and style references", async () => {
  const templateEntries = unzipSync(await readFile(fileURLToPath(templateUrl)));
  const templateSection = strFromU8(templateEntries["Contents/section0.xml"]);
  const { entries, section } = await generated();
  const fixedText = "교육방법에 따른 증빙자료 목록";
  assert.equal(section.includes(fixedText), true);
  assert.equal((section.match(/<hp:tbl\b/g) || []).length, (templateSection.match(/<hp:tbl\b/g) || []).length);
  assert.equal((section.match(/borderFillIDRef=/g) || []).length, (templateSection.match(/borderFillIDRef=/g) || []).length);
  assert.deepEqual(entries["Contents/header.xml"], templateEntries["Contents/header.xml"]);
  const header = strFromU8(entries["Contents/header.xml"]);
  const educationMethodStyle = header.match(/<hh:charPr id="33"[\s\S]*?<\/hh:charPr>/)?.[0] || "";
  assert.match(educationMethodStyle, /height="1000"/);
  assert.match(educationMethodStyle, /<hh:ratio hangul="90"/);
  assert.match(educationMethodStyle, /<hh:spacing hangul="-8"/);
  assert.equal((section.match(/charPrIDRef="33"/g) || []).length, 1);
});

test("modified placeholder paragraphs contain no stale line layout data", async () => {
  const { section } = await generated();
  const document = parseXml(section, "section0.xml");
  const reportTable = document.getElementsByTagName("hp:tbl")[1];
  const targetCells = new Set(["1:1", "2:1", "2:4", "3:1", "3:4", "4:1", "4:4", "5:1", "5:4", "7:1", "7:4"]);
  const rows = Array.from(reportTable.childNodes).filter((node) => node.nodeName === "hp:tr");
  const cells = rows.flatMap((row) => Array.from(row.childNodes).filter((node) => node.nodeName === "hp:tc"));
  for (const cell of cells) {
    const address = cell.getElementsByTagName("hp:cellAddr")[0];
    if (!address) continue;
    const key = `${address.getAttribute("rowAddr")}:${address.getAttribute("colAddr")}`;
    if (targetCells.has(key)) assert.equal(cell.getElementsByTagName("hp:linesegarray").length, 0, key);
  }
});

test("long text does not damage the package or fixed guidance", async () => {
  const longAddress = `서울특별시 서초구 ${"긴 주소 ".repeat(60)}`;
  const { section } = await generated(fixture({ address: longAddress }));
  const document = parseXml(section, "section0.xml");
  assert.ok(document.documentElement.textContent.includes(longAddress.trim()));
  assert.ok(document.documentElement.textContent.includes("교육방법에 따른 증빙자료 목록"));
});
