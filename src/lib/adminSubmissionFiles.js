export class AdminSubmissionFileError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "AdminSubmissionFileError";
    this.status = status;
  }
}

export async function getAdminSubmissionFileUrl(submissionId, fileIndex, { fetchImpl = fetch, user } = {}) {
  if (user === undefined) {
    const { auth } = await import("./firebase.js");
    user = auth.currentUser;
  }
  if (!user) throw new AdminSubmissionFileError("로그인 후 다시 시도해 주세요.", 401);
  const token = await user.getIdToken();
  const query = new URLSearchParams({ resource: "submission-file", submissionId, fileIndex: String(fileIndex) });
  let response;
  try {
    response = await fetchImpl(`/api/firebase/staff-directory?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new AdminSubmissionFileError("파일 확인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true || !body?.file?.url) {
    const message = response.status === 401 ? "로그인 상태를 다시 확인해 주세요."
      : response.status === 403 ? "이 파일을 열람할 관리자 권한이 없습니다."
      : response.status === 404 ? "첨부파일 원본 정보가 없거나 파일이 삭제되었습니다."
      : "첨부파일을 열지 못했습니다. 잠시 후 다시 시도해 주세요.";
    throw new AdminSubmissionFileError(message, response.status);
  }
  return body.file;
}
