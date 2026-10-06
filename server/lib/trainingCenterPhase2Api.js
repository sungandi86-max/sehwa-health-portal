import { getFirebaseAdminAuth, getFirebaseAdminDb } from "./firebaseAdmin.js";
import { readJsonBody, readStaffDirectory, sendCors } from "./staffDirectory.js";
import { TARGET_HEADERS, TRAINING_HEADERS, TRAINING_SHEETS, TrainingSourceNotReadyError } from "./trainingCenter.js";
import { resolveTrainingAccess } from "./trainingCenterAccess.js";
import { DrivePrivacyError, trainingCenterStore } from "./trainingCenterStore.js";
import { AttendanceConflictError, assertCompletedAttendanceLock, attachAttendanceFile, cancelAttendanceLock, finishAttendance, markAttendanceAppendStarted, reserveAttendance } from "./trainingAttendanceCoordinator.js";
import { applyAttendanceRecovery, inspectAttendanceRecovery, listAttendanceRecoveryCandidates, RecoveryConflictError } from "./trainingAttendanceRecovery.js";
import { activeSignature, attendanceEligibility, decodeInkSignature, finalSheetModel, issueQrChallenge, newSignatureId, parseTrainingSource, resolveEvents, sheetRows, SIGNATURE_HEADERS, SIGNATURE_SHEET, truthy, validateTrainingInput, verifyQrChallenge } from "./trainingCenterPhase2.js";
import { finalSheetFilename, makeTrainingFinalSheetXlsx } from "./trainingFinalSheet.js";
import { TRAINING_PHASE2_RESOURCES } from "./trainingCenterPhase2Resources.js";

function bad(res, status, message, code = "") {
  return res.status(status).json({ ok: false, ...(code ? { code } : {}), message });
}

function param(value) {
  return typeof value === "string" && value.length <= 120 ? value.trim() : "";
}

function publicFinalModel(model) {
  return { event: model.event, counts: model.counts, rows: model.rows.map(({ fileId, ...row }) => ({ ...row, hasSignatureImage: Boolean(fileId) })) };
}

function validateTarget(input, source, directory) {
  const eventId = param(input?.eventId);
  const staffId = param(input?.staffId);
  if (!eventId || !staffId || !source.trainings.some((row) => row.eventId === eventId) || directory.filter((row) => row.staffId === staffId && row.employmentStatus === "재직").length !== 1) {
    throw new RangeError("교육 또는 재직 교직원 정보를 확인해 주세요.");
  }
  const state = input?.targetStatus;
  if (!["대상", "비대상", "제외"].includes(state)) throw new RangeError("대상 상태를 확인해 주세요.");
  const reason = String(input?.excludedReason || "").normalize("NFKC").trim();
  if (state === "제외" && !reason) throw new RangeError("제외 사유를 입력해 주세요.");
  return { eventId, "교직원ID": staffId, "대상상태": state, "필수여부": state === "대상" && input?.required === true ? "Y" : "N",
    "제외여부": state === "제외" ? "Y" : "N", "제외사유": reason.slice(0, 200) };
}

function qrScope(query) {
  const eventId = param(query?.eventId);
  const eventGroupId = param(query?.eventGroupId);
  if (Boolean(eventId) === Boolean(eventGroupId) || (eventId && !/^[A-Za-z0-9_-]{3,120}$/.test(eventId)) || (eventGroupId && !/^[A-Za-z0-9_-]{3,120}$/.test(eventGroupId))) {
    throw new RangeError("QR 교육 식별자를 확인해 주세요.");
  }
  return { eventId, eventGroupId };
}

function createSignatureRecord(event, staffId, { fileId = "", method = "qr", actor = "", reason = "", now = new Date() } = {}) {
  const iso = now.toISOString();
  return { signatureId: newSignatureId(), eventId: event.eventId, eventGroupId: event.eventGroupId,
    "교직원ID": staffId, "서명일시": iso, "출석방식": method, "서명파일ID": fileId,
    "상태": "완료", "취소여부": "N", "취소사유": reason, "정정자": actor,
    "정정일시": actor ? iso : "", createdAt: iso };
}

