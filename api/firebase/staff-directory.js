import {
  applyHealthMandatoryTrainingSnapshot,
  getResearchTrainingSummary,
  getHealthMandatoryTrainingCurrentTargets,
  runHealthMandatoryTrainingDryRun,
} from "../../server/healthMandatoryTrainingDryRun.js";
import {
  ExceptionInputError,
  HEALTH_TRAINING_TASK_ID,
  readStoredExceptions,
  releaseSourceOnlyException,
  saveCanonicalStaffException,
  saveSourceOnlyException,
} from "../../server/healthMandatoryTrainingExceptions.js";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "../../server/lib/firebaseAdmin.js";
import { getAssignmentId, getBearerToken, readJsonBody, readStaffDirectory, sendCors, verifyDirectoryAdmin } from "../../server/lib/staffDirectory.js";
import { handleTrainingResource } from "../../server/lib/trainingCenterApi.js";
import { handlePortalRoadmapResource } from "../../server/lib/portalRoadmapApi.js";
import { handlePortalCmsResource } from "../../server/lib/portalContentCmsApi.js";
import { TRAINING_PHASE2_RESOURCES } from "../../server/lib/trainingCenterPhase2Resources.js";

const STAFF_ROLES = ["staff", "homeroom", "health_teacher", "admin"];

function isPermissionError(error) {
  const status = error?.response?.status || error?.code || error?.status;
  return status === 403 || status === 404;
}

function hasStaffAccess(assignment) {
  const roles = Array.isArray(assignment?.roles) ? assignment.roles : [];
  return assignment?.active === true && roles.some((role) => STAFF_ROLES.includes(role));
}

function normalizeDisplayNameOverride(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function safeIdentity(directoryItem, assignment, displayNameOverride = "") {
  const name = displayNameOverride || directoryItem?.name || "";
  const department = directoryItem?.department || assignment?.department || "";

  if (!name || !department) return null;

  return {
    staffId: assignment.staffId,
    name,
    department,
    position: directoryItem?.position || "",
  };
}

async function handleStaffIdentity(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });

  const idToken = getBearerToken(req);
  if (!idToken) return res.status(401).json({ ok: false, message: "로그인이 필요합니다." });

  const decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
  const db = getFirebaseAdminDb();
  const assignmentSnapshot = await db.collection("user_assignments").doc(getAssignmentId(decodedToken.uid)).get();

  if (!assignmentSnapshot.exists) {
    return res.status(403).json({ ok: false, message: "현재 학기 교직원 정보가 등록되지 않았습니다." });
  }

  const assignment = assignmentSnapshot.data();
  if (!hasStaffAccess(assignment)) {
    return res.status(403).json({ ok: false, message: "현재 학기 교직원 이용 권한이 없습니다." });
  }

  if (!assignment.staffId) {
    return res.status(409).json({
      ok: false,
      code: "missing-staff-id",
      message: "교직원 정보가 연결되지 않아 신청할 수 없습니다. 관리자에게 문의해 주세요.",
    });
  }

  const { directory } = await readStaffDirectory();
  const directoryItem = directory.find((item) => item.staffId === assignment.staffId);
  const userSnapshot = await db.collection("users").doc(decodedToken.uid).get();
  const identity = safeIdentity(directoryItem, assignment, normalizeDisplayNameOverride(userSnapshot.data()?.displayNameOverride));

  if (!identity) {
    return res.status(409).json({
      ok: false,
      code: "missing-directory-identity",
      message: "교직원명단에서 신청자 정보를 확인할 수 없습니다. 관리자에게 문의해 주세요.",
    });
  }

  return res.status(200).json({ ok: true, identity });
}

