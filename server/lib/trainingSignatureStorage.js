import {
  createDriveFolder, createDriveOAuthRequester, deleteDriveFile, downloadDriveFile,
  DRIVE_FOLDER_MIME, DRIVE_OAUTH_SCOPE, getDriveFile, getDrivePermissions, listDriveFiles, uploadDrivePng,
} from "./trainingDriveOAuthClient.js";

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_SIGNATURE_BYTES = 300_000;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{3,120}$/;
const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;
const APP_OWNER = "sehwa-health-portal";
const ROOT_PURPOSE = "training-signatures-root";
const YEAR_PURPOSE = "training-signatures-year";
const REQUESTS_PURPOSE = "training-signatures-requests";
const SIGNATURE_PURPOSE = "training-signature";
const ROOT_FOLDER_NAME = "온라인보건실_연수서명_임시";

export class SignatureStorageError extends Error {
  constructor(stage, { code = "", cause } = {}) {
    super("전자서명 저장소 요청에 실패했습니다.", cause ? { cause } : undefined);
    this.name = "SignatureStorageError";
    this.stage = stage;
    this.code = code;
  }
}

export class SignatureStorage {
  async healthCheck() { throw new Error("SignatureStorage.healthCheck must be implemented."); }
  async bootstrap() { throw new Error("SignatureStorage.bootstrap must be implemented."); }
  async saveSignature() { throw new Error("SignatureStorage.saveSignature must be implemented."); }
  async readSignature() { throw new Error("SignatureStorage.readSignature must be implemented."); }
  async findByRequestId() { throw new Error("SignatureStorage.findByRequestId must be implemented."); }
  async deleteSignature() { throw new Error("SignatureStorage.deleteSignature must be implemented."); }
}

function envConfig() {
  return {
    clientId: String(process.env.TRAINING_DRIVE_OAUTH_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.TRAINING_DRIVE_OAUTH_CLIENT_SECRET || "").trim(),
    refreshToken: String(process.env.TRAINING_DRIVE_OAUTH_REFRESH_TOKEN || "").trim(),
  };
}

function validConfig(config) {
  return Boolean(config.clientId && config.clientSecret && config.refreshToken);
}

function assertRequestId(requestId) {
  if (!REQUEST_ID_PATTERN.test(requestId || "")) throw new RangeError("출석 요청 ID가 올바르지 않습니다.");
}

function assertYear(year) {
  const value = String(year || "");
  if (!/^20\d{2}$/.test(value)) throw new RangeError("서명 저장 연도가 올바르지 않습니다.");
  return value;
}

function assertEventId(eventId) {
  if (!EVENT_ID_PATTERN.test(eventId || "")) throw new RangeError("교육 ID가 올바르지 않습니다.");
}

function assertFileId(fileId) {
  if (!FILE_ID_PATTERN.test(fileId || "")) throw new RangeError("서명 파일 식별자가 올바르지 않습니다.");
  return fileId;
}

function assertPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_SIGNATURE_BYTES ||
    !bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new RangeError("서명 파일 형식이 올바르지 않습니다.");
  }
}

function privatePermissions(permissions) {
  return Array.isArray(permissions) && !permissions.some((permission) => ["anyone", "domain"].includes(permission?.type));
}