export function createTrainingPhase2Handler({ auth = getFirebaseAdminAuth, db = getFirebaseAdminDb, directory = readStaffDirectory,
  store = trainingCenterStore, secret = () => process.env.TRAINING_QR_SECRET || "", now = () => new Date() } = {}) {
  return async function handleTrainingPhase2(req, res) {
    sendCors(res, "GET, POST, OPTIONS");
    res.setHeader("Cache-Control", "private, no-store");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (!["GET", "POST"].includes(req.method)) return bad(res, 405, "지원하지 않는 요청입니다.");
    const resource = req.query?.resource;
    if (!TRAINING_PHASE2_RESOURCES.has(resource)) return bad(res, 400, "교육 요청 종류가 올바르지 않습니다.");
    try {
      const access = await resolveTrainingAccess(req, { auth, db, directory });
      if (!access.ok) return bad(res, access.status, access.message);
      const adminOnly = !["training-attendance-check", "training-attendance-submit"].includes(resource);
      if (adminOnly && !access.isAdmin) return bad(res, 403, "교육 관리자 권한이 없습니다.");
      const body = req.method === "POST" ? await readJsonBody(req, { maxBytes: 400000 }) : null;
      const eventId = param(req.query?.eventId || body?.eventId);

      if (resource === "training-attendance-recovery-candidates" && req.method === "GET") {
        return res.status(200).json({ ok: true, ...await listAttendanceRecoveryCandidates({ db: access.db, now: now().getTime() }) });
      }

      if (["training-attendance-recovery-check", "training-attendance-recovery-apply"].includes(resource)) {
        const apply = resource === "training-attendance-recovery-apply";
        if (req.method !== (apply ? "POST" : "GET")) return bad(res, 405, "지원하지 않는 요청입니다.");
        const staffId = param(req.query?.staffId || body?.staffId);
        if (!eventId || !staffId) return bad(res, 400, "복구 대상 교육과 교직원ID가 필요합니다.");
        const args = { db: access.db, store, eventId, staffId, actor: access.assignment.staffId, now: now().getTime(),
          confirmedNoInflight: body?.confirmedNoInflight === true, reason: body?.reason };
        const result = await (apply ? applyAttendanceRecovery(args) : inspectAttendanceRecovery(args));
        if (apply && !result.recoverable) return bad(res, 409, "자동 복구할 수 없는 잠금입니다. 기록을 확인해 주세요.");
        return res.status(200).json({ ok: true, status: result.status, recoverable: result.recoverable,
          eventCount: result.eventIds.length, orphanFileCount: result.orphanFiles?.length || 0,
          orphanFiles: (result.orphanFiles || []).map(({ fileId, private: isPrivate }) => ({ fileId, private: isPrivate })),
          canReviewedRetry: result.canReviewedRetry === true, reviewedRelease: result.reviewedRelease === true });
      }

      if (resource === "training-admin-list" && req.method === "GET") {
        const base = await store.readBase();
        const items = sheetRows(base.trainings, TRAINING_HEADERS).filter((row) => row.eventId).map(({ rowNumber, ...row }) => row);
        return res.status(200).json({ ok: true, items });
      }
      if (resource === "training-admin-save" && req.method === "POST") {
        const base = await store.readBase();
        const rows = sheetRows(base.trainings, TRAINING_HEADERS);
        const existing = rows.find((row) => row.eventId === body?.eventId);
        if (body?.eventId && !existing) return bad(res, 404, "수정할 교육을 찾을 수 없습니다.");
        const values = validateTrainingInput(body, { existing });
        if (!existing && rows.some((row) => row.eventId === values.eventId)) return bad(res, 409, "교육 ID가 이미 존재합니다.");
        await store.saveRow(TRAINING_SHEETS.trainings, TRAINING_HEADERS, values, existing?.rowNumber);
        return res.status(200).json({ ok: true, item: values });
      }
      if (resource === "training-admin-directory" && req.method === "GET") {
        return res.status(200).json({ ok: true, items: access.directory.filter((row) => row.employmentStatus === "재직")
          .map(({ staffId, name, position, department }) => ({ staffId, name, position, department })) });
      }
      if (resource === "training-targets" && req.method === "GET") {
        if (!eventId) return bad(res, 400, "교육 ID가 필요합니다.");
        const base = await store.readBase();
        const trainings = sheetRows(base.trainings, TRAINING_HEADERS);
        if (!trainings.some((row) => row.eventId === eventId)) return bad(res, 404, "교육을 찾을 수 없습니다.");
        const items = sheetRows(base.targets, TARGET_HEADERS).filter((row) => row.eventId === eventId).map(({ rowNumber, ...row }) => row);
        return res.status(200).json({ ok: true, items });
      }
      if (resource === "training-target-save" && req.method === "POST") {
        const base = await store.readBase();
        const source = { trainings: sheetRows(base.trainings, TRAINING_HEADERS), targets: sheetRows(base.targets, TARGET_HEADERS) };
        const values = validateTarget(body, source, access.directory);
        const matches = source.targets.filter((row) => row.eventId === values.eventId && row["교직원ID"] === values["교직원ID"]);
        if (matches.length > 1) throw new TrainingSourceNotReadyError();
        await store.saveRow(TRAINING_SHEETS.targets, TARGET_HEADERS, values, matches[0]?.rowNumber);
        return res.status(200).json({ ok: true, item: values });
      }
      if (resource === "training-qr" && req.method === "GET") {
        if (Buffer.byteLength(secret(), "utf8") < 32) throw new TrainingSourceNotReadyError();
        store.assertSignatureFolderConfigured();
        const scope = qrScope(req.query);
        const source = parseTrainingSource(await store.readSource());
        const events = resolveEvents(source, scope);
        if (!events.length) return bad(res, 404, "교육을 찾을 수 없습니다.");
        const challenge = issueQrChallenge({ ...scope, secret: secret(), now: now().getTime() });
        const path = scope.eventGroupId ? `/training/attendance/group/${encodeURIComponent(scope.eventGroupId)}` : `/training/attendance/${encodeURIComponent(scope.eventId)}`;
        return res.status(200).json({ ok: true, path: `${path}?challenge=${encodeURIComponent(challenge)}`, expiresAt: new Date(now().getTime() + 15 * 60 * 1000).toISOString(), eventCount: events.length });
      }
      if (resource === "training-attendance-check" && req.method === "GET") {
        if (Buffer.byteLength(secret(), "utf8") < 32) throw new TrainingSourceNotReadyError();
        const scope = qrScope(req.query);
        if (!verifyQrChallenge(req.query?.challenge, { ...scope, secret: secret(), now: now().getTime() })) return bad(res, 403, "QR 유효시간이 지났거나 링크가 올바르지 않습니다.");
        const source = parseTrainingSource(await store.readSource());
        const events = resolveEvents(source, scope);
        if (!events.length) return bad(res, 404, "교육을 찾을 수 없습니다.");
        const eligibility = attendanceEligibility(source, events, access.assignment.staffId, now());
        return res.status(200).json({ ok: true, items: eligibility, canSubmit: eligibility.every((item) => item.eligible) });
      }
      if (resource === "training-attendance-submit" && req.method === "POST") {
        if (Buffer.byteLength(secret(), "utf8") < 32) throw new TrainingSourceNotReadyError();
        store.assertSignatureFolderConfigured();
        const scope = qrScope(body);
        if (!verifyQrChallenge(body?.challenge, { ...scope, secret: secret(), now: now().getTime() })) return bad(res, 403, "QR 유효시간이 지났거나 링크가 올바르지 않습니다.");
        const bytes = decodeInkSignature(body?.signature);
        const source = parseTrainingSource(await store.readSource());
        const events = resolveEvents(source, scope);
        if (!events.length) return bad(res, 404, "교육을 찾을 수 없습니다.");
        const eligibility = attendanceEligibility(source, events, access.assignment.staffId, now());
        if (eligibility.some((item) => !item.eligible)) return bad(res, 409, eligibility.find((item) => !item.eligible).reason);
        const reservation = await reserveAttendance(access.db, events.map((event) => event.eventId), access.assignment.staffId, now().getTime());
        let fileId = "";
        let records = [];
        let appendStarted = false;
        try {
          fileId = await store.uploadSignature(bytes, events[0].eventId, now(), reservation.requestId);
          await attachAttendanceFile(reservation, fileId, now().getTime());
          records = events.map((event) => createSignatureRecord(event, access.assignment.staffId, { fileId, now: now() }));
          await markAttendanceAppendStarted(reservation, now().getTime());
          appendStarted = true;
          await store.appendSignatures(records);
        } catch (error) {
          if (!fileId && error?.fileId) fileId = error.fileId;
          let committed = false;
          let certain = !records.length;
          if (records.length) {
            try {
              const latest = parseTrainingSource(await store.readSource());
              const found = records.filter((record) => latest.signatures.some((row) => row.signatureId === record.signatureId));
              committed = found.length === records.length;
              certain = committed || (!appendStarted && found.length === 0);
            } catch { certain = false; }
          }
          if (!committed && certain) {
            await finishAttendance(reservation, "failed", { orphanFileIds: fileId ? [fileId] : [] });
          }
          if (error instanceof DrivePrivacyError) {
            if (error.requiresImmediateIsolation) console.error("[training] signature permission isolation requires administrator attention");
            return bad(res, 503, error.requiresImmediateIsolation ? "서명 파일 공개 권한을 차단하지 못했습니다. 관리자에게 즉시 문의해 주세요." : error.message);
          }
          if (!committed) return bad(res, 503, certain ? "출석 저장에 실패했습니다. 다시 시도해 주세요." : "출석 저장 결과를 확인 중입니다. 관리자에게 문의해 주세요.");
        }
        let coordinationReconciled = true;
        try { await finishAttendance(reservation, "completed", { signatureIds: records.map((record) => record.signatureId) }); }
        catch { coordinationReconciled = false; console.warn("[training] attendance coordination reconciliation needed"); }
        return res.status(200).json({ ok: true, eventIds: events.map((event) => event.eventId), signedAt: records[0]["서명일시"], coordinationReconciled });
      }
      if (["training-attendance-summary", "training-final-sheet"].includes(resource) && req.method === "GET") {
        if (!eventId) return bad(res, 400, "교육 ID가 필요합니다.");
        const source = parseTrainingSource(await store.readSource());
        const model = finalSheetModel(source, access.directory, eventId);
        if (!model) return bad(res, 404, "교육을 찾을 수 없습니다.");
        if (resource === "training-final-sheet" && req.query?.download === "1") {
          const bytes = await makeTrainingFinalSheetXlsx(model, { readSignature: (fileId) => store.downloadSignature(fileId) });
          res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
          res.setHeader("Content-Disposition", `attachment; filename="training-final-sheet.xlsx"; filename*=UTF-8''${encodeURIComponent(finalSheetFilename(model.event))}`);
          return res.status(200).send(bytes);
        }
        return res.status(200).json({ ok: true, ...publicFinalModel(model) });
      }
      if (resource === "training-attendance-correct" && req.method === "POST") {
        const staffId = param(body?.staffId);
        const reason = String(body?.reason || "").normalize("NFKC").trim();
        if (!eventId || !staffId || !reason || reason.length > 200 || !["cancel", "mark-attended"].includes(body?.action)) throw new RangeError("정정 대상과 사유를 확인해 주세요.");
        const source = parseTrainingSource(await store.readSource());
        const event = source.trainings.find((row) => row.eventId === eventId);
        const target = source.targets.find((row) => row.eventId === eventId && row["교직원ID"] === staffId);
        if (!event || !target || access.directory.filter((row) => row.staffId === staffId && row.employmentStatus === "재직").length !== 1) return bad(res, 404, "정정 대상을 찾을 수 없습니다.");
        const active = source.signatures.find((row) => row.eventId === eventId && row["교직원ID"] === staffId && activeSignature(row));
        if (body.action === "cancel") {
          if (!active) {
            if (source.signatures.some((row) => row.eventId === eventId && row["교직원ID"] === staffId && truthy(row["취소여부"]))) {
              await cancelAttendanceLock(access.db, eventId, staffId, access.assignment.staffId);
              return res.status(200).json({ ok: true });
            }
            return bad(res, 409, "취소할 출석 기록이 없습니다.");
          }
          await assertCompletedAttendanceLock(access.db, eventId, staffId);
          const corrected = { ...active, "상태": "취소", "취소여부": "Y", "취소사유": reason, "정정자": access.assignment.staffId, "정정일시": now().toISOString() };
          await store.saveRow(SIGNATURE_SHEET, SIGNATURE_HEADERS, corrected, active.rowNumber);
          await cancelAttendanceLock(access.db, eventId, staffId, access.assignment.staffId);
        } else {
          if (active || truthy(target["제외여부"]) || !["대상", "교육 대상"].includes(target["대상상태"])) return bad(res, 409, "이미 출석했거나 현재 교육 대상이 아닙니다.");
          const reservation = await reserveAttendance(access.db, [eventId], staffId, now().getTime());
          const record = createSignatureRecord(event, staffId, { method: "correction", actor: access.assignment.staffId, reason, now: now() });
          let appendStarted = false;
          try { await markAttendanceAppendStarted(reservation, now().getTime()); appendStarted = true; await store.appendSignatures([record]); await finishAttendance(reservation, "completed", { signatureIds: [record.signatureId] }); }
          catch {
            let committed = false;
            try { committed = parseTrainingSource(await store.readSource()).signatures.some((row) => row.signatureId === record.signatureId); }
            catch { return bad(res, 503, "출석 정정 결과를 확인 중입니다. 관리자에게 문의해 주세요."); }
            if (!committed && !appendStarted) {
              await finishAttendance(reservation, "failed");
              return bad(res, 503, "출석 정정에 실패했습니다.");
            }
            if (!committed) return bad(res, 503, "출석 정정 결과를 확인 중입니다. 관리자에게 문의해 주세요.");
            try { await finishAttendance(reservation, "completed", { signatureIds: [record.signatureId] }); }
            catch { console.warn("[training] correction coordination reconciliation needed"); }
          }
        }
        return res.status(200).json({ ok: true });
      }
      return bad(res, 405, "지원하지 않는 요청입니다.");
    } catch (error) {
      if (error instanceof AttendanceConflictError) return bad(res, 409, error.message, error.code);
      if (error instanceof RecoveryConflictError) return bad(res, 409, error.message, "recovery-conflict");
      if (error instanceof TrainingSourceNotReadyError) return bad(res, 503, "교육센터 Sheet 또는 저장소 설정을 확인해 주세요.", error.code);
      if (error instanceof RangeError || error instanceof SyntaxError) return bad(res, 400, error.message);
      return bad(res, 500, "교육 업무를 처리하지 못했습니다.");
    }
  };
}

export const handleTrainingPhase2Resource = createTrainingPhase2Handler();
