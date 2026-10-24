// QA ONLY. Deploy Code.gs + Shared.gs into a NEW QA-owned script project.
// No production source, resource values, credentials or triggers are installed.
function qaReject_(code) { const error = new Error("QA 자원 설정 또는 요청을 확인해 주세요."); error.qaCode = code; throw error; }
function qaProperty_(name) { return PropertiesService.getScriptProperties().getProperty(name) || ""; }
function qaEnvironment_(role) {
  if (qaProperty_("APP_ENV") !== "qa") qaReject_("ENVIRONMENT_UNRESOLVED");
  const configured = qaProperty_("QA_GAS_ROLE");
  if (["submission", "portal", "studentCare"].indexOf(configured) < 0 || (role && configured !== role)) qaReject_("QA_ROLE_MISMATCH");
  if (qaProperty_("QA_RESOURCES_VERIFIED") !== "true") qaReject_("QA_RESOURCES_UNVERIFIED");
  return configured;
}
function qaHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function(b) { return ("0" + (b & 255).toString(16)).slice(-2); }).join("");
}
function qaId_(name) {
  const value = qaProperty_(name);
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(value)) qaReject_("QA_RESOURCE_MISSING");
  if (QA_PRODUCTION_RESOURCE_HASHES.indexOf(qaHash_(value)) !== -1) qaReject_("RESOURCE_ENV_MISMATCH");
  return value;
}
function qaSecret_(kind) {
  const value = qaProperty_(kind === "submission" ? "QA_SUBMISSION_PROXY_SECRET" : "QA_STUDENT_CARE_PROXY_SECRET");
  if (Utilities.newBlob(value).getBytes().length < 32) qaReject_("QA_SECRET_REQUIRED");
  return value;
}
function qaWorkbook_() { qaEnvironment_(); return qaId_("QA_SPREADSHEET_ID"); }
function getSpreadsheet_() { return SpreadsheetApp.openById(qaWorkbook_()); }
function getStudentCareSyncEndpoint_() {
  qaEnvironment_("studentCare");
  const project = qaProperty_("QA_FIREBASE_PROJECT_ID");
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) || QA_PRODUCTION_RESOURCE_HASHES.indexOf(qaHash_(project)) !== -1) qaReject_("QA_PROJECT_REQUIRED");
  const host = qaProperty_("QA_CALLBACK_HOST");
  const url = qaProperty_("QA_STUDENT_CARE_SYNC_ENDPOINT");
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.vercel\.app$/.test(host) ||
      host === "sehwa-health-portal.vercel.app" ||
      url !== "https://" + host + "/api/firebase/student-care-sync") qaReject_("QA_CALLBACK_REQUIRED");
  // The reviewed Preview host is an operator declaration, not remote project proof.
  return url;
}
function qaFetch_(url, options) {
  qaWorkbook_(); qaSecret_("studentCare");
  if (url !== getStudentCareSyncEndpoint_()) qaReject_("RESOURCE_ENV_MISMATCH");
  return UrlFetchApp.fetch(url, Object.assign({}, options, { followRedirects: false, muteHttpExceptions: true }));
}
function verifyStudentCareProxySecret_(params) {
  qaEnvironment_("studentCare"); const expected = qaSecret_("studentCare");
  if (!submissionProxyEqual_(String(params.proxySecret || ""), expected)) qaReject_("QA_SIGNATURE_INVALID");
  return { ok: true };
}
function qaSafeResult_(value) {
  if (!value || value.result === "error" || value.status === "error" || value.error) return { status: "error", result: "error", success: false, code: "QA_REQUEST_FAILED", message: "QA 요청을 처리하지 못했습니다." };
  if (typeof value !== "object") return value;
  const result = Array.isArray(value) ? [] : {};
  Object.keys(value).forEach(function(key) { if (["debug", "stack", "proxySecret", "signature"].indexOf(key) < 0) result[key] = value[key] && typeof value[key] === "object" ? qaSafeResult_(value[key]) : value[key]; });
  return result;
}
function qaOutput_(body) { return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON); }
function qaFailure_(error) { return qaOutput_({ status: "error", result: "error", success: false, code: error && error.qaCode || "QA_REQUEST_FAILED", message: "QA 요청을 처리하지 못했습니다." }); }
function doGet(e) {
  try {
    const role = qaEnvironment_(); const params = e && e.parameter || {};
    qaWorkbook_();
    if (role === "portal" && params.mode === "portal" && !params.action) return qaOutput_(qaSafeResult_(getPortalData_(params)));
    if (role !== "studentCare") qaReject_("QA_ACTION_FORBIDDEN");
    const readers = { getHealthRoomLocationByAssignment: getHealthRoomLocationByAssignment_, confirmHealthRoomHomeroomByAssignment: confirmHealthRoomHomeroomByAssignment_,
      monthlyVisitByAssignment: getMonthlyVisitRecordsByAssignment_, adminVisitStatsByRole: getAdminVisitStatsByRole_ };
    const sync = { syncStudentCareMonthlyAggregate: syncStudentCareMonthlyAggregateFromRequest_, syncStudentCarePresencePublic: syncStudentCarePresencePublicFromRequest_,
      syncStudentCarePresenceHomeroom: syncStudentCarePresenceHomeroomFromRequest_ };
    const name = params.action || params.mode;
    verifyStudentCareProxySecret_(params); // Before workbook/data I/O.
    if (Object.prototype.hasOwnProperty.call(sync, name)) { getStudentCareSyncEndpoint_(); return qaOutput_(qaSafeResult_(sync[name](params))); }
    if (!Object.prototype.hasOwnProperty.call(readers, name)) qaReject_("QA_ACTION_FORBIDDEN");
    return qaOutput_(qaSafeResult_(readers[name](params)));
  } catch (error) { return qaFailure_(error); }
}
function qaPrepareSubmission_(payload, folderId) {
  const types = { cpr: ["name", "completionDate"], tb: ["name", "checkupDate"], "student-file": ["grade", "classNumber", "studentNumber", "studentName"] };
  if (!payload.fields || !types[payload.type] || types[payload.type].some(function(key) { return !String(payload.fields[key] || "").trim(); }) ||
      !payload.fileName || !payload.fileBase64 || !payload.fileMimeType) qaReject_("QA_PAYLOAD_INVALID");
  const blob = Utilities.newBlob(Utilities.base64Decode(payload.fileBase64), payload.fileMimeType, payload.fileName);
  validateSubmissionBlob_(blob);
  let name = "";
  if (payload.type === "student-file") {
    if (!/^QA-STUDENT-TB-[a-f0-9]{32}$/.test(payload.qaSubmissionId || "") || !/^[a-f0-9]{64}$/.test(payload.qaRequestFingerprint || "") ||
        payload.qaSubmissionId !== "QA-STUDENT-TB-" + payload.qaRequestFingerprint.slice(0, 32)) qaReject_("QA_PAYLOAD_INVALID");
    name = payload.qaSubmissionId + (payload.fileMimeType === "application/pdf" ? ".pdf" : payload.fileMimeType === "image/png" ? ".png" : ".jpg");
  }
  const folder = DriveApp.getFolderById(folderId); folder.getId();
  let existing = null;
  if (name) {
    const files = folder.getFilesByName(name);
    if (files.hasNext()) {
      existing = files.next();
      if (files.hasNext() || existing.getMimeType() !== payload.fileMimeType || existing.getSize() !== blob.getBytes().length) qaReject_("QA_EVIDENCE_CONFLICT");
    }
  }
  return { folder: folder, blob: blob, evidenceName: name, existingEvidence: existing, firestoreAudit: true };
}
function doPost(e) {
  let lock, locked = false;
  try {
    const retirementRequest = JSON.parse(e.postData.contents);
    const retirementPayload = typeof retirementRequest.payloadJson === "string" ? JSON.parse(retirementRequest.payloadJson) : retirementRequest;
    if (retirementPayload && typeof retirementPayload.type === "string" &&
        ["student-file", "student_tb_reply", "student_file", "studentfile", "tbreply"].indexOf(retirementPayload.type.trim().toLowerCase()) !== -1) {
      return qaOutput_({ status: "error", result: "error", success: false, code: "STUDENT_TB_REPLY_RETIRED",
        message: "해당 제출 기능은 운영이 종료되었습니다. 관련 문의는 학교 보건실로 해주시기 바랍니다." });
    }
    qaEnvironment_("submission"); qaWorkbook_(); qaSecret_("submission");
    const request = retirementRequest;
    const claimed = retirementPayload;
    if (claimed.runtimeEnvironment !== "qa" || claimed.recordMode !== "firestore" || ["cpr", "tb", "student-file"].indexOf(claimed.type) < 0) qaReject_("RESOURCE_ENV_MISMATCH");
    const folderId = qaId_({ cpr: "QA_CPR_DRIVE_FOLDER_ID", tb: "QA_TB_CERTIFICATE_DRIVE_FOLDER_ID", "student-file": "QA_STUDENT_REPLY_DRIVE_FOLDER_ID" }[claimed.type]);
    if (claimed.qaEvidenceFolderId !== folderId) qaReject_("RESOURCE_ENV_MISMATCH");
    const payload = verifySubmissionProxy_(request); // Exact existing v1 HMAC/time/visitor contract.
    lock = LockService.getScriptLock(); locked = lock.tryLock(10000); if (!locked) qaReject_("QA_BUSY");
    const prepared = qaPrepareSubmission_(payload, folderId);
    reserveSubmissionProxy_(request, payload, prepared); // Existing replay/rate reservation.
    if (payload.type === "student-file") return qaOutput_(appendStudentFileSubmission_(payload, prepared, request.requestId));
    const file = prepared.folder.createFile(prepared.blob);
    return qaOutput_({ status: "success", fileId: file.getId(), fileUrl: file.getUrl() });
  } catch (error) { return qaFailure_(error); }
  finally { if (locked) lock.releaseLock(); }
}
// QA automation is deliberately unsupported. Existing installed trigger names
// fail closed even when invoked manually. No ScriptApp API is used or exported.
function qaAutomationBlocked_() { qaEnvironment_(); qaReject_("QA_AUTOMATION_DISABLED"); }
function onEdit(e) { qaAutomationBlocked_(); }
function syncStudentCareProjectionOnEdit_(e) { qaAutomationBlocked_(); }
function syncStudentCareRecentProjectionBatch_() { qaAutomationBlocked_(); }
function rebuildStudentCareProjectionsNightly_() { qaAutomationBlocked_(); }
function rebuildStudentCareProjectionsNightly() { qaAutomationBlocked_(); }
function backupHealthRoomSpreadsheetNightly_() { qaAutomationBlocked_(); }
function backupHealthRoomSpreadsheetNow() { qaAutomationBlocked_(); }
function backupHealthRoomSpreadsheetDryRun() { qaAutomationBlocked_(); }
function setupStudentCareProjectionTriggers() { qaAutomationBlocked_(); }
function removeStudentCareProjectionTriggers() { qaAutomationBlocked_(); }
