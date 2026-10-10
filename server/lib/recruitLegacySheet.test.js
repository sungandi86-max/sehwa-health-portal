import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const legacySheetName = "응답_채용검진확인요청";
const source = fs.readFileSync("apps-script/Code.gs", "utf8");

test("admin receipt summary does not read the retired recruit sheet", () => {
  const reads = [];
  const context = vm.createContext({
    Utilities: { formatDate: () => "2026-10-09" },
    __spreadsheet: {
      getSheetByName(name) {
        reads.push(name);
        return null;
      },
    },
  });
  vm.runInContext(source, context, { timeout: 2000 });

  const sections = JSON.parse(vm.runInContext(
    "JSON.stringify(buildAdminReceiptSections_(__spreadsheet))", context,
  ));
  assert.deepEqual(sections.map((section) => section.items.map((item) => item.id)), [
    ["tb", "cpr"],
    [],
  ]);
  assert.equal(reads.includes(legacySheetName), false);
  assert.equal(reads.includes("응답_인바디측정신청"), false);
});

test("backup integrity does not require the retired recruit sheet", () => {
  const context = vm.createContext({
    SpreadsheetApp: {
      openById: () => ({
        getSheets: () => [
          "학생 보건실 입실현황",
          "응답_심폐소생술이수증",
          "응답_결핵검진확인증",
        ].map((name) => ({ getName: () => name })),
      }),
    },
  });
  vm.runInContext(source, context, { timeout: 2000 });

  const result = JSON.parse(vm.runInContext(
    'JSON.stringify(readHealthRoomBackupIntegrity_("test-workbook"))', context,
  ));
  assert.equal(result.expectedSheetCount, 3);
  assert.deepEqual(result.missingSheets, []);
});

test("retired recruit sheet name is absent from runtime sources", () => {
  for (const path of [
    "apps-script/Code.gs",
    "src/components/SubmitModal.jsx",
    "src/components/UploadCenter.jsx",
    "src/pages/FirebaseSubmissionsPage.jsx",
  ]) {
    assert.equal(fs.readFileSync(path, "utf8").includes(legacySheetName), false, path);
  }
});
