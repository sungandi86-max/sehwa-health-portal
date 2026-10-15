const QA_UPLOAD_CONTRACT = "qa-tb-idempotency-v1";
const QA_PRODUCTION_FOLDER_DENYLIST = [
  "19foLN446v5ggGN6hxLBuH8tNAQuSXgtM", "1MfxNVL1muROzpi1ZbV7WDWr4SKMU7ghm",
  "1T2yMxeKmab1SDqdVCRgdxpHMx3Fu2EO6", "1hUmRQ8kK0OYx_h4IxzFy8GXv9Ilm1w63"
];

function qaJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const params = e && e.parameter || {};
  if (Object.keys(params).length && (Object.keys(params).length !== 1 || params.mode !== "health")) {
    return qaJson_({ status: "error", message: "QA 제출 전용 서비스에서 지원하지 않는 요청입니다." });
  }
  return qaJson_({ status: "success", environment: "qa", service: "qa-submissions", version: 1 });
}

function doPost(e) {
  let lock = null;
  try {
    const request = JSON.parse(e.postData.contents);
    const payload = qaVerifyEnvelope_(request);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error("busy");
    if (payload.type === "qa-tb-upload-capability") {
      const folder = qaPrivateFolder_(payload);
      return qaJson_({ status: "success", contract: QA_UPLOAD_CONTRACT, folderId: folder.getId(), private: true });
    }
    if (payload.type === "qa-tb-evidence-metadata") return qaJson_(qaEvidenceMetadata_(payload));
    const prepared = qaPrepareUpload_(payload);
    qaReserveEnvelope_(request, payload, prepared);
    if (prepared.evidenceName && !prepared.existingEvidence) prepared.blob.setName(prepared.evidenceName);
    const file = prepared.existingEvidence || prepared.folder.createFile(prepared.blob);
    if (file.isTrashed() || file.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error("private evidence required");
    const result = { status: "success", success: true, fileId: file.getId(),
      submittedAt: Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") };
    if (payload.type === "tb") Object.assign(result, { submissionId: payload.qaSubmissionId,
      requestFingerprint: payload.qaRequestFingerprint, folderId: prepared.folder.getId(), private: true });
    return qaJson_(result);
  } catch (error) {
    return qaJson_({ status: "error", success: false, message: "QA 제출 요청을 처리하지 못했습니다." });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function qaEqual_(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function qaVerifyEnvelope_(request) {
  if (!request || request.action !== undefined || request.version !== 1 || !Number.isSafeInteger(request.sentAt) ||
      Math.abs(Date.now() - request.sentAt) > 120000 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.requestId || "") ||
      typeof request.payloadJson !== "string" || typeof request.payloadHash !== "string" ||
      typeof request.signature !== "string" || typeof request.visitor !== "string" ||
      (request.visitor && !/^[A-Za-z0-9_-]{43}$/.test(request.visitor))) throw new Error("invalid envelope");
  const payload = JSON.parse(request.payloadJson);
  if (!payload || Array.isArray(payload) || payload.action !== undefined || payload.runtimeEnvironment !== "qa" ||
      payload.recordMode !== "firestore" || ["tb", "cpr", "student-file", "qa-tb-upload-capability", "qa-tb-evidence-metadata"].indexOf(payload.type) < 0 ||
      (payload.type === "student-file" && !request.visitor)) throw new Error("QA submission only");
  const secret = PropertiesService.getScriptProperties().getProperty("QA_SUBMISSION_PROXY_SECRET");
  if (!secret || Utilities.newBlob(secret).getBytes().length < 32) throw new Error("QA secret missing");
  const hash = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    request.payloadJson, Utilities.Charset.UTF_8)).replace(/=+$/, "");
  const message = "v1\n" + request.sentAt + "\n" + request.requestId + "\n" + request.visitor + "\n" + request.payloadHash;
  const signature = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8)).replace(/=+$/, "");
  if (!qaEqual_(hash, request.payloadHash) || !qaEqual_(signature, request.signature)) throw new Error("signature mismatch");
  return payload;
}

function qaPrivateFolder_(payload) {
  const id = payload.qaEvidenceFolderId;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{10,200}$/.test(id) || QA_PRODUCTION_FOLDER_DENYLIST.indexOf(id) >= 0) {
    throw new Error("invalid QA folder");
  }
  const folder = DriveApp.getFolderById(id);
  if (folder.getId() !== id || folder.isTrashed() || folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error("private QA folder required");
  return folder;
}

function qaEvidenceMetadata_(payload) {
  if (typeof payload.fileId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(payload.fileId)) throw new Error("invalid file ID");
  const folder = qaPrivateFolder_(payload);
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getId() !== payload.fileId) continue;
    const parents = file.getParents();
    let matched = false;
    while (parents.hasNext()) if (parents.next().getId() === folder.getId()) matched = true;
    if (!matched || file.isTrashed() || file.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error("private QA evidence required");
    return { status: "success", verified: true, fileId: file.getId(), folderId: folder.getId(), trashed: false, private: true };
  }
  throw new Error("QA evidence missing");
}

