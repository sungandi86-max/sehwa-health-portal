const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const ROOT_NAME = "온라인보건실_연수서명_production";

async function listAll(request, query) {
  const files = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ q: query, fields: "nextPageToken,files(id,name,mimeType)", pageSize: "1000" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await request({ url: `${DRIVE_FILES_URL}?${params}` });
    files.push(...response.data.files || []);
    pageToken = response.data.nextPageToken || "";
  } while (pageToken);
  return files;
}

export async function inspectProductionSignatureDrive(request) {
  const roots = await listAll(request, `name = '${ROOT_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`);
  if (roots.length !== 1) throw new Error("production_signature_drive_root_conflict");
  const queue = [roots[0].id];
  const visited = new Set();
  let files = 0;
  while (queue.length) {
    const parentId = queue.shift();
    if (visited.has(parentId)) throw new Error("production_signature_drive_folder_cycle");
    visited.add(parentId);
    const children = await listAll(request, `'${parentId}' in parents and trashed = false`);
    for (const child of children) {
      if (child.mimeType === FOLDER_MIME) queue.push(child.id);
      else files += 1;
    }
  }
  return { rootCount: roots.length, folderCount: visited.size, fileCount: files };
}

export async function activateEmptyProductionLedger({ sourceRows, existingPairs, lockDocs, driveFileCount, counts, mark }) {
  if (sourceRows || existingPairs || lockDocs || driveFileCount || Object.values(counts).some(Boolean)) {
    throw new Error("production_signature_conflict");
  }
  await mark();
}
