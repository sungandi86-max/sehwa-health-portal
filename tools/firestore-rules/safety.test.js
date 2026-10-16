import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { PROJECT_ID, requireLocalTarget } from "./safety.mjs";
for (const [project, endpoint] of [["sehwa-health-portal-v2", "127.0.0.1:8080"], ["real-qa", "127.0.0.1:8080"],
  [PROJECT_ID, "firestore.googleapis.com:443"], [PROJECT_ID, "0.0.0.0:8080"], [PROJECT_ID, "localhost:8080"],
  [PROJECT_ID, "127.0.0.1:0"], [PROJECT_ID, "127.0.0.1:99999"]]) {
  test(`runner rejects nonlocal/ambiguous target ${project} ${endpoint}`, () => assert.throws(() => requireLocalTarget(project, endpoint), /LOCAL_EMULATOR_TARGET_REQUIRED/));
}
test("runner accepts only fixed demo project and explicit loopback port", () => {
  assert.deepEqual(requireLocalTarget(PROJECT_ID, "127.0.0.1:8080"), { host: "127.0.0.1", port: 8080 });
});
test("missing jar fails before Java, fixture writes or any connection", () => {
  const result = spawnSync(process.execPath, [new URL("run.mjs", import.meta.url).pathname], { env: { PATH: process.env.PATH }, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /EMULATOR_JAR_REQUIRED/);
  assert.equal(result.stdout, "");
});
