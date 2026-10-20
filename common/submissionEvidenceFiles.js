function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function driveFileIdFromUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.hostname !== "drive.google.com") return "";
    const pathMatch = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
    const queryId = url.searchParams.get("id") || "";
    return pathMatch?.[1] || (/^[A-Za-z0-9_-]+$/.test(queryId) ? queryId : "");
  } catch {
    return "";
  }
}

function normalizeFile(file) {
  if (!file || typeof file !== "object") return null;
  const fileId = text(file.fileId || file.driveFileId) || driveFileIdFromUrl(file.driveUrl || file.fileUrl || file.originalUrl);
  if (!fileId || !/^[A-Za-z0-9_-]{3,200}$/.test(fileId)) return null;
  return {
    fileId,
    fileName: text(file.fileName || file.name) || "첨부파일",
    mimeType: text(file.mimeType || file.type),
  };
}

export function normalizeSubmissionEvidenceFiles(record) {
  const candidates = [record?.file, ...(Array.isArray(record?.files) ? record.files : []),
    ...(Array.isArray(record?.evidenceFiles) ? record.evidenceFiles : [])];
  const seen = new Set();
  return candidates.map(normalizeFile).filter((file) => {
    if (!file || seen.has(file.fileId)) return false;
    seen.add(file.fileId);
    return true;
  });
}
