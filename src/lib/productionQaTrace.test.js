import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dangerActionsUrl = new URL("../components/FirebaseUserDangerActions.jsx", import.meta.url);
const userAccountApiUrl = new URL("../../api/firebase/admin/user-account.js", import.meta.url);

test("Production account management copy does not expose test-account wording", async () => {
  const [dangerActionsSource, userAccountApiSource] = await Promise.all([
    readFile(dangerActionsUrl, "utf8"),
    readFile(userAccountApiUrl, "utf8"),
  ]);

  assert.doesNotMatch(dangerActionsSource, /테스트 계정/);
  assert.doesNotMatch(userAccountApiSource, /테스트 계정/);
});
