import { createHash, createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";

export function buildSubmissionProxyEnvelope(payload, secret, { now = Date.now(), requestId = randomUUID(), visitor = "" } = {}) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) return null;
  const payloadJson = JSON.stringify(payload);
  const payloadHash = createHash("sha256").update(payloadJson, "utf8").digest("base64url");
  const sentAt = Math.trunc(now);
  const message = `v1\n${sentAt}\n${requestId}\n${visitor}\n${payloadHash}`;
  const signature = createHmac("sha256", secret).update(message, "utf8").digest("base64url");
  return { version: 1, sentAt, requestId, visitor, payloadJson, payloadHash, signature };
}

export function submissionVisitor(req, secret, { trustedVercel = false } = {}) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) return "";
  const raw = trustedVercel ? req.headers?.["x-vercel-forwarded-for"] : req.headers?.["x-forwarded-for"];
  const ip = typeof raw === "string" ? raw.trim() : "";
  if (trustedVercel && (!isIP(ip) || ip.includes(","))) return "";
  return ip ? createHmac("sha256", secret).update(`submission-visitor:${ip}`, "utf8").digest("base64url") : "";
}

export function studentSubmissionIdentity(payload, secret, environment) {
  if (!["qa", "production"].includes(environment)) return null;
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) return null;
  const studentIdentity = Object.fromEntries(["grade", "classNumber", "studentNumber", "studentName"]
    .map((key) => [key, String(payload.fields?.[key] ?? "").normalize("NFKC").trim()]));
  const evidence = Buffer.from(String(payload.fileBase64 || ""), "base64");
  const evidenceSha256 = createHash("sha256").update(evidence).digest("hex");
  const fingerprint = createHmac("sha256", secret)
    .update(`${environment}-student-submission-v2:${JSON.stringify({ type: "student_tb_reply", studentIdentity,
      fileMimeType: String(payload.fileMimeType || "").toLowerCase(), fileSize: evidence.length, evidenceSha256 })}`,
    "utf8").digest("hex");
  return { submissionId: `${environment === "qa" ? "QA" : "PROD"}-STUDENT-TB-${fingerprint.slice(0, 32)}`,
    requestFingerprint: fingerprint,
    evidenceSha256, idempotencyVersion: 2 };
}

export function qaStudentSubmissionIdentity(payload, secret) {
  return studentSubmissionIdentity(payload, secret, "qa");
}
