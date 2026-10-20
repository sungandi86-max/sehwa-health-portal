import { normalizeSubmissionEvidenceFiles } from "../../common/submissionEvidenceFiles.js";
import { serverFirestoreResource } from "./firestoreResources.js";
import { verifyDirectoryAdmin } from "./staffDirectory.js";

function validSubmissionId(value) {
  const normalized = String(value || "");
  return /^[A-Za-z0-9_-]{1,200}$/.test(normalized) ? normalized : "";
}

function drivePreviewUrl(file) {
  const mode = file.mimeType === "application/pdf" || file.mimeType.startsWith("image/") ? "preview" : "view";
  return `https://drive.google.com/file/d/${encodeURIComponent(file.fileId)}/${mode}`;
}

export async function handleSubmissionFileAccessResource(req, res, {
  verifyAdmin = verifyDirectoryAdmin,
  context = process.env,
  readSubmission,
} = {}) {
  res.setHeader?.("Cache-Control", "private, no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  const access = await verifyAdmin(req);
  if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

  const submissionId = validSubmissionId(req.query?.submissionId);
  const fileIndex = Number(req.query?.fileIndex ?? 0);
  if (!submissionId || !Number.isSafeInteger(fileIndex) || fileIndex < 0 || fileIndex > 99) {
    return res.status(400).json({ ok: false, message: "첨부파일 요청을 확인해 주세요." });
  }

  const record = readSubmission
    ? await readSubmission({ db: access.db, submissionId, context })
    : await access.db.collection(serverFirestoreResource(access.db, "submissions", context)).doc(submissionId).get()
      .then((snapshot) => snapshot.exists ? snapshot.data() : null);
  if (!record) return res.status(404).json({ ok: false, message: "제출 기록을 찾을 수 없습니다." });
  const file = normalizeSubmissionEvidenceFiles(record)[fileIndex];
  if (!file) return res.status(404).json({ ok: false, message: "첨부파일 정보가 없거나 원본 참조가 유효하지 않습니다." });
  return res.status(200).json({ ok: true, file: {
    fileName: file.fileName,
    mimeType: file.mimeType,
    url: drivePreviewUrl(file),
  } });
}
