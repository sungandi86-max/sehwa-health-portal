// Derived state only; source submissions and attendance remain authoritative.
export function mergeCprProjection(current = {}, incoming, { replaceGroup = false } = {}) {
  const completed = current.status === "completed";
  const group = completed && current.training?.completionMethod === "group";
  if (group && incoming.training?.completionMethod !== "group" && !replaceGroup) return current;
  // A later pending/rejected submission cannot revoke a different valid receipt.
  if (!replaceGroup && completed && current.training?.completionMethod === "individual" && incoming.status !== "completed" &&
      (!current.evidenceSubmissionId || current.evidenceSubmissionId !== incoming.evidenceSubmissionId)) return current;
  return { ...current, ...incoming };
}
export function isCprEvent(event) {
  if (event?.completionTaskId !== undefined && event.completionTaskId !== "") return event.completionTaskId === "cpr-training-2026";
  return /(?:심폐소생술|\bCPR\b)/i.test(String(event?.["교육명"] || event?.title || "").normalize("NFKC").trim());
}
