import { CURRENT_SCHOOL_YEAR, readJsonBody, readStaffDirectory, sendCors } from "./staffDirectory.js";
import { verifyCurrentStaffSubmissionIdentity } from "./tbSubmissionGuard.js";
import { trainingEnvironment } from "./trainingDeployment.js";
import { readHealthScreeningType, HealthScreeningTypeError, validateScreeningYear } from "./healthScreeningTypeStore.js";
import { listProductionTbWorkflowData, reviewProductionTbEvidence, TbWorkflowError } from "./tbScreeningWorkflowStore.js";
import { joinTbScreeningWorkflow } from "../../src/lib/tbScreeningWorkflowModel.js";

export async function handleTbScreeningWorkflowRequest(req, res, {
  context = process.env,
  authAccess = verifyCurrentStaffSubmissionIdentity,
  database,
  directory = readStaffDirectory,
  time = () => new Date().toISOString(),
} = {}) {
  sendCors(res, "GET, POST, OPTIONS");
  res.setHeader("Cache-Control", "private, no-store");
  const bad = (status, message) => res.status(status).json({ ok: false, message });
  if (trainingEnvironment(context) !== "production") return bad(503, "운영 환경에서만 이용할 수 있습니다.");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["GET", "POST"].includes(req.method)) return bad(405, "지원하지 않는 요청입니다.");
  try {
    const input = req.method === "POST" ? await readJsonBody(req, { maxBytes: 8000 }) : req.query || {};
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        ["environment", "context", "actor", "roles"].some((key) => input[key] !== undefined)) {
      return bad(400, "요청 내용을 확인해 주세요.");
    }
    const schoolYear = validateScreeningYear(input.schoolYear);
    const access = await authAccess(req, { context, ...(database ? { database } : {}) });
    if (!access.ok) return bad(access.status, access.message);
    if (!access.roles?.some((role) => ["staff", "homeroom", "health_teacher", "admin"].includes(role))) {
      return bad(403, "교직원 권한이 필요합니다.");
    }
    const scope = input.scope || "self";
    if (!["self", "admin"].includes(scope)) return bad(400, "조회 범위를 확인해 주세요.");
    const admin = scope === "admin";
    if (admin && !access.roles.some((role) => ["health_teacher", "admin"].includes(role))) {
      return bad(403, "관리 권한이 필요합니다.");
    }
    if (!admin && input.staffId !== undefined && input.staffId !== access.staffId) {
      return bad(403, "본인의 자료만 이용할 수 있습니다.");
    }
    if (admin && !input.staffId) return bad(400, "교직원을 선택해 주세요.");
    const staffId = admin ? input.staffId : access.staffId;
    if (admin) {
      const roster = await directory({ allowInvalidEmploymentStatus: false });
      if (!roster.directory.some((person) => person.staffId === staffId && person.employmentStatus === "재직")) {
        return bad(400, "현재 교직원 정보를 확인해 주세요.");
      }
    }
    if (req.method === "GET") {
      const [route, data] = await Promise.all([
        readHealthScreeningType(access.db, staffId, schoolYear, context),
        listProductionTbWorkflowData(access.db, {
          staffId,
          schoolYear,
          evidenceCursor: input.evidenceCursor || "",
          statusCursor: input.statusCursor || "",
          limit: input.limit === undefined ? 100 : Number(input.limit),
        }),
      ]);
      return res.status(200).json({
        ok: true,
        item: joinTbScreeningWorkflow({
          staffId,
          schoolYear,
          route,
          evidence: data.evidence,
          status: data.statuses.find((item) => item.staffId === staffId),
          evidenceComplete: data.completeness.evidence,
        }),
        datasets: { completeness: data.completeness, cursors: data.cursors },
      });
    }
    if (!admin || schoolYear !== CURRENT_SCHOOL_YEAR) return bad(400, "현재 학년도 관리 요청을 확인해 주세요.");
    const item = await reviewProductionTbEvidence(access.db, {
      action: input.action,
      staffId,
      submissionId: input.submissionId,
      schoolYear,
      expectedRevision: input.expectedRevision,
      actor: access.staffId,
    }, { now: time });
    return res.status(200).json({ ok: true, item });
  } catch (error) {
    if (error instanceof TbWorkflowError || error instanceof HealthScreeningTypeError) {
      return bad(error.status, error.message);
    }
    if (error instanceof SyntaxError || error?.code === "body-too-large") return bad(400, "요청 내용을 확인해 주세요.");
    return bad(503, "확인 자료를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
