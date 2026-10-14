import assert from "node:assert/strict";
import test from "node:test";
import { createAdminNotificationRequestCache } from "./adminNotificationRequestCache.js";

test("notification cache deduplicates simultaneous refreshes", async () => {
  const cache = createAdminNotificationRequestCache();
  let calls = 0;
  let resolveRequest;
  const loader = () => {
    calls += 1;
    return new Promise((resolve) => { resolveRequest = resolve; });
  };

  const focusRefresh = cache.run("admin:active", loader);
  const visibilityRefresh = cache.run("admin:active", loader);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveRequest({ unreadCount: 2 });
  assert.deepEqual(await focusRefresh, { unreadCount: 2 });
  assert.deepEqual(await visibilityRefresh, { unreadCount: 2 });
});

test("notification cache reuses route results within TTL", async () => {
  let now = 1_000;
  const cache = createAdminNotificationRequestCache({ ttlMs: 45_000, now: () => now });
  let calls = 0;
  const loader = async () => ({ request: ++calls });

  assert.deepEqual(await cache.run("admin:active", loader), { request: 1 });
  now += 30_000;
  assert.deepEqual(await cache.run("admin:active", loader), { request: 1 });
  assert.equal(calls, 1);
});

test("forced foreground refresh bypasses TTL but shares an in-flight request", async () => {
  const cache = createAdminNotificationRequestCache();
  await cache.run("admin:active", async () => ({ request: 1 }));
  let calls = 0;
  let resolveRequest;
  const loader = () => {
    calls += 1;
    return new Promise((resolve) => { resolveRequest = resolve; });
  };

  const foregroundRefresh = cache.run("admin:active", loader, { force: true });
  const customEventRefresh = cache.run("admin:active", loader, { force: true });
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveRequest({ request: 2 });
  assert.deepEqual(await foregroundRefresh, { request: 2 });
  assert.deepEqual(await customEventRefresh, { request: 2 });
});
