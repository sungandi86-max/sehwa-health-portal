import { createHash, createHmac, randomUUID } from "node:crypto";

export function buildSubmissionProxyEnvelope(payload, secret, { now = Date.now(), requestId = randomUUID(), visitor = "" } = {}) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) return null;
  const payloadJson = JSON.stringify(payload);
  const payloadHash = createHash("sha256").update(payloadJson, "utf8").digest("base64url");
  const sentAt = Math.trunc(now);
  const message = `v1\n${sentAt}\n${requestId}\n${visitor}\n${payloadHash}`;
  const signature = createHmac("sha256", secret).update(message, "utf8").digest("base64url");
  return { version: 1, sentAt, requestId, visitor, payloadJson, payloadHash, signature };
}

export function submissionVisitor(req, secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) return "";
  const ip = String(req.headers?.["x-forwarded-for"] || "").trim();
  return ip ? createHmac("sha256", secret).update(`submission-visitor:${ip}`, "utf8").digest("base64url") : "";
}
