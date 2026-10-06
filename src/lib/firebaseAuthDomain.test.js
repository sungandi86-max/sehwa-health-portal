import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FIREBASE_AUTH_DOMAIN, resolveFirebaseAuthDomain } from "./firebaseAuthDomain.js";

const PRODUCTION_HOST = "sehwa-health-portal.vercel.app";
const QA_HOST = "sehwa-health-portal-git-feature-217fc6-sungandi86-maxs-projects.vercel.app";

test("production uses its same-origin auth handler before the configured fallback", () => {
  assert.equal(resolveFirebaseAuthDomain(PRODUCTION_HOST, "custom.example"), PRODUCTION_HOST);
});

test("fixed QA preview uses its same-origin auth handler", () => {
  assert.equal(resolveFirebaseAuthDomain(QA_HOST, "custom.example"), QA_HOST);
});

test("localhost keeps the configured auth domain or Firebase default", () => {
  assert.equal(resolveFirebaseAuthDomain("localhost", "custom.example"), "custom.example");
  assert.equal(resolveFirebaseAuthDomain("127.0.0.1"), DEFAULT_FIREBASE_AUTH_DOMAIN);
});

test("unknown and per-deployment hosts do not become auth domains", () => {
  assert.equal(resolveFirebaseAuthDomain("unknown.example", "custom.example"), "custom.example");
  assert.equal(resolveFirebaseAuthDomain("sehwa-health-portal-54i0inqkx-sungandi86-maxs-projects.vercel.app"), DEFAULT_FIREBASE_AUTH_DOMAIN);
});
