import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("CMS admin route skips unsupported portal admin preload", () => {
  const source = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const skippedPaths = source.match(/const shouldSkipPortalPreload = \[([\s\S]*?)\]\.includes/)?.[1] || "";

  assert.match(skippedPaths, /"\/admin\/content"/, "CMS admin route must not request the removed portal admin scope");
});
