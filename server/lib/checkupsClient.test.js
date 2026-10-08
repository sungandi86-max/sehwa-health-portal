import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCheckup } from "../../src/lib/checkups.js";

test("CMS checkup order follows the server-sorted list without a new response field", () => {
  const first = normalizeCheckup({ title: "1학년 건강검진 안내", buttonText: "안내 보기", url: "https://example.com/guide" }, 0);
  const second = normalizeCheckup({ title: "2·3학년 결핵검진 안내", displayMode: "pending", url: "안내문 링크" }, 1);
  assert.equal(first.order, 1);
  assert.equal(second.order, 2);
  assert.equal(first.linkUrl, "https://example.com/guide");
  assert.equal(second.linkUrl, "안내문 링크");
});
