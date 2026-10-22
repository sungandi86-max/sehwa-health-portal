const pending = new Map();
export async function receiptRequest(payload, uid) {
  const bytes = new TextEncoder().encode(JSON.stringify([uid, payload.type, payload.schoolYear || "", payload.fields, payload.action || "", payload.subjectStaffId || "", payload.proxyNote || "", payload.requestId || "", payload.fileMimeType, payload.fileBase64]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const key = `staff-receipt:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  let value = pending.get(key);
  if (!value) {
    try { const stored = JSON.parse(sessionStorage.getItem(key)); if (stored && typeof stored.requestId === "string") value = stored; } catch {}
    value ||= { requestId: payload.requestId || crypto.randomUUID() };
  }
  const save = () => { pending.set(key, value); try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} };
  save();
  return { ...value, observe(result) {
    if (result.submissionId) { value.resumeReceiptId = result.submissionId; save(); }
    if (result.recoveryToken) { value.recoveryToken = result.recoveryToken; save(); }
    if (result.receiptSaved === true && result.statusSynced === true) {
      pending.delete(key); try { sessionStorage.removeItem(key); } catch {}
    }
  } };
}
export function staffReceiptMessage(result, title = "제출") {
  if (result.receiptSaved !== true) return "접수가 확인되지 않았습니다. 같은 요청으로 다시 확인해 주세요.";
  const text = result.syncPending ? "접수는 완료됐으나 현황 반영 대기 중입니다. 파일을 다시 선택하지 않고 같은 제출로 확인할 수 있습니다."
    : result.receiptState === "completed" ? "관리자 확인이 완료된 접수입니다."
    : ["rejected", "invalid", "invalidated"].includes(result.receiptState) ? "반려 또는 무효 처리된 접수입니다. 새 제출이 필요하면 별도로 제출해 주세요."
    : `${title}이 접수되었습니다. 관리자 확인 후 현황에 반영됩니다.`;
  return `${text} 접수번호: ${result.id}`;
}
