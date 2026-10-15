import { JWT } from "google-auth-library";
import { getFirebaseServiceAccount } from "./firebaseAdmin.js";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER, readJsonBody, readStaffDirectory, sendCors } from "./staffDirectory.js";
import { verifyCurrentStaffSubmissionIdentity } from "./tbSubmissionGuard.js";
import { trainingEnvironment } from "./trainingDeployment.js";
import { validateScreeningYear, readHealthScreeningType, HealthScreeningTypeError } from "./healthScreeningTypeStore.js";
import { listQaTbWorkflowData, reviewQaTbEvidence, TbWorkflowError } from "./tbScreeningWorkflowStore.js";
import { joinTbScreeningWorkflow } from "../../src/lib/tbScreeningWorkflowModel.js";
import { verifyQaTbScriptEvidence } from "./qaTbEvidenceMetadata.js";

export async function verifyQaTbEvidenceFile(fileId, context = process.env, { request } = {}) {
  if (trainingEnvironment(context) !== "qa" || !context.QA_TB_CERTIFICATE_DRIVE_FOLDER_ID) return false;
  let readMetadata = request;
  if (!readMetadata) {
    const credentials = getFirebaseServiceAccount();
    if (!credentials?.client_email || !credentials.private_key) return false;
    const auth = new JWT({ email: credentials.client_email, key: credentials.private_key, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
    readMetadata = (options) => auth.request(options);
  }
  const folderId = context.QA_TB_CERTIFICATE_DRIVE_FOLDER_ID;
  const base = "https://www.googleapis.com/drive/v3/files/";
  const [file, folder, filePermissions, folderPermissions] = await Promise.all([
    readMetadata({ url: `${base}${encodeURIComponent(fileId)}`, params: { fields: "id,trashed,parents,driveId" } }),
    readMetadata({ url: `${base}${encodeURIComponent(folderId)}`, params: { fields: "id,trashed,mimeType,driveId" } }),
    readMetadata({ url: `${base}${encodeURIComponent(fileId)}/permissions`, params: { fields: "permissions(type)" } }),
    readMetadata({ url: `${base}${encodeURIComponent(folderId)}/permissions`, params: { fields: "permissions(type)" } }),
  ]);
  const privatePermissions = (response) => Array.isArray(response.data?.permissions)
    && response.data.permissions.length > 0
    && response.data.permissions.every((permission) => ["user", "group"].includes(permission.type));
  return file.data.id === fileId && file.data.trashed === false && !file.data.driveId
    && file.data.parents?.length === 1 && file.data.parents[0] === folderId
    && folder.data.id === folderId && folder.data.trashed === false && !folder.data.driveId
    && folder.data.mimeType === "application/vnd.google-apps.folder"
    && privatePermissions(filePermissions) && privatePermissions(folderPermissions);
}

export async function handleTbScreeningWorkflowRequest(req, res, {
  context = process.env, authAccess = verifyCurrentStaffSubmissionIdentity, database,
  directory = readStaffDirectory, verifyEvidenceFile = (id) => verifyQaTbScriptEvidence(id, { context }),
  time = () => new Date().toISOString(),
} = {}) {
  sendCors(res, "GET, POST, OPTIONS");
  res.setHeader("Cache-Control", "private, no-store");
  const bad = (status, message) => res.status(status).json({ ok: false, message });
  if (trainingEnvironment(context) !== "qa") return bad(503, "QA 환경에서만 이용할 수 있습니다.");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["GET", "POST"].includes(req.method)) return bad(405, "지원하지 않는 요청입니다.");
  try {
    const input = req.method === "POST" ? await readJsonBody(req, { maxBytes: 8000 }) : req.query || {};
    if (!input || typeof input !== "object" || Array.isArray(input) || ["environment", "context", "actor", "roles"].some((key) => input[key] !== undefined)) return bad(400, "요청 내용을 확인해 주세요.");
    const schoolYear = validateScreeningYear(input.schoolYear);
    const access = await authAccess(req, { context, schoolYear, workflowEnvironment: "qa", allowQaTbCertificateSynthetic: true, ...(database ? { database } : {}) });
    if (!access.ok) return bad(access.status, access.message);
    if (!access.qaTbCertificateSynthetic && !access.roles?.some((role) => ["staff", "homeroom", "health_teacher", "admin"].includes(role))) return bad(403, "교직원 권한이 필요합니다.");
    const admin = input.scope === "admin";
    if (![undefined, "self", "admin"].includes(input.scope)) return bad(400, "조회 범위를 확인해 주세요.");
    if ((admin || req.method === "POST") && !access.roles?.some((role) => ["health_teacher", "admin"].includes(role))) return bad(403, "관리 권한이 필요합니다.");
    if (!admin && input.staffId !== undefined && input.staffId !== access.staffId) return bad(403, "본인의 자료만 이용할 수 있습니다.");
    if (admin && !input.staffId) return bad(400, "교직원을 선택해 주세요.");
    if (input.accessOnly !== undefined) {
      if (req.method !== "GET" || admin || ![true, "true"].includes(input.accessOnly) || schoolYear !== CURRENT_SCHOOL_YEAR) return bad(400, "접근 확인 요청을 확인해 주세요.");
      const synthetic = access.qaTbCertificateSynthetic === true;
      let identity = access.identity;
      if (!synthetic) {
        const roster = await directory({ allowInvalidEmploymentStatus: false });
        const matches = roster.directory.filter((person) => person.staffId === access.staffId && person.employmentStatus === "재직");
        if (matches.length !== 1) return bad(409, "현재 교직원 정보를 확인해 주세요.");
        const person = matches[0];
        identity = { staffId: person.staffId, name: person.name, department: person.department, position: person.position || "" };
      }
      return res.status(200).json({ ok: true, access: { authorized: true, schoolYear,
        qaTbCertificateSynthetic: synthetic, assignment: { staffId: access.staffId, roles: access.roles,
          active: !synthetic, schoolYear: CURRENT_SCHOOL_YEAR, semester: CURRENT_SEMESTER },
        identity, staffType: synthetic ? "교직원" : "" } });
    }
    const staffId = admin ? input.staffId : access.staffId;
    if (admin) {
      const roster = await directory({ allowInvalidEmploymentStatus: false });
      if (!roster.directory.some((person) => person.staffId === staffId && person.employmentStatus === "재직")) return bad(400, "현재 교직원 정보를 확인해 주세요.");
    }
    if (req.method === "GET") {
      const [route, data] = await Promise.all([
        readHealthScreeningType(access.db, staffId, schoolYear),
        listQaTbWorkflowData(access.db, { staffId, schoolYear, evidenceCursor: input.evidenceCursor || input.cursor || "", statusCursor: input.statusCursor || "", limit: input.limit === undefined ? 100 : Number(input.limit) }, { context }),
      ]);
      return res.status(200).json({ ok: true, item: joinTbScreeningWorkflow({ staffId, schoolYear, route,
        evidence: data.evidence, status: data.statuses.find((item) => item.staffId === staffId), evidenceComplete: data.completeness.evidence }),
        datasets: { completeness: data.completeness, cursors: data.cursors } });
    }
    if (!admin) return bad(400, "관리 범위를 지정해 주세요.");
    if (schoolYear !== CURRENT_SCHOOL_YEAR) return bad(400, "현재 학년도만 변경할 수 있습니다.");
    if (typeof input.submissionId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(input.submissionId)) return bad(400, "제출 번호를 확인해 주세요.");
    const evidence = await access.db.collection("staff_submissions_qa").doc(input.submissionId).get();
    if (!evidence.exists || evidence.data()?.staffId !== staffId) return bad(403, "선택한 교직원의 자료를 확인해 주세요.");
    const item = await reviewQaTbEvidence(access.db, { action: input.action, submissionId: input.submissionId,
      schoolYear, expectedRevision: input.expectedRevision, actor: access.staffId }, { context, verifyEvidenceFile, now: time });
    return res.status(200).json({ ok: true, item });
  } catch (error) {
    if (error instanceof TbWorkflowError || error instanceof HealthScreeningTypeError) return bad(error.status, error.message);
    if (error instanceof SyntaxError || error?.code === "body-too-large") return bad(400, "요청 내용을 확인해 주세요.");
    return bad(503, "확인 자료를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
