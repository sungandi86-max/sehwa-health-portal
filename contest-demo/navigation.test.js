import assert from "node:assert/strict";
import test from "node:test";
import { matchesDemoDestination } from "./navigation.js";

const matches = (destination, url) => matchesDemoDestination(destination, new URL(url, "https://demo.invalid"));

test("the standard landing page accepts share and tracking parameters", () => {
  assert.ok(matches("/", "/"));
  assert.ok(matches("/", "/?utm_source=qr#intro"));
  assert.ok(matches("/", "/index.html?utm_source=qr"));
  assert.ok(!matches("/", "/firebase-dashboard?utm_source=qr"));
});

test("deep links accept trailing slashes and unrelated query parameters", () => {
  assert.ok(matches("/firebase-checkups/live", "/firebase-checkups/live/?utm_source=qr"));
  const cpr = "/firebase-admin/staff-submission-status?view=cpr-completion&task=cpr-training-2026";
  assert.ok(matches(cpr, "/firebase-admin/staff-submission-status?task=cpr-training-2026&utm_source=qr&view=cpr-completion"));
  assert.ok(!matches(cpr, "/firebase-admin/staff-submission-status?view=completion"));
  assert.ok(!matches(cpr, "/firebase-admin/staff-submission-status?view=cpr-completion&task=other"));
});
