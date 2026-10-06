const GATEWAY_ACTIONS = new Set([
  "healthCheck",
  "saveSignature",
  "readSignature",
  "findSignatureByRequestId",
  "renderRosterPdf"
]);
const GATEWAY_MAX_AGE_MS = 5 * 60 * 1000;
const GATEWAY_MAX_PNG_BYTES = 300000;
const GATEWAY_MAX_XLSX_BYTES = 8 * 1024 * 1024;
const GATEWAY_ROOT_PROPERTY = "SIGNATURE_FOLDER_ID";
const GATEWAY_SECRET_PROPERTY = "GATEWAY_SECRET";

function doPost(event) {
  try {
    const envelope = JSON.parse(event && event.postData && event.postData.contents || "{}");
    const payload = verifyGatewayEnvelope_(envelope);
    let result;
    if (envelope.action === "healthCheck") result = healthCheck_();
    else if (envelope.action === "saveSignature") result = saveSignature_(payload, envelope.requestId);
    else if (envelope.action === "readSignature") result = readSignature_(payload);
    else if (envelope.action === "findSignatureByRequestId") result = findSignatureByRequestId_(payload, envelope.requestId);
    else if (envelope.action === "renderRosterPdf") result = renderRosterPdf_(payload, envelope.requestId);
    else throw safeError_("INVALID_REQUEST");
    return jsonResponse_(Object.assign({ ok: true, requestId: envelope.requestId }, result || {}));
  } catch (error) {
    return jsonResponse_({ ok: false, code: safeCode_(error) });
  }
}

function verifyGatewayEnvelope_(envelope) {
  const timestamp = Number(envelope.timestamp);
  const requestId = String(envelope.requestId || "");
  const action = String(envelope.action || "");
  const bodyDigest = String(envelope.bodyDigest || "").toLowerCase();
  const signature = String(envelope.signature || "").toLowerCase();
  const payloadJson = String(envelope.payloadJson || "");
  if (!GATEWAY_ACTIONS.has(action) || !/^[0-9a-f-]{36}$/i.test(requestId) ||
      !Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > GATEWAY_MAX_AGE_MS ||
      !/^[0-9a-f]{64}$/.test(bodyDigest) || !/^[0-9a-f]{64}$/.test(signature) ||
      payloadJson.length > 12 * 1024 * 1024) throw safeError_("INVALID_REQUEST");

  const secret = PropertiesService.getScriptProperties().getProperty(GATEWAY_SECRET_PROPERTY) || "";
  if (Utilities.newBlob(secret).getBytes().length < 32) throw safeError_("CONFIG_REQUIRED");
  const actualDigest = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payloadJson, Utilities.Charset.UTF_8));
  if (!constantTimeHexEqual_(actualDigest, bodyDigest)) throw safeError_("AUTH_FAILED");
  const canonical = [timestamp, requestId, action, bodyDigest].join("\n");
  const expected = hex_(Utilities.computeHmacSha256Signature(canonical, secret, Utilities.Charset.UTF_8));
  if (!constantTimeHexEqual_(expected, signature)) throw safeError_("AUTH_FAILED");

  const replayKey = "gateway:" + hex_(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, [timestamp, requestId, action, signature].join(":"), Utilities.Charset.UTF_8
  ));
  const cache = CacheService.getScriptCache();
  if (cache.get(replayKey)) throw safeError_("REPLAY_REJECTED");
  cache.put(replayKey, "1", Math.ceil(GATEWAY_MAX_AGE_MS / 1000));
  try {
    return JSON.parse(payloadJson);
  } catch (error) {
    throw safeError_("INVALID_REQUEST");
  }
}

function healthCheck_() {
  const root = signatureRoot_();
  root.getName();
  assertPrivate_(root.getId());
  return { storageReady: true, readReady: true };
}