export async function staffDirectoryHandler(req, res, { trainingHandler = handleTrainingResource, trainingPhase2Handler = null } = {}) {
  sendCors(res, "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });

  try {
    if (req.query?.resource === "staff-identity") {
      return await handleStaffIdentity(req, res);
    }

    if (req.query?.resource === "portal-roadmap") {
      return await handlePortalRoadmapResource(req, res);
    }

    if (req.query?.resource === "portal-cms") {
      return await handlePortalCmsResource(req, res);
    }

    if (["training-list", "training-detail"].includes(req.query?.resource)) {
      return await trainingHandler(req, res);
    }

    if (TRAINING_PHASE2_RESOURCES.has(req.query?.resource)) {
      const handler = trainingPhase2Handler || (await import("../../server/lib/trainingCenterPhase2Api.js")).handleTrainingPhase2Resource;
      return await handler(req, res);
    }

    const access = await verifyDirectoryAdmin(req);
    if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

    if (req.query?.resource === "health-mandatory-training-exceptions") {
      if (req.method === "GET") {
        const records = await readStoredExceptions(access.db);
        return res.status(200).json({
          ok: true,
          items: records.filter((item) => item.taskId === HEALTH_TRAINING_TASK_ID).map((item) => ({
            id: item.id,
            year: item.year,
            sourceName: item.sourceName,
            sourcePosition: item.sourceTitle,
            reason: item.exceptionReason,
            identityType: item.identityType,
            confirmationStatus: item.confirmationStatus,
            note: item.note || "",
            active: item.active !== false,
            staffId: item.staffId || null,
          })),
        });
      }
      const body = await readJsonBody(req, { maxBytes: 4096 });
      try {
        if (body.action === "release") {
          const result = await releaseSourceOnlyException({ db: access.db, id: body.id, actorUid: access.decodedToken.uid });
          return res.status(200).json({ ok: true, ...result });
        }
        if (body.action === "add") {
          const { source, directory } = await getResearchTrainingSummary({ db: access.db });
          const result = body.identityType === "canonical_staff"
            ? await saveCanonicalStaffException({ db: access.db, candidate: body, directory, actorUid: access.decodedToken.uid })
            : await saveSourceOnlyException({ db: access.db, candidate: body, sourceRows: source.rows, directory, actorUid: access.decodedToken.uid });
          return res.status(200).json({ ok: true, ...result });
        }
        return res.status(400).json({ ok: false, message: "지원하지 않는 예외 작업입니다." });
      } catch (error) {
        if (error instanceof ExceptionInputError) return res.status(409).json({ ok: false, message: error.message });
        throw error;
      }
    }

    if (req.query?.resource === "health-mandatory-training-sync") {
      if (req.method === "POST") {
        const body = await readJsonBody(req);
        if (body?.apply !== true) return res.status(400).json({ ok: false, message: "반영 요청 형식이 올바르지 않습니다." });
        const result = await applyHealthMandatoryTrainingSnapshot({ db: access.db });
        return res.status(200).json(result);
      }

      const summary = await runHealthMandatoryTrainingDryRun({ db: access.db });
      return res.status(200).json(summary);
    }

    if (req.query?.resource === "health-mandatory-training-current-targets") {
      if (req.method !== "GET") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
      const result = await getHealthMandatoryTrainingCurrentTargets({ db: access.db });
      return res.status(200).json({ ok: true, ...result });
    }
    if (req.method !== "GET") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });

    const { directory, stats } = await readStaffDirectory();
    return res.status(200).json({ ok: true, directory, stats });
  } catch (error) {
    if (req.query?.resource === "health-mandatory-training-exceptions") {
      return res.status(500).json({ ok: false, message: "법정의무연수 예외 목록을 처리하지 못했습니다." });
    }
    if (req.query?.resource === "health-mandatory-training-sync") {
      if (isPermissionError(error)) {
        return res.status(403).json({ ok: false, message: "연구부 연수 시트를 읽을 권한이 없습니다." });
      }
      if (req.method === "POST") {
        return res.status(500).json({ ok: false, message: "연수 현황을 새로고침하지 못했습니다. 기존 현황은 유지됩니다." });
      }
      return res.status(500).json({ ok: false, message: "연구부 연수 시트 dry-run을 완료하지 못했습니다." });
    }
    if (req.query?.resource === "health-mandatory-training-current-targets") {
      if (isPermissionError(error)) {
        return res.status(403).json({ ok: false, message: "법정의무연수 현재 대상을 확인할 권한이 없습니다." });
      }
      return res.status(500).json({ ok: false, message: "법정의무연수 현재 대상을 확인하지 못했습니다." });
    }
    return res.status(500).json({ ok: false, message: "교직원명단을 불러오지 못했습니다." });
  }
}

export default staffDirectoryHandler;
