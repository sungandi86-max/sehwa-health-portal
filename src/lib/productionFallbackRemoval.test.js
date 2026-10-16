import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fetchPortalHome, fetchPortalContent, fetchPortalUploads } from "./portalContent.js";

test("portal browser loaders never retry non-JSON responses against production", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(url);
    return { ok: true, status: 200, headers: { get: () => "text/html" }, text: async () => "<html>fixture</html>" };
  });
  for (const load of [() => fetchPortalHome(), () => fetchPortalContent("today"), () => fetchPortalUploads()]) {
    const before = calls.length;
    await assert.rejects(load());
    assert.equal(calls.length, before + 1);
  }
  assert.ok(calls.every((url) => String(url).startsWith("/api/portal")));
});
test("App and administrator auth/receipt paths have no cross-origin retry or development override", () => {
  for (const path of ["../App.jsx", "../components/AdminAuthGate.jsx", "../pages/AdminReceiptStatusPage.jsx", "./portalContent.js"]) {
    const source = fs.readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /DEV_.*FALLBACK|https:\/\/sehwa-health-portal\.vercel\.app\/api|preview=local/);
  }
});