function saveSignature_(payload, requestId) {
  const eventId = safeSegment_(payload.eventId);
  const year = String(payload.year || "");
  if (!/^20\d{2}$/.test(year)) throw safeError_("INVALID_REQUEST");
  const bytes = Utilities.base64Decode(String(payload.pngBase64 || ""));
  assertPng_(bytes);
  const eventFolder = getOrCreateFolder_(getOrCreateFolder_(signatureRoot_(), year), eventId);
  const filename = requestId + ".png";
  const existing = eventFolder.getFilesByName(filename);
  if (existing.hasNext()) {
    const file = existing.next();
    if (existing.hasNext()) throw safeError_("DUPLICATE_SIGNATURE");
    assertSignatureFile_(file);
    assertPrivate_(file.getId());
    return { storageKey: [year, eventId, filename].join("/") };
  }
  const file = eventFolder.createFile(Utilities.newBlob(bytes, "image/png", filename));
  assertSignatureFile_(file);
  assertPrivate_(file.getId());
  return { storageKey: [year, eventId, filename].join("/") };
}

function readSignature_(payload) {
  const file = fileFromStorageKey_(String(payload.storageKey || ""));
  assertSignatureFile_(file);
  assertPrivate_(file.getId());
  return { pngBase64: Utilities.base64Encode(file.getBlob().getBytes()) };
}

function findSignatureByRequestId_(payload, requestId) {
  const filename = requestId + ".png";
  const files = DriveApp.getFilesByName(filename);
  const matches = [];
  while (files.hasNext()) {
    const file = files.next();
    if (isUnderRoot_(file, signatureRoot_().getId())) matches.push(file);
  }
  if (matches.length > 1) throw safeError_("DUPLICATE_SIGNATURE");
  if (!matches.length) return { found: false };
  assertSignatureFile_(matches[0]);
  const parents = parentNamesToRoot_(matches[0], signatureRoot_().getId());
  if (parents.length !== 2 || (payload.year && String(payload.year) !== parents[0]) ||
      (payload.eventId && String(payload.eventId) !== parents[1])) throw safeError_("NOT_FOUND");
  return { found: true, storageKey: [parents[0], parents[1], filename].join("/") };
}

