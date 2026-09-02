import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase.js";

const CPR_FOLDER_ID = "19foLN446v5ggGN6hxLBuH8tNAQuSXgtM";
const TB_FOLDER_ID = "1MfxNVL1muROzpi1ZbV7WDWr4SKMU7ghm";
const SUBMIT_API_URL = "/api/submit";
const ALLOWED_SUBMISSION_FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const DRIVE_UPLOAD_TIMEOUT_MS = 60_000;

function sanitizeFilename(filename) {
  return filename
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function todayString() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

async function postWithTimeout(payload) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), DRIVE_UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(SUBMIT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const json = await response.json();
    if (!response.ok || !(json?.status === "success" || json?.success === true || json?.ok === true)) {
      throw new Error(json?.message || "Drive 업로드에 실패했습니다.");
    }
    return json;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Drive 업로드 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.");
    }
    if (error instanceof Error) throw error;
    throw new Error("Drive 업로드 중 오류가 발생했습니다.");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getDriveReference(json, fileName, mimeType) {
  return {
    driveFileId: json?.fileId || json?.driveFileId || null,
    fileName,
    mimeType,
    driveUrl: json?.fileUrl || json?.fileLink || json?.driveUrl || null,
  };
}

export function validateSubmissionFile(file) {
  if (!file) return "제출할 파일을 선택해 주세요.";
  if (!ALLOWED_SUBMISSION_FILE_TYPES.has(file.type)) return "PDF, JPG, PNG 파일만 제출할 수 있습니다.";
  if (file.size > MAX_FILE_SIZE) return "파일 크기는 10MB 이하만 제출할 수 있습니다.";
  return "";
}

export const validateCprFile = validateSubmissionFile;

function getSubmitter(user) {
  if (!user?.uid || !user?.email) throw new Error("로그인 정보를 확인할 수 없습니다.");

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || "",
    name: user.displayName || user.email,
  };
}

async function uploadDriveSubmission({ type, sheetName, folderId, fields, fileName, file }) {
  const fileBase64 = await fileToBase64(file);
  return postWithTimeout({
    type,
    sheetName,
    folderId,
    fields,
    fileName,
    fileBase64,
    fileMimeType: file.type,
  });
}

async function saveStaffSubmission(submissionRef, submissionData) {
  try {
    await setDoc(submissionRef, {
      ...submissionData,
      status: "submitted",
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`파일은 Drive에 업로드되었지만 제출 기록 저장에 실패했습니다. ${error.message}`);
    }
    throw new Error("파일은 Drive에 업로드되었지만 제출 기록 저장에 실패했습니다.");
  }
}

export async function createCprSubmission({ user, trainingDate, institution, staffType, file }) {
  const fileError = validateSubmissionFile(file);
  if (fileError) throw new Error(fileError);

  const submissionRef = doc(db, "staff_submissions", crypto.randomUUID());
  const submitter = getSubmitter(user);
  const originalName = sanitizeFilename(file.name || "cpr-certificate.pdf");
  const fileName = sanitizeFilename(`${submitter.name}_심폐소생술이수증_${todayString()}_${originalName}`);
  const uploadResult = await uploadDriveSubmission({
    type: "cpr",
    sheetName: "응답_심폐소생술이수증",
    folderId: CPR_FOLDER_ID,
    fields: {
      name: submitter.name,
      dept: "Firebase v2 테스트",
      staffType: staffType || "",
      completionDate: trainingDate || "",
      institution: institution || "",
    },
    fileName,
    file,
  });
  const driveReference = getDriveReference(uploadResult, fileName, file.type);

  await saveStaffSubmission(submissionRef, {
    itemId: "cpr",
    submitter: {
      uid: submitter.uid,
      email: submitter.email,
      displayName: submitter.displayName,
    },
    trainingDate: trainingDate || null,
    institution: institution || null,
    staffType: staffType || null,
    file: driveReference,
  });

  return { id: submissionRef.id, file: driveReference };
}

export async function createTbSubmission({ user, checkupDate, documentType, staffType, file }) {
  const fileError = validateSubmissionFile(file);
  if (fileError) throw new Error(fileError);

  const submissionRef = doc(db, "staff_submissions", crypto.randomUUID());
  const submitter = getSubmitter(user);
  const originalName = sanitizeFilename(file.name || "tb-certificate.pdf");
  const fileName = sanitizeFilename(`${submitter.name}_결핵검진확인증_${todayString()}_${originalName}`);
  const uploadResult = await uploadDriveSubmission({
    type: "tb",
    sheetName: "응답_결핵검진확인증",
    folderId: TB_FOLDER_ID,
    fields: {
      name: submitter.name,
      dept: "Firebase v2 테스트",
      staffType: staffType || "",
      checkupDate: checkupDate || "",
      docType: documentType || "",
    },
    fileName,
    file,
  });
  const driveReference = getDriveReference(uploadResult, fileName, file.type);

  await saveStaffSubmission(submissionRef, {
    itemId: "tb",
    submitter: {
      uid: submitter.uid,
      email: submitter.email,
      displayName: submitter.displayName,
    },
    checkupDate: checkupDate || null,
    documentType: documentType || null,
    staffType: staffType || null,
    file: driveReference,
  });

  return { id: submissionRef.id, file: driveReference };
}
