import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync("apps-script/Code.gs", "utf8");

test("student care portal and retired private-link action do not read the legacy tab", () => {
  const reads = [];
  const context = vm.createContext({
    Utilities: { formatDate: () => "2026-10-09 12:00:00" },
    __sheet: {
      getSheetByName(name) {
        reads.push(name);
        return null;
      },
    },
  });
  vm.runInContext(source, context, { timeout: 2000 });
  vm.runInContext(`
    getSpreadsheet_ = () => __sheet;
    jsonOutput_ = (value) => value;
  `, context);

  const portal = JSON.parse(vm.runInContext("JSON.stringify(getPortalData_())", context));
  const retired = JSON.parse(vm.runInContext(
    'JSON.stringify(doGet({ parameter: { action: "verifyPrivate" } }))', context,
  ));

  assert.equal("studentCare" in portal, false);
  assert.equal(retired.result, "error");
  assert.equal("url" in retired, false);
  assert.deepEqual(reads, ["앱_메신저문구"]);
  assert.equal(source.includes("앱_학생건강관리"), false);
  assert.equal(source.includes("portalStudentCare"), false);
  assert.equal(source.includes("getStudentCare_"), false);
});

test("backup integrity keeps the visit tab but no longer requires the legacy menu tab", () => {
  const context = vm.createContext({
    SpreadsheetApp: {
      openById: () => ({ getSheets: () => [{ getName: () => "학생 보건실 입실현황" }] }),
    },
  });
  vm.runInContext(source, context, { timeout: 2000 });

  const result = JSON.parse(vm.runInContext(
    'JSON.stringify(readHealthRoomBackupIntegrity_("test-workbook"))', context,
  ));
  assert.equal(result.expectedSheetCount, 4);
  assert.equal(result.missingSheets.includes("학생 보건실 입실현황"), false);
  assert.equal(result.missingSheets.includes("앱_학생건강관리"), false);
});
