import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("annual panels have no automatic save on open or filter changes", () => {
  for (const path of ["../components/HealthScreeningTypePanel.jsx", "../components/HealthScreeningTypeAdminPanel.jsx"]) {
    const text = source(path);
    const effects = [...text.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\}, \[/g)];
    assert.ok(effects.length);
    for (const effect of effects) assert.doesNotMatch(effect[1], /saveHealthScreeningType/);
    assert.match(text, /onSubmit=/);
  }
});

test("fixed QA blocks legacy completion write before Firestore persistence", () => {
  const text = source("./staffSubmissionStatusAdmin.js");
  const writer = text.slice(text.indexOf("export async function updateAdminTbScreeningStatus"));
  assert.ok(writer.indexOf("isHealthScreeningTypeQaHost") < writer.indexOf("await setDoc"));
  assert.match(writer, /isHealthScreeningTypeQaHost.*throw new Error/);
});

test("certificate and proxy writers do not import or write annual type ledger", () => {
  for (const path of ["../../server/lib/tbScreeningStatus.js", "../../server/lib/adminProxySubmission.js", "../../api/submit.js"]) {
    assert.doesNotMatch(source(path), /healthScreeningType|staff_health_screening_types/);
  }
});
