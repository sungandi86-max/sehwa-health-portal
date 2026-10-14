import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RECENT_SCAN_LIMIT, selectActionableRecentItems } from "./dashboardRecent.js";

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
