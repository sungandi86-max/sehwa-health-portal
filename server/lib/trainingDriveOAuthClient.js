import { randomUUID } from "node:crypto";
import { OAuth2Client } from "google-auth-library";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const DRIVE_OAUTH_SCOPE = "https://www.googleapis.com/auth/drive";

export function createDriveOAuthRequester(config) {
  const auth = new OAuth2Client(config.clientId, config.clientSecret);
  auth.setCredentials({ refresh_token: config.refreshToken });
  return (options) => auth.request(options);
}

export async function getDriveFile(request, fileId) {
  return (await request({ url: `${DRIVE_API}/files/${encodeURIComponent(fileId)}`,
    params: { fields: "id,name,mimeType,parents,trashed,size,appProperties,driveId" } })).data;
}

export async function getDrivePermissions(request, fileId) {
  return (await request({ url: `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions`,
    params: { fields: "permissions(id,type,role,allowFileDiscovery,permissionDetails)" } })).data.permissions || [];
}

export async function listDriveFiles(request, query) {
  return (await request({ url: `${DRIVE_API}/files`, params: { q: query, spaces: "drive", pageSize: 10,
    fields: "files(id,name,mimeType,parents,trashed,size,appProperties,driveId)" } })).data.files || [];
}

export async function createDriveFolder(request, parentId, name) {
  return (await request({ url: `${DRIVE_API}/files`, method: "POST",
    params: { ignoreDefaultVisibility: true, fields: "id,name,mimeType,parents,trashed,driveId" },
    data: { name, mimeType: DRIVE_FOLDER_MIME, parents: [parentId] } })).data;
}

export async function uploadDrivePng(request, metadata, bytes) {
  const boundary = `training-signature-${randomUUID()}`;
  const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: image/png\r\n\r\n`, "utf8");
  const body = Buffer.concat([head, bytes, Buffer.from(`\r\n--${boundary}--`, "utf8")]);
  return (await request({ url: `${DRIVE_UPLOAD_API}/files`, method: "POST",
    params: { uploadType: "multipart", ignoreDefaultVisibility: true,
      fields: "id,name,mimeType,parents,trashed,size,appProperties,driveId" },
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, data: body })).data;
}

export async function downloadDriveFile(request, fileId) {
  return Buffer.from((await request({ url: `${DRIVE_API}/files/${encodeURIComponent(fileId)}`,
    params: { alt: "media" }, responseType: "arraybuffer" })).data);
}

export async function deleteDriveFile(request, fileId) {
  await request({ url: `${DRIVE_API}/files/${encodeURIComponent(fileId)}`, method: "DELETE" });
}
