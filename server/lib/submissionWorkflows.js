const FILE_MIME_TYPES = Object.freeze(["application/pdf", "image/jpeg", "image/png"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const REQUIRED_FIELDS = Object.freeze({
  cpr: ["name", "completionDate"],
  tb: ["name", "checkupDate"],
  tb_registration: ["name", "registrationType"],
  student_tb_reply: ["grade", "classNumber", "studentNumber", "studentName"],
  inbody: ["name", "dept", "preferredDate", "preferredTime"],
});

// Only this server-owned table may select a submission destination.
export const SUBMISSION_WORKFLOWS = Object.freeze({
  cpr: Object.freeze({ id: "cpr", enabled: true, authPolicy: "current_staff", allowedRoles: ["staff", "homeroom", "health_teacher", "admin"], requiresCanonicalStaffId: true, acceptsFile: true, allowedMimeTypes: FILE_MIME_TYPES, maxFileSize: MAX_FILE_SIZE, destinationPolicy: "cpr_certificate", auditSheet: "응답_심폐소생술이수증", firestoreWritePolicy: "staff_submission_status", publicCardId: "cpr" }),
  tb: Object.freeze({ id: "tb", enabled: true, authPolicy: "current_staff_tb_guard", allowedRoles: ["staff", "homeroom", "health_teacher", "admin"], requiresCanonicalStaffId: true, acceptsFile: true, allowedMimeTypes: FILE_MIME_TYPES, maxFileSize: MAX_FILE_SIZE, destinationPolicy: "tb_certificate", auditSheet: "응답_결핵검진확인증", firestoreWritePolicy: "staff_submission_status", publicCardId: "tb" }),
  tb_registration: Object.freeze({ id: "tb_registration", enabled: true, authPolicy: "current_staff_tb_guard", allowedRoles: ["staff", "homeroom", "health_teacher", "admin"], requiresCanonicalStaffId: true, acceptsFile: false, allowedMimeTypes: [], maxFileSize: 0, destinationPolicy: "tb_registration", auditSheet: "응답_교직원결핵검진유형선택", firestoreWritePolicy: "staff_submission_status", publicCardId: "tb_registration" }),
  student_tb_reply: Object.freeze({ id: "student_tb_reply", enabled: true, authPolicy: "public_student_reply", allowedRoles: ["student_or_guardian"], requiresCanonicalStaffId: false, acceptsFile: true, allowedMimeTypes: FILE_MIME_TYPES, maxFileSize: MAX_FILE_SIZE, destinationPolicy: "student_tb_reply", auditSheet: "제출기록", firestoreWritePolicy: "none", publicCardId: "student_tb_reply" }),
  inbody: Object.freeze({ id: "inbody", enabled: true, authPolicy: "current_staff", allowedRoles: ["staff", "homeroom", "health_teacher", "admin"], requiresCanonicalStaffId: true, acceptsFile: false, allowedMimeTypes: [], maxFileSize: 0, destinationPolicy: "inbody", auditSheet: "응답_인바디측정신청", firestoreWritePolicy: "none", publicCardId: "inbody" }),
  infection: Object.freeze({ id: "infection", enabled: false, authPolicy: "firestore_route_only", allowedRoles: ["homeroom_teacher", "health_teacher", "admin"], requiresCanonicalStaffId: false, acceptsFile: false, allowedMimeTypes: [], maxFileSize: 0, destinationPolicy: "none", auditSheet: null, firestoreWritePolicy: "student_health_submissions", publicCardId: "infection" }),
  recruit: Object.freeze({ id: "recruit", enabled: false, authPolicy: "firestore_route_only", allowedRoles: ["staff", "health_teacher", "admin"], requiresCanonicalStaffId: true, acceptsFile: false, allowedMimeTypes: [], maxFileSize: 0, destinationPolicy: "none", auditSheet: null, firestoreWritePolicy: "staff_submissions", publicCardId: "recruit" }),
  other: Object.freeze({ id: "other", enabled: false, authPolicy: "not_confirmed", allowedRoles: [], requiresCanonicalStaffId: true, acceptsFile: true, allowedMimeTypes: FILE_MIME_TYPES, maxFileSize: MAX_FILE_SIZE, destinationPolicy: "none", auditSheet: null, firestoreWritePolicy: "none", publicCardId: "other" }),
});

const ALIASES = Object.freeze({ "student-file": "student_tb_reply", student_file: "student_tb_reply", "tb-registration": "tb_registration" });

export function resolveSubmissionWorkflow(payload) {
  const type = typeof payload?.type === "string" ? payload.type.trim() : "";
  const id = ALIASES[type] || type;
  return SUBMISSION_WORKFLOWS[id] || null;
}

export function validateSubmissionPayload(workflow, payload) {
  if (!workflow?.enabled) return { ok: false, status: 422, message: "지원하지 않는 제출 유형입니다." };
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !payload.fields || typeof payload.fields !== "object" || Array.isArray(payload.fields)) {
    return { ok: false, status: 400, message: "제출 형식이 올바르지 않습니다." };
  }
  if (REQUIRED_FIELDS[workflow.id].some((key) => !String(payload.fields[key] || "").trim())) {
    return { ok: false, status: 400, message: "제출 필수 항목을 확인해 주세요." };
  }
  const hasFile = Boolean(payload.fileBase64 || payload.fileName || payload.fileMimeType);
  if (!workflow.acceptsFile && hasFile) return { ok: false, status: 400, message: "파일을 받지 않는 제출 유형입니다." };
  if (workflow.acceptsFile) {
    if (!payload.fileBase64 || !payload.fileName || !workflow.allowedMimeTypes.includes(payload.fileMimeType)) {
      return { ok: false, status: 400, message: "PDF, JPG, PNG 파일이 필요합니다." };
    }
    if (typeof payload.fileBase64 !== "string" || payload.fileBase64.length > Math.ceil(workflow.maxFileSize / 3) * 4 + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.fileBase64)) {
      return { ok: false, status: 413, message: "파일 형식 또는 크기를 확인해 주세요." };
    }
    const decoded = Buffer.from(payload.fileBase64, "base64");
    if (!decoded.length || decoded.length > workflow.maxFileSize || decoded.toString("base64") !== payload.fileBase64) {
      return { ok: false, status: 413, message: "파일 형식 또는 크기를 확인해 주세요." };
    }
    const fileSignatureValid = payload.fileMimeType === "application/pdf"
      ? decoded.subarray(0, 5).toString("ascii") === "%PDF-"
      : payload.fileMimeType === "image/jpeg"
        ? decoded.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
        : decoded.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    if (!fileSignatureValid) return { ok: false, status: 400, message: "파일 내용과 형식이 일치하지 않습니다." };
  }
  return { ok: true };
}

export function buildScriptSubmission(workflow, payload) {
  const result = {
    type: workflow.id === "student_tb_reply" ? "student-file" : workflow.id,
    fields: payload.fields,
    fileName: workflow.acceptsFile ? String(payload.fileName).replace(/[\\/]/g, "_").slice(0, 120) : null,
    fileBase64: workflow.acceptsFile ? payload.fileBase64 : null,
    fileMimeType: workflow.acceptsFile ? payload.fileMimeType : null,
  };
  if (workflow.id === "student_tb_reply") return { ...result, submissionType: "student-file" };
  return result;
}

export function publicSubmissionCard(item) {
  const url = String(item?.url || "").trim();
  return {
    title: item?.title || "",
    titleLines: Array.isArray(item?.titleLines) ? item.titleLines : [],
    description: item?.description || "",
    target: item?.target || "",
    documentType: item?.documentType || "",
    deadline: item?.deadline || "",
    fileGuide: item?.fileGuide || "",
    buttonText: item?.buttonText || "",
    url: /^(https:\/\/(?!drive\.google\.com\/)|\/(?!\/))/i.test(url) ? url : "",
    status: item?.status || "",
    uploadType: item?.uploadType || "",
    highlight: item?.highlight === true,
  };
}
