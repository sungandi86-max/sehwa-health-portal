import test from "node:test";
import assert from "node:assert/strict";
import { selectTrainingTargets } from "../../common/trainingTargetSelection.js";

const directory = [
  { staffId: "T1", name: "교원", position: "교사", department: "교무부", employmentStatus: "재직" },
  { staffId: "T2", name: "행정", position: "주무관", department: "행정실", employmentStatus: "재직" },
  { staffId: "T3", name: "강사", position: "시간강사", department: "교무부", employmentStatus: "재직" },
  { staffId: "T4", name: "기간제 미분류", position: "교사", department: "연구부", employmentStatus: "재직", nonRegular: "O" },
  { staffId: "T5", name: "휴직", position: "교사", department: "교무부", employmentStatus: "휴직" },
];
const options = { preset: "all", includeAdministrativeStaff: true, includeHourlyInstructors: true,
  department: "", includeStaffIds: [], excludeStaffIds: [] };
const ids = (value) => selectTrainingTargets(directory, value).members.map((person) => person.staffId);

test("training presets use only explicit position and department fields", () => {
  assert.deepEqual(ids(options), ["T1", "T2", "T3", "T4"]);
  assert.deepEqual(ids({ ...options, preset: "teachers", includeAdministrativeStaff: false }), ["T1", "T3", "T4"]);
  assert.deepEqual(ids({ ...options, includeHourlyInstructors: false }), ["T1", "T2", "T4"]);
  assert.deepEqual(ids({ ...options, department: "교무부" }), ["T1", "T3"]);
  assert.deepEqual(ids({ ...options, preset: "manual", includeStaffIds: ["T2", "T1"], excludeStaffIds: ["T2"] }), ["T1"]);
});

test("selection rejects inactive, unknown and duplicate canonical roster identities", () => {
  assert.throws(() => ids({ ...options, includeStaffIds: ["T5"] }), /교직원ID/);
  assert.throws(() => ids({ ...options, includeStaffIds: ["FAKE"] }), /교직원ID/);
  assert.throws(() => ids({ ...options, department: "없는 부서" }), /부서/);
  assert.throws(() => selectTrainingTargets([...directory, directory[0]], options), /교직원명단/);
  assert.deepEqual(ids({ ...options, includeStaffIds: ["T1", "T1"] }), ["T1", "T2", "T3", "T4"]);
});
