import fetch from "node-fetch";
import { buildSubmissionProxyEnvelope } from "./submissionProxyEnvelope.js";
import { trainingEnvironment } from "./trainingDeployment.js";
import { submissionScriptUrl } from "./submissionScriptUrl.js";

export async function verifyQaTbScriptEvidence(fileId, { context = process.env, postScript = fetch } = {}) {
  if (trainingEnvironment(context) !== "qa" || !/^[A-Za-z0-9_-]{1,200}$/.test(fileId || "")) return false;
  const folderId = context.QA_TB_CERTIFICATE_DRIVE_FOLDER_ID;
  const destination = submissionScriptUrl(context);
  if (!folderId || !destination || !context.SUBMISSION_PROXY_SECRET) return false;
  const signed = buildSubmissionProxyEnvelope({ type: "qa-tb-evidence-metadata", runtimeEnvironment: "qa",
    recordMode: "firestore", qaEvidenceFolderId: folderId, fileId }, context.SUBMISSION_PROXY_SECRET);
  if (!signed) return false;
  const response = await postScript(destination, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(signed) });
  if (!response.ok) return false;
  const result = await response.json();
  return result.status === "success" && result.verified === true && result.fileId === fileId
    && result.folderId === folderId && result.trashed === false && result.private === true;
}
