import { randomUUID } from "node:crypto";
import { JWT } from "google-auth-library";
import { getFirebaseServiceAccount } from "./firebaseAdmin.js";
import { getTrainingSpreadsheetId, readTrainingSheets, TRAINING_SHEETS, TrainingSourceNotReadyError } from "./trainingCenter.js";
import { readGoogleSheetValues } from "./staffDirectory.js";
import { SIGNATURE_HEADERS, SIGNATURE_SHEET } from "./trainingCenterPhase2.js";

export class DrivePrivacyError extends Error {
  constructor() {
    super("비공개 서명 저장소 권한을 확인해 주세요.");
  }
}

export function assertPrivatePermissions(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0 || permissions.some((permission) => !permission?.type || ["anyone", "domain"].includes(permission.type))) {
    throw new DrivePrivacyError();
  }
}

export function hasSignatureSheetSchema(sheets, values) {
  const sheet = sheets?.find((item) => item.properties?.title === SIGNATURE_SHEET);
  return sheet?.properties?.hidden === true && SIGNATURE_HEADERS.every((header, index) => values?.[0]?.[index] === header);
}

function googleAuth(scopes) {
  const account = getFirebaseServiceAccount();
  if (!account?.client_email || !account?.private_key) throw new Error("교육센터 Google 서비스 계정 설정이 필요합니다.");
  return new JWT({ email: account.client_email, key: account.private_key, scopes });
}

function cell(text) {
  return { userEnteredValue: { stringValue: String(text ?? "") } };
}

function rowData(headers, values, actualHeaders = headers) {
  return { values: actualHeaders.map((header) => cell(headers.includes(header) ? values[header] : "")) };
}

export function managedCellUpdates(sheetId, rowNumber, headers, values, actual) {
  return headers.map((header) => ({ updateCells: {
    start: { sheetId, rowIndex: rowNumber - 1, columnIndex: actual.indexOf(header) },
    rows: [{ values: [cell(values[header])] }], fields: "userEnteredValue",
  } }));
}

export class TrainingCenterStore {
  constructor({ spreadsheetId = getTrainingSpreadsheetId(), folderId = process.env.TRAINING_SIGNATURE_DRIVE_FOLDER_ID || "",
    fetchImpl = fetch, accessToken = null } = {}) {
    this.spreadsheetId = spreadsheetId;
    this.folderId = folderId;
    this.fetchImpl = fetchImpl;
    this.accessToken = accessToken || (async (scope) => (await googleAuth([scope]).getAccessToken()).token);
    this.sheetIdCache = new Map();
  }

  assertSignatureFolderConfigured() {
    if (!/^[A-Za-z0-9_-]{5,}$/.test(this.folderId)) throw new TrainingSourceNotReadyError();
  }

  async inspectSignatureFolder() {
    const result = { accessible: false, writable: false, private: false };
    try {
      this.assertSignatureFolderConfigured();
      const item = await this.driveJson(`files/${this.folderId}?fields=id,mimeType,parents,driveId,capabilities(canAddChildren)&supportsAllDrives=true`);
      if (item.mimeType !== "application/vnd.google-apps.folder") return result;
      result.accessible = true;
      result.writable = item.capabilities?.canAddChildren === true;
      if (!result.writable) return result;
      await this.assertPrivateDriveItem(this.folderId, { mimeType: "application/vnd.google-apps.folder" });
      result.private = true;
    } catch {}
    return result;
  }

