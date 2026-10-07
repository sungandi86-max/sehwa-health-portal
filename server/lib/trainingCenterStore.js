import { JWT } from "google-auth-library";
import { getFirebaseServiceAccount } from "./firebaseAdmin.js";
import { getTrainingSpreadsheetId, readTrainingSheets, TRAINING_SHEETS, TrainingSourceNotReadyError } from "./trainingCenter.js";
import { readGoogleSheetValues } from "./staffDirectory.js";
import { SIGNATURE_HEADERS, SIGNATURE_SHEET } from "./trainingCenterPhase2.js";
import { signatureStorage, signatureStorageYear } from "./trainingSignatureStorage.js";

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
  constructor({ spreadsheetId = getTrainingSpreadsheetId(), storage = signatureStorage } = {}) {
    this.spreadsheetId = spreadsheetId;
    this.storage = storage;
    this.sheetIdCache = new Map();
  }

  get signatureStorageConfigured() {
    return this.storage.configured === true;
  }

  assertSignatureStorageConfigured() {
    if (!this.signatureStorageConfigured) throw new TrainingSourceNotReadyError();
  }

  async inspectSignatureStorage() {
    if (!this.signatureStorageConfigured) return { authReady: false, folderAccessible: false, folderPrivate: false, readReady: false, writeReady: null };
    try {
      return await this.storage.healthCheck();
    } catch {
      return { authReady: false, folderAccessible: false, folderPrivate: false, readReady: false, writeReady: null };
    }
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
    this.assertSignatureStorageConfigured();
    return this.storage.saveSignature({ bytes, eventId, year: signatureStorageYear(now), requestId });
  }

  async downloadSignature(storageKey) {
    this.assertSignatureStorageConfigured();
    return this.storage.readSignature(storageKey);
  }

  async listSignatureFilesByRequest(requestId, context = {}) {
    this.assertSignatureStorageConfigured();
    return this.storage.findByRequestId(requestId, context);
  }

  async deleteSignature(storageKey) {
    this.assertSignatureStorageConfigured();
    return this.storage.deleteSignature(storageKey);
  }
}

export const trainingCenterStore = new TrainingCenterStore();
export { TRAINING_SHEETS };