function renderRosterPdf_(payload, requestId) {
  const bytes = Utilities.base64Decode(String(payload.xlsxBase64 || ""));
  if (!bytes.length || bytes.length > GATEWAY_MAX_XLSX_BYTES || !isZip_(bytes)) throw safeError_("INVALID_REQUEST");
  const safeName = String(payload.filename || "training-roster").replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 80);
  let convertedId = "";
  try {
    const xlsx = Utilities.newBlob(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", requestId + ".xlsx");
    const converted = Drive.Files.insert({ title: safeName, mimeType: "application/vnd.google-apps.spreadsheet" }, xlsx, { convert: true });
    convertedId = converted.id;
    const query = "format=pdf&size=A4&portrait=true&fitw=true&sheetnames=false&printtitle=false&pagenumbers=false&gridlines=false&fzr=true";
    const response = UrlFetchApp.fetch("https://docs.google.com/spreadsheets/d/" + encodeURIComponent(convertedId) + "/export?" + query, {
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) throw safeError_("PDF_RENDER_FAILED");
    const pdf = response.getBlob().getBytes();
    if (pdf.length < 5 || String.fromCharCode.apply(null, pdf.slice(0, 5)) !== "%PDF-") throw safeError_("PDF_RENDER_FAILED");
    return { pdfBase64: Utilities.base64Encode(pdf) };
  } catch (error) {
    if (safeCode_(error) === "PDF_RENDER_FAILED") throw error;
    throw safeError_("PDF_RENDER_FAILED");
  } finally {
    if (convertedId) {
      try { DriveApp.getFileById(convertedId).setTrashed(true); } catch (ignore) {}
    }
  }
}

function signatureRoot_() {
  const id = PropertiesService.getScriptProperties().getProperty(GATEWAY_ROOT_PROPERTY) || "";
  if (!/^[A-Za-z0-9_-]{5,}$/.test(id)) throw safeError_("CONFIG_REQUIRED");
  try {
    return DriveApp.getFolderById(id);
  } catch (error) {
    throw safeError_("STORAGE_NOT_READY");
  }
}

function getOrCreateFolder_(parent, name) {
  const safeName = safeSegment_(name);
  const folders = parent.getFoldersByName(safeName);
  if (folders.hasNext()) {
    const folder = folders.next();
    if (folders.hasNext()) throw safeError_("STORAGE_NOT_READY");
    return folder;
  }
  return parent.createFolder(safeName);
}

function fileFromStorageKey_(storageKey) {
  const parts = storageKey.split("/");
  if (parts.length !== 3 || !/^20\d{2}$/.test(parts[0]) || !/^[A-Za-z0-9_-]{3,120}$/.test(parts[1]) ||
      !/^[0-9a-f-]{36}\.png$/i.test(parts[2])) throw safeError_("INVALID_REQUEST");
  let folder = signatureRoot_();
  for (let index = 0; index < 2; index += 1) {
    const folders = folder.getFoldersByName(parts[index]);
    if (!folders.hasNext()) throw safeError_("NOT_FOUND");
    folder = folders.next();
    if (folders.hasNext()) throw safeError_("STORAGE_NOT_READY");
  }
  const files = folder.getFilesByName(parts[2]);
  if (!files.hasNext()) throw safeError_("NOT_FOUND");
  const file = files.next();
  if (files.hasNext()) throw safeError_("DUPLICATE_SIGNATURE");
  return file;
}

function parentNamesToRoot_(file, rootId) {
  const names = [];
  let parents = file.getParents();
  for (let depth = 0; depth < 8 && parents.hasNext(); depth += 1) {
    const parent = parents.next();
    if (parents.hasNext()) throw safeError_("STORAGE_NOT_READY");
    if (parent.getId() === rootId) return names.reverse();
    names.push(parent.getName());
    parents = parent.getParents();
  }
  throw safeError_("NOT_FOUND");
}

function isUnderRoot_(file, rootId) {
  try {
    parentNamesToRoot_(file, rootId);
    return true;
  } catch (error) {
    return false;
  }
}

function assertSignatureFile_(file) {
  if (file.getMimeType() !== "image/png" || file.getSize() <= 0 || file.getSize() > GATEWAY_MAX_PNG_BYTES) throw safeError_("INVALID_REQUEST");
  assertPng_(file.getBlob().getBytes());
}

function assertPrivate_(fileId) {
  try {
    const permissions = Drive.Permissions.list(fileId).items || [];
    if (permissions.some(function (permission) {
      return permission.type === "anyone" || permission.type === "domain";
    })) throw safeError_("STORAGE_NOT_READY");
  } catch (error) {
    if (safeCode_(error) === "STORAGE_NOT_READY") throw error;
    throw safeError_("STORAGE_NOT_READY");
  }
}

function assertPng_(bytes) {
  const magic = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!bytes || !bytes.length || bytes.length > GATEWAY_MAX_PNG_BYTES ||
      magic.some(function (value, index) { return (bytes[index] & 255) !== value; })) throw safeError_("INVALID_REQUEST");
}

function isZip_(bytes) {
  return bytes.length >= 4 && (bytes[0] & 255) === 80 && (bytes[1] & 255) === 75 &&
    (bytes[2] & 255) === 3 && (bytes[3] & 255) === 4;
}

function safeSegment_(value) {
  const text = String(value || "");
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(text)) throw safeError_("INVALID_REQUEST");
  return text;
}

function constantTimeHexEqual_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function hex_(bytes) {
  return bytes.map(function (value) { return ((value & 255) + 256).toString(16).slice(-2); }).join("");
}

function safeError_(code) {
  const error = new Error(code);
  error.safeCode = code;
  return error;
}

function safeCode_(error) {
  const allowed = ["AUTH_FAILED", "CONFIG_REQUIRED", "DUPLICATE_SIGNATURE", "INVALID_REQUEST", "NOT_FOUND",
    "PDF_RENDER_FAILED", "REPLAY_REJECTED", "STORAGE_NOT_READY"];
  return allowed.indexOf(error && error.safeCode) >= 0 ? error.safeCode : "STORAGE_NOT_READY";
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