  async isSignatureSheetReady() {
    try {
      const auth = googleAuth(["https://www.googleapis.com/auth/spreadsheets.readonly"]);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}?fields=sheets(properties(title,hidden))`;
      const metadata = await auth.request({ url });
      if (!metadata.data.sheets?.some((item) => item.properties?.title === SIGNATURE_SHEET && item.properties.hidden === true)) return false;
      const values = await readGoogleSheetValues({ spreadsheetId: this.spreadsheetId, range: `'${SIGNATURE_SHEET}'!A1:M1` });
      return hasSignatureSheetSchema(metadata.data.sheets, values);
    } catch {
      return false;
    }
  }

  async driveJson(path, scope = "https://www.googleapis.com/auth/drive.readonly") {
    const response = await this.fetchImpl(`https://www.googleapis.com/drive/v3/${path}`, {
      headers: { Authorization: `Bearer ${await this.accessToken(scope)}` },
    });
    if (!response.ok) {
      const error = new TrainingSourceNotReadyError();
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async drivePermissions(fileId) {
    const permissions = [];
    let pageToken = "";
    do {
      const query = new URLSearchParams({ fields: "nextPageToken,permissions(id,type,role,allowFileDiscovery,permissionDetails(inherited))",
        supportsAllDrives: "true", pageSize: "100" });
      if (pageToken) query.set("pageToken", pageToken);
      const page = await this.driveJson(`files/${fileId}/permissions?${query}`);
      if (!Array.isArray(page.permissions)) throw new DrivePrivacyError();
      permissions.push(...page.permissions);
      pageToken = page.nextPageToken || "";
    } while (pageToken);
    return permissions;
  }

  async revokePublicFilePermissions(fileId) {
    const permissions = await this.drivePermissions(fileId);
    const publicPermissions = permissions.filter((permission) => ["anyone", "domain"].includes(permission.type));
    for (const permission of publicPermissions) {
      if (!permission.id || permission.permissionDetails?.some((detail) => detail.inherited)) throw new DrivePrivacyError();
      const response = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${permission.id}?supportsAllDrives=true`, {
        method: "DELETE", headers: { Authorization: `Bearer ${await this.accessToken("https://www.googleapis.com/auth/drive")}` },
      });
      if (!response.ok) throw new DrivePrivacyError();
    }
    await this.assertPrivateDriveItem(fileId, { mimeType: "image/png", parentId: this.folderId });
  }

  async assertPrivateDriveItem(fileId, { mimeType = "", parentId = "" } = {}) {
    if (!/^[A-Za-z0-9_-]+$/.test(fileId)) throw new DrivePrivacyError();
    const visited = new Set();
    const queue = [fileId];
    let driveId = "";
    let myDrive = false;
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      if (visited.size >= 25) throw new DrivePrivacyError();
      visited.add(id);
      if (id !== driveId) {
        let item;
        try {
          item = await this.driveJson(`files/${id}?fields=id,mimeType,parents,driveId,capabilities(canAddChildren)&supportsAllDrives=true`);
        } catch (error) {
          if (myDrive && id !== fileId && [403, 404].includes(error.status)) continue;
          throw error;
        }
        if (id === fileId && (mimeType && item.mimeType !== mimeType || parentId && !item.parents?.includes(parentId))) throw new DrivePrivacyError();
        if (id === fileId) {
          myDrive = !item.driveId;
          if (mimeType === "application/vnd.google-apps.folder" && item.capabilities?.canAddChildren !== true) throw new DrivePrivacyError();
        }
        if (item.driveId) driveId = item.driveId;
        for (const parent of item.parents || []) if (!visited.has(parent)) queue.push(parent);
        if (driveId && !visited.has(driveId)) queue.push(driveId);
      }
      assertPrivatePermissions(await this.drivePermissions(id));
    }
  }

  async readSource() {
    const source = await readTrainingSheets();
    try {
      const signatures = await readGoogleSheetValues({ spreadsheetId: this.spreadsheetId, range: `'${SIGNATURE_SHEET}'!A:Z` });
      return { ...source, signatures };
    } catch (error) {
      if ([400, 404].includes(error?.response?.status)) throw new TrainingSourceNotReadyError();
      throw error;
    }
  }

  async readBase() {
    return readTrainingSheets();
  }

  async sheetId(name) {
    if (this.sheetIdCache.has(name)) return this.sheetIdCache.get(name);
    const auth = googleAuth(["https://www.googleapis.com/auth/spreadsheets.readonly"]);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}?fields=sheets(properties(sheetId,title))`;
    const result = await auth.request({ url });
    const id = result.data.sheets?.find((sheet) => sheet.properties?.title === name)?.properties?.sheetId;
    if (!Number.isInteger(id)) throw new TrainingSourceNotReadyError();
    this.sheetIdCache.set(name, id);
    return id;
  }

  async batchUpdate(requests) {
    const auth = googleAuth(["https://www.googleapis.com/auth/spreadsheets"]);
    await auth.request({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}:batchUpdate`,
      method: "POST",
      data: { requests },
    });
  }

  async saveRow(name, headers, values, rowNumber = null) {
    const sheetId = await this.sheetId(name);
    const first = await readGoogleSheetValues({ spreadsheetId: this.spreadsheetId, range: `'${name}'!A1:Z1` });
    const actual = (first[0] || []).map((header) => String(header ?? "").normalize("NFKC").trim());
    if (headers.some((header) => actual.filter((item) => item === header).length !== 1)) throw new TrainingSourceNotReadyError();
    if (rowNumber) {
      await this.batchUpdate(managedCellUpdates(sheetId, rowNumber, headers, values, actual));
    } else {
      await this.batchUpdate([{ appendCells: { sheetId, rows: [rowData(headers, values, actual)], fields: "userEnteredValue" } }]);
    }
  }

  async appendSignatures(records) {
    const sheetId = await this.sheetId(SIGNATURE_SHEET);
    const first = await readGoogleSheetValues({ spreadsheetId: this.spreadsheetId, range: `'${SIGNATURE_SHEET}'!A1:Z1` });
    const actual = (first[0] || []).map((header) => String(header ?? "").normalize("NFKC").trim());
    if (SIGNATURE_HEADERS.some((header) => actual.filter((item) => item === header).length !== 1)) throw new TrainingSourceNotReadyError();
    await this.batchUpdate([{ appendCells: { sheetId, rows: records.map((record) => rowData(SIGNATURE_HEADERS, record, actual)), fields: "userEnteredValue" } }]);
  }

  async uploadSignature(bytes, eventId, now = new Date(), requestId = "") {
    this.assertSignatureFolderConfigured();
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new RangeError("출석 요청 ID가 올바르지 않습니다.");
    await this.assertPrivateDriveItem(this.folderId, { mimeType: "application/vnd.google-apps.folder" });
    const token = await this.accessToken("https://www.googleapis.com/auth/drive");
    const boundary = `training-${randomUUID()}`;
    const metadata = JSON.stringify({
      name: `${now.getFullYear()}_${eventId}_${requestId}.png`,
      mimeType: "image/png",
      parents: [this.folderId],
      appProperties: { trainingRequestId: requestId },
    });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: image/png\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await this.fetchImpl("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true&ignoreDefaultVisibility=true", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!response.ok) throw new Error("서명 파일을 저장하지 못했습니다.");
    const file = await response.json();
    if (!file.id) throw new Error("서명 파일 ID를 확인하지 못했습니다.");
    try { await this.assertPrivateDriveItem(file.id, { mimeType: "image/png", parentId: this.folderId }); }
    catch (error) {
      if (error instanceof DrivePrivacyError) {
        try { await this.revokePublicFilePermissions(file.id); }
        catch { error.requiresImmediateIsolation = true; }
      }
      error.fileId = file.id;
      throw error;
    }
    return file.id;
  }

  async downloadSignature(fileId) {
    if (!/^[A-Za-z0-9_-]+$/.test(fileId)) throw new RangeError("서명 파일 ID가 올바르지 않습니다.");
    const token = await this.accessToken("https://www.googleapis.com/auth/drive.readonly");
    const response = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error("서명 파일을 읽지 못했습니다.");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 300000 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("서명 파일 형식이 올바르지 않습니다.");
    return bytes;
  }

  async listSignatureFilesByRequest(requestId) {
    this.assertSignatureFolderConfigured();
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new RangeError("출석 요청 ID가 올바르지 않습니다.");
    const folder = await this.driveJson(`files/${this.folderId}?fields=id,mimeType,driveId&supportsAllDrives=true`);
    if (folder.mimeType !== "application/vnd.google-apps.folder" || !folder.driveId) throw new DrivePrivacyError();
    const files = [];
    let pageToken = "";
    do {
      const query = new URLSearchParams({ q: `'${this.folderId}' in parents and trashed = false and appProperties has { key='trainingRequestId' and value='${requestId}' }`,
        fields: "nextPageToken,files(id,mimeType,parents)", supportsAllDrives: "true", includeItemsFromAllDrives: "true",
        corpora: "drive", driveId: folder.driveId, pageSize: "100" });
      if (pageToken) query.set("pageToken", pageToken);
      const page = await this.driveJson(`files?${query}`);
      files.push(...(page.files || []).filter((file) => file.mimeType === "image/png" && file.parents?.includes(this.folderId)));
      pageToken = page.nextPageToken || "";
    } while (pageToken);
    return Promise.all(files.map(async (file) => {
      try {
        await this.assertPrivateDriveItem(file.id, { mimeType: "image/png", parentId: this.folderId });
        return { id: file.id, private: true };
      } catch (error) {
        if (error instanceof DrivePrivacyError) return { id: file.id, private: false };
        throw error;
      }
    }));
  }
}

export const trainingCenterStore = new TrainingCenterStore();
export { TRAINING_SHEETS };
