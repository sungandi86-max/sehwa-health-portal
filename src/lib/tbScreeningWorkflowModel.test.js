import test from "node:test";
import assert from "node:assert/strict";
import { joinTbScreeningWorkflow } from "./tbScreeningWorkflowModel.js";

const staffId = "T049";
const schoolYear = 2026;
const route = (overrides = {}) => ({
  staffId,
  schoolYear,
  screeningType: "individual",
  screeningTypeConfirmed: true,
  selfChoice: null,
  ...overrides,
});
const evidence = (overrides = {}) => ({
  submissionId: "self-1",
  staffId,
  subjectStaffId: staffId,
  schoolYear,
  environment: "production",
  source: "portal",
  submissionMode: "self",
  identityConfirmed: true,
  status: "pending",
  reviewState: "pending",
  submittedAt: "2026-10-10T00:00:00.000Z",
  evidenceFiles: [{ fileId: "drive-1" }],
  migration: { imported: false },
  ...overrides,
});

function project({ annualRoute = route(), evidenceItems = [], status = null } = {}) {
  return joinTbScreeningWorkflow({ staffId, schoolYear, route: annualRoute, evidence: evidenceItems, status });
}

test("authenticated self choice is a confirmation basis", () => {
  const workflow = project({ annualRoute: route({
    source: "self",
    selfChoice: { screeningType: "individual", confirmedBy: staffId, confirmedAt: "2026-10-01T00:00:00.000Z" },
  }) });
  assert.equal(workflow.confirmationBasis, "self_choice");
});

test("authenticated self submission is a confirmation basis without completing screening", () => {
  const workflow = project({ evidenceItems: [evidence()] });
  assert.equal(workflow.confirmationBasis, "self_submission");
  assert.equal(workflow.completed, false);
});

test("administrator proxy submission never becomes self confirmation", () => {
  const workflow = project({ evidenceItems: [evidence({
    submissionId: "proxy-1",
    submissionMode: "admin_proxy",
    submittedByStaffId: "T001",
  })] });
  assert.equal(workflow.confirmationBasis, "none");
});

test("administrator evidence approval supersedes other confirmation bases", () => {
  const approved = evidence({ submissionId: "approved-1", status: "completed", reviewState: "confirmed" });
  const workflow = project({
    annualRoute: route({ source: "self", selfChoice: { screeningType: "individual", confirmedBy: staffId } }),
    evidenceItems: [approved],
    status: { staffId, schoolYear, status: "completed", sourceType: "admin_confirmation",
      evidenceSubmissionId: approved.submissionId, screening: { completed: true } },
  });
  assert.equal(workflow.confirmationBasis, "admin_evidence_confirmation");
  assert.equal(workflow.confirmationEvidenceSubmissionId, approved.submissionId);
  assert.equal(workflow.completed, true);
});

test("rejected invalid cancelled and withdrawn evidence never confirms identity", () => {
  for (const [field, value] of [["status", "rejected"], ["status", "cancelled"], ["status", "withdrawn"], ["reviewState", "invalid"]]) {
    const workflow = project({ evidenceItems: [evidence({ [field]: value })] });
    assert.equal(workflow.confirmationBasis, "none", `${field}=${value}`);
  }
});

test("legacy evidence never becomes self confirmation", () => {
  const workflow = project({ evidenceItems: [evidence({
    source: "legacy_sheet_migration",
    submissionMode: "",
    migration: { imported: true },
  })] });
  assert.equal(workflow.confirmationBasis, "none");
});

test("latest valid self submission is selected deterministically", () => {
  const workflow = project({ evidenceItems: [
    evidence({ submissionId: "older", submittedAt: "2026-10-01T00:00:00.000Z" }),
    evidence({ submissionId: "newer", submittedAt: "2026-10-12T00:00:00.000Z", evidenceFiles: [{ fileId: "drive-2" }] }),
    evidence({ submissionId: "invalid-latest", submittedAt: "2026-10-13T00:00:00.000Z", reviewState: "invalid" }),
  ] });
  assert.equal(workflow.confirmationBasis, "self_submission");
  assert.equal(workflow.confirmationEvidenceSubmissionId, "newer");
});

test("foreign staff evidence cannot confirm another person", () => {
  const workflow = project({ evidenceItems: [evidence({ staffId: "T999", subjectStaffId: "T999" })] });
  assert.equal(workflow.confirmationBasis, "none");
});

test("existing completion and audit state remain unchanged in projection", () => {
  const status = { staffId, schoolYear, status: "completed", sourceType: "admin_confirmation",
    evidenceSubmissionId: "approved-1", confirmedBy: "T001", confirmedAt: "2026-10-11T00:00:00.000Z",
    screening: { completed: true }, confirmationHistory: [{ revision: 1 }] };
  const before = structuredClone(status);
  const workflow = project({ evidenceItems: [evidence({ submissionId: "approved-1", status: "completed", reviewState: "confirmed" })], status });
  assert.equal(workflow.completed, true);
  assert.deepEqual(status, before);
});

test("an invalidated approved evidence preserves completion but no longer claims that evidence as confirmation basis", () => {
  const workflow = project({
    evidenceItems: [evidence({ submissionId: "approved-1", status: "rejected", reviewState: "invalid" })],
    status: { staffId, schoolYear, status: "completed", sourceType: "admin_confirmation",
      evidenceSubmissionId: "approved-1", discrepancy: true, screening: { completed: true } },
  });
  assert.equal(workflow.completed, true);
  assert.equal(workflow.confirmationBasis, "none");
});
