import { CURRENT_SCHOOL_YEAR, readJsonBody, readStaffDirectory, sendCors } from "./staffDirectory.js";
import { verifyCurrentStaffSubmissionIdentity } from "./tbSubmissionGuard.js";
import { trainingEnvironment } from "./trainingDeployment.js";
import { listQaTbWorkflowData, TbWorkflowError } from "./tbScreeningWorkflowStore.js";
import { joinTbScreeningWorkflow } from "../../src/lib/tbScreeningWorkflowModel.js";
import { HealthScreeningTypeError, listHealthScreeningTypes, readHealthScreeningType,
  readHealthScreeningTypeHistory, saveHealthScreeningType, unconfirmedScreeningType,
  validateScreeningYear } from "./healthScreeningTypeStore.js";

export async function handleHealthScreeningTypeRequest(req, res, {
  context = process.env, authAccess = verifyCurrentStaffSubmissionIdentity,
  directory = readStaffDirectory, database, time = () => new Date().toISOString(),
} = {}) {
  sendCors(res, "GET, POST, OPTIONS");
  const bad = (status, message) => res.status(status).json({ ok: false, message });
  if (trainingEnvironment(context) !== "qa") return bad(503, "검진 유형 기능은 QA 환경에서만 이용할 수 있습니다.");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["GET", "POST"].includes(req.method)) return bad(405, "지원하지 않는 요청입니다.");
  try {
    const input = req.method === "POST" ? await readJsonBody(req, { maxBytes: 8000 }) : req.query || {};
    if (!input || typeof input !== "object" || Array.isArray(input)) return bad(400, "요청 내용을 확인해 주세요.");
    const schoolYear = validateScreeningYear(input.schoolYear ?? CURRENT_SCHOOL_YEAR);
    const access = await authAccess(req, { context, schoolYear,
      workflowEnvironment: "qa", allowQaTbCertificateSynthetic: true, ...(database ? { database } : {}) });
    if (!access.ok) return bad(access.status, access.message);
    if (!Array.isArray(access.roles) || (!access.qaTbCertificateSynthetic && !access.roles.some((role) => ["staff", "homeroom", "health_teacher", "admin"].includes(role)))) return bad(403, "교직원 권한이 필요합니다.");
    if (input.environment !== undefined || input.context !== undefined) return bad(400, "배포 환경은 요청으로 지정할 수 없습니다.");
    const scope = input.scope || "self";
    if (!["self", "admin"].includes(scope)) return bad(400, "조회 범위를 확인해 주세요.");
    const admin = scope === "admin";
    if (admin && !access.roles.some((role) => ["health_teacher", "admin"].includes(role))) return bad(403, "관리 권한이 필요합니다.");
    if (!admin && input.staffId !== undefined && input.staffId !== access.staffId) return bad(403, "본인의 검진 유형만 이용할 수 있습니다.");
    let staff = [];
    if (admin) {
      const result = await directory({ allowInvalidEmploymentStatus: false });
      staff = result.directory.filter((person) => person.staffId && person.employmentStatus === "재직");
      if (input.staffId !== undefined && !staff.some((person) => person.staffId === input.staffId)) return bad(400, "현재 교직원 정보를 확인해 주세요.");
    }
    if (req.method === "GET") {
      if (!admin) {
        const item = await readHealthScreeningType(access.db, access.staffId, schoolYear);
        if (input.schoolYear === undefined) return res.status(200).json({ ok: true, item });
        const data = await listQaTbWorkflowData(access.db, { staffId: access.staffId, schoolYear, evidenceCursor: input.evidenceCursor || "", statusCursor: input.statusCursor || "" }, { context });
        const workflow = joinTbScreeningWorkflow({ staffId: access.staffId, schoolYear, route: item, evidence: data.evidence,
          status: data.statuses.find((status) => status.staffId === access.staffId), evidenceComplete: data.completeness.evidence });
        return res.status(200).json({ ok: true, item: { ...item, workflow }, datasets: { completeness: data.completeness, cursors: data.cursors } });
      }
      if (input.history === "true" || input.history === true) {
        if (!input.staffId) return bad(400, "교직원을 선택해 주세요.");
        return res.status(200).json({ ok: true, history: await readHealthScreeningTypeHistory(access.db, input.staffId, schoolYear) });
      }
      const items = await listHealthScreeningTypes(access.db, schoolYear);
      const byId = new Map(items.map((item) => [item.staffId, item]));
      const data = input.schoolYear === undefined ? null : await listQaTbWorkflowData(access.db, {
        schoolYear, evidenceCursor: input.evidenceCursor || "", statusCursor: input.statusCursor || "",
      }, { context });
      const evidenceById = new Map();
      const statusesById = new Map(data?.statuses.map((item) => [item.staffId, item]) || []);
      for (const item of data?.evidence || []) evidenceById.set(item.staffId, [...(evidenceById.get(item.staffId) || []), item]);
      return res.status(200).json({ ok: true, items: staff.map((person) => ({
        staffId: person.staffId, name: person.name, department: person.department, position: person.position,
        ...(byId.get(person.staffId) || unconfirmedScreeningType(person.staffId, schoolYear)),
        ...(data ? { workflow: joinTbScreeningWorkflow({ staffId: person.staffId, schoolYear,
          route: byId.get(person.staffId), evidence: evidenceById.get(person.staffId) || [],
          status: statusesById.get(person.staffId), evidenceComplete: data.completeness.evidence }) } : {}),
      })), ...(data ? { datasets: { completeness: data.completeness, cursors: data.cursors } } : {}) });
    }
    if (schoolYear !== CURRENT_SCHOOL_YEAR) return bad(400, "현재 학년도만 변경할 수 있습니다.");
    if (admin && (!input.staffId || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0)) return bad(400, "교직원과 현재 변경 번호를 확인해 주세요.");
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) return bad(400, "현재 변경 번호를 확인해 주세요.");
    const item = await saveHealthScreeningType(access.db, {
      staffId: admin ? input.staffId : access.staffId, schoolYear, screeningType: input.screeningType,
      source: admin ? "admin" : "self", confirmedBy: access.staffId,
      expectedRevision: input.expectedRevision, confirmedAt: time(),
    });
    return res.status(200).json({ ok: true, item });
  } catch (error) {
    if (error instanceof HealthScreeningTypeError || error instanceof TbWorkflowError) return bad(error.status, error.message);
    if (error instanceof SyntaxError || error?.code === "body-too-large") return bad(400, "요청 내용을 확인해 주세요.");
    return bad(503, "검진 유형을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
