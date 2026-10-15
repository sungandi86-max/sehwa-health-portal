import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RECENT_SCAN_LIMIT, selectActionableRecentItems } from "./dashboardRecent.js";
import { buildDashboardTaskCards, getTbDashboardCounts } from "./dashboardTasks.js";

const dashboardSource = readFileSync(new URL("./dashboardSummary.js", import.meta.url), "utf8");

function submission(id, status, submittedAtMillis) {
  return {
    id,
    status,
    submittedAtMillis,
  };
}

test("recent dashboard items use a fixed scan window and keep only five actionable records", () => {
  const records = Array.from({ length: RECENT_SCAN_LIMIT + 5 }, (_, index) =>
    submission(`item-${index}`, index % 3 === 0 ? "completed" : "submitted", 100 - index)
  );

  const result = selectActionableRecentItems(records);

  assert.equal(RECENT_SCAN_LIMIT, 20);
  assert.equal(result.length, 5);
  assert.deepEqual(result.map((item) => item.id), ["item-1", "item-2", "item-4", "item-5", "item-7"]);
});

test("recent dashboard selection preserves an empty state when the bounded window is completed", () => {
  const records = Array.from({ length: RECENT_SCAN_LIMIT }, (_, index) =>
    submission(`item-${index}`, "completed", 100 - index)
  );

  assert.deepEqual(selectActionableRecentItems(records), []);
});

test("dashboard recent reads use one bounded query and reuse the current-term infection snapshot", () => {
  assert.equal(dashboardSource.includes("startAfter"), false);
  assert.equal(dashboardSource.includes("while (items.length"), false);
  assert.match(dashboardSource, /limit\(RECENT_SCAN_LIMIT\)/);
  assert.match(dashboardSource, /currentTermInfectionDocuments\.map\(normalizeInfectionSubmission\)/);
  assert.equal(dashboardSource.includes("infectionTodayQuery"), false);
  assert.equal(dashboardSource.includes("recentInfectionQuery"), false);
});

test("TB dashboard counts keep route, evidence review, and completion separate", () => {
  const result = getTbDashboardCounts([
    { staffId: "A", selfChoice: null, workflow: { evidence: [], completed: false } },
    { staffId: "B", screeningTypeConfirmed: true, selfChoice: { screeningType: "individual" }, workflow: { evidence: [{ reviewState: "pending" }], completed: false } },
    { staffId: "C", screeningTypeConfirmed: true, selfChoice: { screeningType: "nhis" }, workflow: { evidence: [{ reviewState: "confirmed" }], completed: true } },
    { staffId: "D", screeningTypeConfirmed: true, selfChoice: { screeningType: "none" }, workflow: { evidence: [], completed: false } },
    { staffId: "E", screeningTypeConfirmed: true, selfChoice: null, source: "admin", workflow: { evidence: [], completed: false } },
  ]);

  assert.deepEqual(result, { routeUnconfirmed: 1, evidencePending: 1, incomplete: 4 });
});

test("dashboard task cards preserve the six operational definitions and routes", () => {
  const cards = buildDashboardTaskCards({
    counts: { pendingStaffCount: 4, pendingInfectionCount: 2 },
    pendingAccessCount: 3,
    tbCounts: { routeUnconfirmed: 5, evidencePending: 6, incomplete: 7 },
  });

  assert.deepEqual(cards.map((item) => item.count), [4, 2, 3, 5, 6, 7]);
  assert.equal(cards.length, 6);
  assert.equal(cards[3].href, "/firebase-admin/staff-submission-status#annual-screening-type");
});

test("dashboard task cards do not turn unavailable data into a false zero", () => {
  const cards = buildDashboardTaskCards({ counts: {}, pendingAccessCount: null, tbCounts: null });
  assert.equal(cards[2].count, null);
  assert.equal(cards[3].count, null);
  assert.equal(cards[4].count, null);
  assert.equal(cards[5].count, null);
});
