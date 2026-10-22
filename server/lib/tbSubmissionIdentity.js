import { createHash } from "node:crypto";
import { validatedSchoolYear } from "../../src/lib/tbScreeningWorkflowModel.js";

const text = (value) => String(value ?? "").normalize("NFKC").trim();

export function productionTbSubmissionIdentity({ staffId, schoolYear, checkupDate, documentType,
  fileBase64, fileMimeType, submissionMode = "self", actorStaffId = "", requestId = "" }) {
  const year = validatedSchoolYear(schoolYear);
  const parts = [staffId, year, checkupDate, documentType, fileMimeType, submissionMode, actorStaffId, requestId,
    createHash("sha256").update(String(fileBase64 || ""), "base64").digest("hex")].map(text);
  if (!parts[0] || !parts[2] || !parts[3] || !parts[4]) throw new Error("결핵검진 접수 식별 정보를 확인할 수 없습니다.");
  const requestFingerprint = createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
  return { submissionId: `tb-${requestFingerprint.slice(0, 32)}`, requestFingerprint, schoolYear: year };
}