function qaValidateBlob_(blob) {
  const mime = blob.getContentType(); const bytes = blob.getBytes();
  if (["application/pdf", "image/jpeg", "image/png"].indexOf(mime) < 0 || !bytes.length || bytes.length > 3 * 1024 * 1024) throw new Error("invalid evidence size or MIME");
  const values = bytes.slice(0, 8).map(function(value) { return value & 255; });
  const pdf = mime === "application/pdf" && values.slice(0, 5).join(",") === "37,80,68,70,45";
  const jpeg = mime === "image/jpeg" && values.slice(0, 3).join(",") === "255,216,255";
  const png = mime === "image/png" && values.join(",") === "137,80,78,71,13,10,26,10";
  if (!pdf && !jpeg && !png) throw new Error("evidence content mismatch");
}

function qaRecoverEvidence_(payload, folder, blob) {
  const prefix = payload.type === "tb" ? "QA-STAFF-TB-" : "QA-STUDENT-TB-";
  if (typeof payload.qaRequestFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(payload.qaRequestFingerprint) ||
      payload.qaSubmissionId !== prefix + payload.qaRequestFingerprint.slice(0, 32)) throw new Error("invalid stable identity");
  let existing = null;
  [".pdf", ".png", ".jpg"].forEach(function(suffix) {
    const files = folder.getFilesByName(payload.qaSubmissionId + suffix);
    while (files.hasNext()) { if (existing) throw new Error("duplicate stable evidence"); existing = files.next(); }
  });
  if (existing && (existing.isTrashed() || existing.getSharingAccess() !== DriveApp.Access.PRIVATE ||
      existing.getMimeType() !== payload.fileMimeType || existing.getSize() !== blob.getBytes().length ||
      Utilities.base64Encode(existing.getBlob().getBytes()) !== Utilities.base64Encode(blob.getBytes()))) throw new Error("evidence retry conflict");
  const suffix = payload.fileMimeType === "application/pdf" ? ".pdf" : payload.fileMimeType === "image/png" ? ".png" : ".jpg";
  return { existingEvidence: existing, evidenceName: payload.qaSubmissionId + suffix };
}

function qaPrepareUpload_(payload) {
  const required = { tb: ["name", "checkupDate"], cpr: ["name", "completionDate"],
    "student-file": ["grade", "classNumber", "studentNumber", "studentName"] };
  if (!payload.fields || typeof payload.fields !== "object" || Array.isArray(payload.fields) ||
      required[payload.type].some(function(key) { return !String(payload.fields[key] || "").trim(); }) ||
      JSON.stringify(payload.fields).length > 45000 ||
      (payload.type === "student-file" && String(payload.fields.studentName).length > 1000)) throw new Error("invalid submission fields");
  if (payload.type === "tb" && (payload.qaUploadContract !== QA_UPLOAD_CONTRACT ||
      !Number.isInteger(payload.schoolYear) || payload.schoolYear < 2000 || payload.schoolYear > 2100)) throw new Error("invalid TB year or contract");
  if (typeof payload.fileName !== "string" || !payload.fileName.trim() || typeof payload.fileBase64 !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.fileBase64) ||
      payload.fileBase64.length > 4 * 1024 * 1024) throw new Error("invalid evidence encoding");
  const blob = Utilities.newBlob(Utilities.base64Decode(payload.fileBase64), payload.fileMimeType, payload.fileName);
  qaValidateBlob_(blob);
  const folder = qaPrivateFolder_(payload);
  const prepared = { folder: folder, blob: blob };
  if (payload.type !== "cpr") Object.assign(prepared, qaRecoverEvidence_(payload, folder, blob));
  return prepared;
}

function qaReserveEnvelope_(request, payload, prepared) {
  const properties = PropertiesService.getScriptProperties(); const now = Date.now(); const prefix = "SUBMISSION_GUARD_";
  const keys = properties.getKeys().filter(function(key) { return key.indexOf(prefix) === 0; });
  keys.forEach(function(key) {
    const value = properties.getProperty(key);
    const expiresAt = value && value.charAt(0) === "{" ? JSON.parse(value).expiresAt : Number(value);
    if (!expiresAt || expiresAt <= now) properties.deleteProperty(key);
  });
  if (keys.filter(function(key) { return properties.getProperty(key) !== null; }).length >= 2000) throw new Error("guard capacity exceeded");
  const replayKey = prefix + "REQUEST_" + request.requestId;
  if (properties.getProperty(replayKey)) throw new Error("replayed envelope");
  if (payload.type === "student-file") {
    const repeatKey = prefix + "REPEAT_" + request.payloadHash; const rateKey = prefix + "RATE_" + request.visitor;
    if (properties.getProperty(repeatKey) && !prepared.existingEvidence) throw new Error("duplicate student request");
    const rate = JSON.parse(properties.getProperty(rateKey) || "null");
    if (rate && rate.expiresAt > now && rate.count >= 3) throw new Error("student rate limit");
    properties.setProperty(rateKey, JSON.stringify({ expiresAt: now + 600000, count: rate && rate.expiresAt > now ? rate.count + 1 : 1 }));
    if (!prepared.existingEvidence) properties.setProperty(repeatKey, String(now + 600000));
  }
  properties.setProperty(replayKey, String(request.sentAt + 120000));
}
