import { verifyCurrentStaffSubmissionIdentity } from "./tbSubmissionGuard.js";
import { verifyDirectoryAdmin } from "./staffDirectory.js";

export async function verifyQaTbProxyAdmin(req, options) {
  if (options?.workflowEnvironment !== "qa") return verifyDirectoryAdmin(req);
  const access = await verifyCurrentStaffSubmissionIdentity(req, options);
  if (!access.ok) return access;
  if (!access.roles.some((role) => ["health_teacher", "admin"].includes(role))) {
    return { ok: false, status: 403, message: "관리자 권한이 없습니다." };
  }
  return { ...access, assignment: { staffId: access.staffId, roles: access.roles } };
}
