import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdminStatusView } from "./adminStatusView.js";

test("explicit administrator status views select one focused workflow", () => {
  assert.equal(resolveAdminStatusView({ search: "?view=screening-types" }).id, "screening-types");
  assert.equal(resolveAdminStatusView({ search: "?view=research-check" }).id, "research-check");
  assert.equal(resolveAdminStatusView({ search: "?view=training-exceptions" }).id, "training-exceptions");
  assert.equal(resolveAdminStatusView({ search: "?view=cpr-completion&task=cpr-training-2026" }).id, "cpr-completion");
  assert.equal(resolveAdminStatusView({ search: "?view=tb-completion&task=tb-screening-2026" }).id, "tb-completion");
});

test("legacy task and hash links retain their focused view", () => {
  assert.equal(resolveAdminStatusView({ search: "?task=cpr-training-2026", hash: "#completion-status" }).id, "cpr-completion");
  assert.equal(resolveAdminStatusView({ hash: "#annual-screening-type" }).id, "screening-types");
  assert.equal(resolveAdminStatusView({ hash: "#training-source-check" }).id, "research-check");
  assert.equal(resolveAdminStatusView({ hash: "#legal-training-exceptions" }).id, "training-exceptions");
  assert.equal(resolveAdminStatusView({}).id, "completion");
});

test("unknown view values fail closed to the existing completion overview", () => {
  assert.equal(resolveAdminStatusView({ search: "?view=unknown" }).id, "completion");
});
