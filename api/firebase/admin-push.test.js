import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_NOTIFICATION_LIST_LIMIT, getUnreadCount, readNotificationList } from "./admin-push.js";

function notificationDoc(id, overrides = {}) {
  return {
    id,
    data: () => ({ title: id, body: "body", destination: "/firebase-dashboard", read: false,
      createdAt: { toDate: () => new Date("2026-10-14T00:00:00.000Z") }, ...overrides }),
  };
}

function fakeDb({ recent = [], unreadCount = 0, acknowledged = [] } = {}) {
  const calls = { acknowledgementRefs: 0, listLimit: null, unreadAggregations: 0 };
  const acknowledgements = new Set(acknowledged);
  const items = {
    orderBy: () => ({
      limit: (value) => {
        calls.listLimit = value;
        return { get: async () => ({ docs: recent.slice(0, value) }) };
      },
    }),
    where: () => ({
      count: () => ({
        get: async () => {
          calls.unreadAggregations += 1;
          return { data: () => ({ count: unreadCount }) };
        },
      }),
    }),
  };
  const acknowledgementCollection = {
    doc: (id) => ({ id, kind: "acknowledgement" }),
  };
  const db = {
    collection: () => ({
      doc: () => ({
        collection: (name) => name === "items" ? items : acknowledgementCollection,
      }),
    }),
    getAll: async (...refs) => {
      calls.acknowledgementRefs += refs.length;
      return refs.map((ref) => ({ id: ref.id, exists: acknowledgements.has(ref.id) }));
    },
  };
  return { calls, db };
}

test("notification list reads twenty recent items, one count aggregation, and only their acknowledgements", async () => {
  const recent = Array.from({ length: 100 }, (_, index) => notificationDoc(`item-${index}`));
  const { calls, db } = fakeDb({ recent, unreadCount: 87, acknowledged: ["item-0"] });
  const result = await readNotificationList(db, "admin", false);

  assert.equal(ADMIN_NOTIFICATION_LIST_LIMIT, 20);
  assert.equal(calls.listLimit, 20);
  assert.equal(calls.unreadAggregations, 1);
  assert.equal(calls.acknowledgementRefs, 20);
  assert.equal(result.unreadCount, 87);
  assert.equal(result.notifications.length, 5);
  assert.equal(result.notifications.some((item) => item.id === "item-0"), false);
});

test("unread count uses aggregation without reading unread documents", async () => {
  const { calls, db } = fakeDb({ unreadCount: 321 });
  assert.equal(await getUnreadCount(db, "admin"), 321);
  assert.equal(calls.unreadAggregations, 1);
  assert.equal(calls.acknowledgementRefs, 0);
});
