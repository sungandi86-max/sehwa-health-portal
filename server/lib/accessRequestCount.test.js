import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { countAccessRequests } from "../../api/firebase/access-requests.js";

const accessRequestSource = readFileSync(
  new URL("../../api/firebase/access-requests.js", import.meta.url),
  "utf8"
);

test("pending access request count uses aggregation without fetching documents", async () => {
  let aggregateCalls = 0;
  let documentReads = 0;
  const queryRef = {
    count: () => ({
      get: async () => {
        aggregateCalls += 1;
        return { data: () => ({ count: 150 }) };
      },
    }),
    get: async () => {
      documentReads += 1;
      return { docs: [] };
    },
  };

  assert.equal(await countAccessRequests(queryRef), 150);
  assert.equal(aggregateCalls, 1);
  assert.equal(documentReads, 0);
});

test("dashboard count mode returns aggregation before the bounded list fetch", () => {
  const aggregationBranch = accessRequestSource.indexOf('mode === "count" && !requestType');
  const listFetch = accessRequestSource.indexOf("baseQuery.limit(ACCESS_REQUEST_LIMIT).get()", aggregationBranch);

  assert.notEqual(aggregationBranch, -1);
  assert.notEqual(listFetch, -1);
  assert.ok(aggregationBranch < listFetch);
});
