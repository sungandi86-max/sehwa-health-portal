import {
  createDriveFolder, createDriveOAuthRequester, deleteDriveFile, downloadDriveFile,
  DRIVE_FOLDER_MIME, DRIVE_OAUTH_SCOPE, getDriveFile, getDrivePermissions, listDriveFiles, uploadDrivePng,
} from "./trainingDriveOAuthClient.js";

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_SIGNATURE_BYTES = 300_000;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{3,120}$/;
const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/;
const MAX_PARENT_DEPTH = 8;

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
    rootFolderId: String(process.env.TRAINING_SIGNATURE_DRIVE_FOLDER_ID || "").trim(),
  };
}

function validConfig(config) {
  return Boolean(config.clientId && config.clientSecret && config.refreshToken && FILE_ID_PATTERN.test(config.rootFolderId));
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

  async permissions(fileId) {
    return getDrivePermissions(this.requester(), assertFileId(fileId));
  }

  async assertPrivate(fileId) {
    if (!privatePermissions(await this.permissions(fileId))) {
      throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "PUBLIC_PERMISSION" });
    }
  }

  async assertRootBoundary(file) {
    if (file.id === this.config.rootFolderId) return;
    let parents = file.parents || [];
    const visited = new Set([file.id]);
    for (let depth = 0; depth < MAX_PARENT_DEPTH && parents.length === 1; depth += 1) {
      const parentId = parents[0];
      if (parentId === this.config.rootFolderId) return;
      if (visited.has(parentId)) break;
      visited.add(parentId);
      const parent = await this.file(parentId);
      parents = parent.parents || [];
    }
    throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "OUTSIDE_ROOT" });
  }

  async inspectStoredFile(fileId) {
    const file = await this.file(fileId);
    if (file.trashed || file.mimeType !== "image/png") {
      throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "INVALID_OBJECT" });
    }
    const size = Number(file.size);
    if (Number.isFinite(size) && (size <= 0 || size > MAX_SIGNATURE_BYTES)) {
      throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "INVALID_OBJECT" });
    }
    await this.assertRootBoundary(file);
    await this.assertPrivate(file.id);
    return file;
  }

  async list(query) {
    return listDriveFiles(this.requester(), query);
  }

  async requestFiles(requestId) {
    assertRequestId(requestId);
    const files = await this.list(`trashed=false and appProperties has { key='trainingRequestId' and value='${escapeQuery(requestId)}' }`);
    for (const file of files) await this.inspectStoredFile(file.id);
    if (files.length > 1) throw new SignatureStorageError("SIGNATURE_STORAGE_READ", { code: "DUPLICATE_OBJECT" });
    return files;
  }

  async findFolder(parentId, name) {
    const files = await this.list(`'${escapeQuery(parentId)}' in parents and trashed=false and mimeType='${DRIVE_FOLDER_MIME}' and name='${escapeQuery(name)}'`);
    if (files.length > 1) throw new SignatureStorageError("SIGNATURE_STORAGE_SAVE", { code: "DUPLICATE_FOLDER" });
    if (files[0]) {
      await this.assertRootBoundary(files[0]);
      await this.assertPrivate(files[0].id);
    }
    return files[0] || null;
  }

  async ensureFolder(parentId, name) {
    const existing = await this.findFolder(parentId, name);
    if (existing) return existing;
    const created = await createDriveFolder(this.requester(), parentId, name);
    await this.assertRootBoundary(created);
    await this.assertPrivate(created.id);
    return created;
  }

  async healthCheck() {
    if (!this.configured) return { authReady: false, folderAccessible: false, folderPrivate: false, readReady: false, writeReady: null };
    try {
      const root = await this.file(this.config.rootFolderId);
      const folderAccessible = root.mimeType === DRIVE_FOLDER_MIME && !root.trashed && !root.driveId;
      if (!folderAccessible) throw new SignatureStorageError("SIGNATURE_STORAGE_CONFIG", { code: "ROOT_FOLDER_INVALID" });
      await this.assertPrivate(root.id);
      return { authReady: true, folderAccessible: true, folderPrivate: true, readReady: true, writeReady: null };
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
      const existing = await this.requestFiles(requestId);
      if (existing[0]) return existing[0].id;
      const yearFolder = await this.ensureFolder(this.config.rootFolderId, storageYear);
      const requestsFolder = await this.ensureFolder(yearFolder.id, "requests");
      const created = await uploadDrivePng(this.requester(), { name: `${requestId}.png`, mimeType: "image/png", parents: [requestsFolder.id],
        appProperties: { trainingRequestId: requestId, trainingSignatureYear: storageYear } }, bytes);
      await this.inspectStoredFile(created.id);
      const resolved = await this.requestFiles(requestId);
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

  async findByRequestId(requestId) {
    try {
      return (await this.requestFiles(requestId)).map((file) => ({ id: file.id, private: true }));
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
export { DRIVE_OAUTH_SCOPE, MAX_SIGNATURE_BYTES, PNG_MAGIC };
