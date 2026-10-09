import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync("apps-script/Code.gs", "utf8");

function appsScriptContext() {
  const reads = [];
  const context = vm.createContext({
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    SpreadsheetApp: {
      openById() {
        reads.push("spreadsheet");
        throw new Error("legacy settings must not be read");
      },
    },
  });
  vm.runInContext(source, context, { timeout: 2000 });
  vm.runInContext(`
    jsonOutput_ = (value) => value;
    verifyStudentCareProxySecret_ = (params) => ({ ok: params.proxySecret === "test-proxy" });
    getSpreadsheet_ = () => ({ getSheetByName: () => null });
    buildAdminReceiptSections_ = () => [];
    buildAdminReceiptAlert_ = () => null;
  `, context);
  return { context, reads };
}

test("legacy admin password is rejected before reading the retired settings Sheet", () => {
  const { context, reads } = appsScriptContext();
  const get = JSON.parse(vm.runInContext(
    'JSON.stringify(doGet({ parameter: { action: "verifyAdminMaster", password: "old-password" } }))', context,
  ));
  const post = JSON.parse(vm.runInContext(
    'JSON.stringify(doPost({ postData: { contents: JSON.stringify({ action: "verifyAdminMaster", password: "old-password" }) } }))', context,
  ));
  assert.equal(get.result, "error");
  assert.equal(post.result, "error");
  assert.match(get.message, /종료되었습니다/);
  assert.deepEqual(reads, []);
});

test("server proxy remains the only Apps Script admin receipt access", () => {
  const { context, reads } = appsScriptContext();
  const denied = JSON.parse(vm.runInContext(
    'JSON.stringify(verifyAdminMaster_({ proxySecret: "wrong", password: "old-password" }))', context,
  ));
  const allowed = JSON.parse(vm.runInContext(
    'JSON.stringify(verifyAdminMaster_({ proxySecret: "test-proxy" }))', context,
  ));
  assert.equal(denied.result, "error");
  assert.equal(allowed.success, true);
  assert.deepEqual(reads, []);
});

test("runtime Apps Script no longer names the retired settings Sheet", () => {
  assert.equal(source.includes("앱_설정"), false);
  assert.equal(source.includes("getAppConfig_"), false);
  assert.equal(source.includes("getPortalAppConfigValues_"), false);
  assert.equal(source.includes("testTbConfig"), false);
});