function escapeQuery(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function markerQuery(properties) {
  return Object.entries(properties).map(([key, value]) =>
    `appProperties has { key='${escapeQuery(key)}' and value='${escapeQuery(value)}' }`).join(" and ");
}

function matchesMarker(file, purpose, year = "") {
  return file?.appProperties?.appOwner === APP_OWNER && file.appProperties.purpose === purpose &&
    (!year || file.appProperties.year === year);
}

function isNotFound(error) {
  return error?.response?.status === 404 || error?.code === 404 || error?.code === "404";
}

export function signatureStorageYear(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError("서명 저장 시각이 올바르지 않습니다.");
  return new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(date);
}

export class GoogleDriveOAuthSignatureStorage extends SignatureStorage {
  constructor({ config = envConfig(), request = null } = {}) {
    super();
    this.config = config;
    this.request = request;
  }

  get configured() {
    return validConfig(this.config);
  }

  requester() {
    if (this.request) return this.request;
    if (!this.configured) throw new SignatureStorageError("SIGNATURE_STORAGE_CONFIG", { code: "CONFIG_REQUIRED" });
    this.request = createDriveOAuthRequester(this.config);
    return this.request;
  }

  async file(fileId) {
    return getDriveFile(this.requester(), assertFileId(fileId));
  }

  async assertPrivate(fileId, stage = "SIGNATURE_STORAGE_READ") {
    if (!privatePermissions(await getDrivePermissions(this.requester(), assertFileId(fileId)))) {
      throw new SignatureStorageError(stage, { code: "PUBLIC_PERMISSION" });
    }
  }

  async list(query) {
    return listDriveFiles(this.requester(), query);
  }

  async markedFolders({ purpose, year = "", parentId = "" }) {
    const properties = { appOwner: APP_OWNER, purpose, ...(year ? { year } : {}) };
    const parent = parentId ? `'${escapeQuery(parentId)}' in parents and ` : "";
    return this.list(`${parent}trashed=false and mimeType='${DRIVE_FOLDER_MIME}' and ${markerQuery(properties)}`);
  }

  async rootFolder({ required = false } = {}) {
    const roots = await this.markedFolders({ purpose: ROOT_PURPOSE });
    if (roots.length > 1) throw new SignatureStorageError("SIGNATURE_STORAGE_CONFIG", { code: "DUPLICATE_ROOT" });
    if (!roots[0]) {
      if (required) throw new SignatureStorageError("SIGNATURE_STORAGE_CONFIG", { code: "NEEDS_BOOTSTRAP" });
      return null;
    }
    const root = roots[0];
    if (!matchesMarker(root, ROOT_PURPOSE) || (root.parents?.length || 0) > 1 || root.driveId) {
      throw new SignatureStorageError("SIGNATURE_STORAGE_CONFIG", { code: "ROOT_FOLDER_INVALID" });
    }
    await this.assertPrivate(root.id, "SIGNATURE_STORAGE_CONFIG");
    return root;
  }

  async bootstrap() {
    if (!this.configured) throw new SignatureStorageError("SIGNATURE_STORAGE_CONFIG", { code: "CONFIG_REQUIRED" });
    try {
      const existing = await this.rootFolder();
      if (existing) return { rootFolderId: existing.id, created: false };
      const created = await createDriveFolder(this.requester(), { name: ROOT_FOLDER_NAME,
        appProperties: { appOwner: APP_OWNER, purpose: ROOT_PURPOSE } });
      if (!matchesMarker(created, ROOT_PURPOSE)) throw new SignatureStorageError("SIGNATURE_STORAGE_CONFIG", { code: "ROOT_FOLDER_INVALID" });
      await this.assertPrivate(created.id, "SIGNATURE_STORAGE_CONFIG");
      const resolved = await this.rootFolder({ required: true });
      return { rootFolderId: resolved.id, created: true };
    } catch (cause) {
      if (cause instanceof SignatureStorageError) throw cause;
      throw new SignatureStorageError("SIGNATURE_STORAGE_CONFIG", { code: "BOOTSTRAP_FAILED", cause });
    }
  }

  async childFolder({ parentId, purpose, year, name, create }) {
    const folders = await this.markedFolders({ parentId, purpose, year });
    if (folders.length > 1) throw new SignatureStorageError("SIGNATURE_STORAGE_SAVE", { code: "DUPLICATE_FOLDER" });
    if (folders[0]) {
      await this.assertPrivate(folders[0].id, "SIGNATURE_STORAGE_SAVE");
      return folders[0];
    }
    if (!create) return null;
    const created = await createDriveFolder(this.requester(), { parentId, name,
      appProperties: { appOwner: APP_OWNER, purpose, year } });
    if (!matchesMarker(created, purpose, year) || !created.parents?.includes(parentId)) {
      throw new SignatureStorageError("SIGNATURE_STORAGE_SAVE", { code: "FOLDER_INTEGRITY" });
    }
    await this.assertPrivate(created.id, "SIGNATURE_STORAGE_SAVE");
    return created;
  }

  async requestsFolder(year, { create = false } = {}) {
    const storageYear = assertYear(year);
    const root = await this.rootFolder({ required: true });
    const yearFolder = await this.childFolder({ parentId: root.id, purpose: YEAR_PURPOSE, year: storageYear,
      name: storageYear, create });
    if (!yearFolder) return null;
    return this.childFolder({ parentId: yearFolder.id, purpose: REQUESTS_PURPOSE, year: storageYear,
      name: "requests", create });
  }

  async requestFiles(requestId, year) {
    assertRequestId(requestId);
    const storageYear = assertYear(year);
    const folder = await this.requestsFolder(storageYear);
    if (!folder) return [];
    const properties = { appOwner: APP_OWNER, purpose: SIGNATURE_PURPOSE, trainingRequestId: requestId, year: storageYear };
    const files = await this.list(`'${escapeQuery(folder.id)}' in parents and trashed=false and ${markerQuery(properties)}`);
    if (files.length > 1) throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "DUPLICATE_OBJECT" });
    if (files[0]) await this.inspectStoredFile(files[0].id, { expectedParentId: folder.id, requestId, year: storageYear });
    return files;
  }

  async inspectStoredFile(fileId, { expectedParentId = "", requestId = "", year = "" } = {}) {
    const file = await this.file(fileId);
    if (file.trashed || file.mimeType !== "image/png" || !matchesMarker(file, SIGNATURE_PURPOSE, year) ||
      (requestId && file.appProperties?.trainingRequestId !== requestId)) {
      throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "INVALID_OBJECT" });
    }
    const size = Number(file.size);
    if (Number.isFinite(size) && (size <= 0 || size > MAX_SIGNATURE_BYTES)) {
      throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "INVALID_OBJECT" });
    }
    const parentId = file.parents?.length === 1 ? file.parents[0] : "";
    if (!parentId || (expectedParentId && parentId !== expectedParentId)) {
      throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "OUTSIDE_ROOT" });
    }
    const parent = await this.file(parentId);
    const fileYear = year || file.appProperties?.year;
    if (!matchesMarker(parent, REQUESTS_PURPOSE, fileYear)) {
      throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "OUTSIDE_ROOT" });
    }
    await this.assertPrivate(parent.id);
    const yearFolder = parent.parents?.length === 1 ? await this.file(parent.parents[0]) : null;
    if (!matchesMarker(yearFolder, YEAR_PURPOSE, fileYear)) {
      throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "OUTSIDE_ROOT" });
    }
    await this.assertPrivate(yearFolder.id);
    const root = yearFolder.parents?.length === 1 ? await this.file(yearFolder.parents[0]) : null;
    if (!matchesMarker(root, ROOT_PURPOSE) || (root.parents?.length || 0) > 1 || root.driveId) {
      throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "OUTSIDE_ROOT" });
    }
    await this.assertPrivate(root.id);
    await this.assertPrivate(file.id);
    return file;
  }

  async healthCheck() {
    if (!this.configured) return { authReady: false, rootReady: false, rootPrivate: false, readReady: false, needsBootstrap: false, writeReady: null };
    try {
      const root = await this.rootFolder();
      if (!root) return { authReady: true, rootReady: false, rootPrivate: false, readReady: false, needsBootstrap: true, writeReady: null };
      return { authReady: true, rootReady: true, rootPrivate: true, readReady: true, needsBootstrap: false, writeReady: null };
    } catch (cause) {
      if (cause instanceof SignatureStorageError) throw cause;
      throw new SignatureStorageError("SIGNATURE_STORAGE_CONFIG", { code: "DRIVE_NOT_READY", cause });
    }
  }

  async saveSignature({ bytes, eventId, year, requestId }) {
    assertPng(bytes);
    assertEventId(eventId);
    const storageYear = assertYear(year);
    try {
      const existing = await this.requestFiles(requestId, storageYear);
      if (existing[0]) return existing[0].id;
      const requestsFolder = await this.requestsFolder(storageYear, { create: true });
      const appProperties = { appOwner: APP_OWNER, purpose: SIGNATURE_PURPOSE,
        trainingRequestId: requestId, year: storageYear };
      const created = await uploadDrivePng(this.requester(), { name: `${requestId}.png`, mimeType: "image/png",
        parents: [requestsFolder.id], appProperties }, bytes);
      await this.inspectStoredFile(created.id, { expectedParentId: requestsFolder.id, requestId, year: storageYear });
      const resolved = await this.requestFiles(requestId, storageYear);
      if (resolved.length !== 1) throw new SignatureStorageError("SIGNATURE_STORAGE_SAVE", { code: "OBJECT_INTEGRITY" });
      return resolved[0].id;
    } catch (cause) {
      if (cause instanceof RangeError || cause instanceof SignatureStorageError) throw cause;
      throw new SignatureStorageError("SIGNATURE_STORAGE_SAVE", { code: "SAVE_FAILED", cause });
    }
  }

  async readSignature(fileId) {
    try {
      await this.inspectStoredFile(fileId);
      const bytes = await downloadDriveFile(this.requester(), assertFileId(fileId));
      assertPng(bytes);
      return bytes;
    } catch (cause) {
      if (cause instanceof RangeError || cause instanceof SignatureStorageError) throw cause;
      throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: isNotFound(cause) ? "NOT_FOUND" : "READ_FAILED", cause });
    }
  }

  async findByRequestId(requestId, { year } = {}) {
    try {
      return (await this.requestFiles(requestId, year)).map((file) => ({ id: file.id, private: true }));
    } catch (cause) {
      if (cause instanceof RangeError || cause instanceof SignatureStorageError) throw cause;
      throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "READ_FAILED", cause });
    }
  }

  async deleteSignature(fileId) {
    try {
      await this.inspectStoredFile(fileId);
      await deleteDriveFile(this.requester(), assertFileId(fileId));
      return true;
    } catch (cause) {
      if (cause instanceof RangeError || cause instanceof SignatureStorageError) throw cause;
      throw new SignatureStorageError("SIGNATURE_STORAGE_DELETE", { code: isNotFound(cause) ? "NOT_FOUND" : "DELETE_FAILED", cause });
    }
  }
}

export const signatureStorage = new GoogleDriveOAuthSignatureStorage();
export { APP_OWNER, DRIVE_OAUTH_SCOPE, MAX_SIGNATURE_BYTES, PNG_MAGIC, REQUESTS_PURPOSE, ROOT_PURPOSE, SIGNATURE_PURPOSE, YEAR_PURPOSE };
