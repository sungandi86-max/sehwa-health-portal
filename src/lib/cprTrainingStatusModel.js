export const CPR_TRAINING_TASK_ID = "cpr-training-2026";

export const CPR_METHOD_LABELS = {
  group: "학교 단체교육",
  individual: "외부·개별 이수",
  none: "미이수",
  unknown: "확인 필요",
};

function text(value) {
  return String(value || "").trim();
}

export function normalizeCprTraining(value) {
  const method = ["group", "individual", "none", "unknown"].includes(value?.completionMethod)
    ? value.completionMethod : "unknown";
  return {
    completionMethod: method,
    completionDate: text(value?.completionDate),
    eventId: text(value?.eventId),
    evidenceStatus: text(value?.evidenceStatus),
    note: text(value?.note),
  };
}

export function buildCprCurrentStaffItems(directoryItems, statusItems) {
  const byStaffId = new Map(statusItems.map((item) => [item.staffId, item]));
  return directoryItems.map((staff) => {
    const existing = byStaffId.get(staff.staffId);
    const excluded = ["휴직", "퇴직"].includes(staff.employmentStatus) || staff.target === "FALSE";
    return {
      ...(existing || {}),
      id: existing?.id || `${staff.staffId}_${CPR_TRAINING_TASK_ID}`,
      staffId: staff.staffId,
      taskId: CPR_TRAINING_TASK_ID,
      status: excluded ? "not_applicable" : existing?.status || "incomplete",
      training: normalizeCprTraining(existing?.training || { completionMethod: excluded ? "none" : "unknown" }),
    };
  });
}

export function buildCprAdminSummary(items) {
  return {
    target: items.filter((item) => item.status !== "not_applicable").length,
    completed: items.filter((item) => item.status === "completed").length,
    incomplete: items.filter((item) => item.status === "incomplete").length,
    group: items.filter((item) => item.status === "completed" && item.training?.completionMethod === "group").length,
    individual: items.filter((item) => item.status === "completed" && item.training?.completionMethod === "individual").length,
    needsCheck: items.filter((item) => ["pending", "unknown"].includes(item.status)).length,
    excluded: items.filter((item) => item.status === "not_applicable").length,
  };
}
