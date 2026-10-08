export const TB_SCREENING_TYPE_LABELS = {
  group: "학교 단체검진",
  individual: "개별검진",
  national: "공단검진",
  none: "미신청",
  unknown: "확인 필요",
};

export const TB_TARGET_STATUS_LABELS = {
  target: "올해 검진 대상",
  excluded: "제외",
  unknown: "대상 여부 확인 필요",
};

export const TB_LATENT_STATUS_LABELS = {
  completed: "완료",
  required: "검진 필요",
  not_required: "해당 없음",
  unknown: "확인 필요",
};

const TB_STATUS_VALUES = new Set(["incomplete", "pending", "unknown", "completed", "not_applicable"]);

export function getTbAdminUpdate(value = {}) {
  if (!TB_TARGET_STATUS_LABELS[value.targetStatus]) throw new Error("결핵검진 대상 상태를 확인해 주세요.");
  if (!TB_LATENT_STATUS_LABELS[value.latentStatus]) throw new Error("잠복결핵검진 상태를 확인해 주세요.");
  if (!TB_SCREENING_TYPE_LABELS[value.screeningType]) throw new Error("결핵검진 유형을 확인해 주세요.");
  if (!TB_STATUS_VALUES.has(value.status)) throw new Error("결핵검진 완료 상태를 확인해 주세요.");
  const screeningDate = String(value.screeningDate || "").trim();
  if (screeningDate && !/^\d{4}-\d{2}-\d{2}$/.test(screeningDate)) throw new Error("검진일 형식을 확인해 주세요.");
  return {
    status: value.status,
    screening: {
      targetStatus: value.targetStatus,
      latentStatus: value.latentStatus,
      screeningType: value.screeningType,
      completed: value.status === "completed",
      screeningDate,
      note: String(value.note || "").trim().slice(0, 200),
      registrationStatus: String(value.registrationStatus || "admin_updated").trim().slice(0, 40),
    },
  };
}

export function normalizeTbScreening(value = {}) {
  return {
    targetStatus: TB_TARGET_STATUS_LABELS[value.targetStatus] ? value.targetStatus : "unknown",
    latentStatus: TB_LATENT_STATUS_LABELS[value.latentStatus] ? value.latentStatus : "unknown",
    screeningType: TB_SCREENING_TYPE_LABELS[value.screeningType] ? value.screeningType : "unknown",
    completed: value.completed === true,
    screeningDate: String(value.screeningDate || "").trim(),
    note: String(value.note || "").trim(),
    registrationStatus: String(value.registrationStatus || "none").trim() || "none",
  };
}

export function buildTbCurrentStaffItems(directoryItems, statusItems) {
  const statusByStaffId = new Map(statusItems.map((item) => [item.staffId, item]));
  return directoryItems.map((directoryItem) => {
    const statusItem = statusByStaffId.get(directoryItem.staffId);
    const target = String(directoryItem.target || "").trim().toUpperCase();
    const excluded = ["휴직", "퇴직"].includes(directoryItem.employmentStatus)
      || ["FALSE", "N", "NO", "0", "제외", "미대상"].includes(target);
    return {
      ...directoryItem,
      ...(statusItem || {}),
      staffId: directoryItem.staffId,
      status: excluded ? "not_applicable" : statusItem?.status || "unknown",
      screening: normalizeTbScreening(excluded
        ? { ...(statusItem?.screening || {}), targetStatus: "excluded" }
        : statusItem?.screening),
    };
  });
}

export function buildTbAdminSummary(items) {
  const active = items.filter((item) => item.screening.targetStatus !== "excluded" && item.status !== "not_applicable");
  return {
    total: active.length,
    completed: active.filter((item) => item.status === "completed").length,
    incomplete: active.filter((item) => item.status !== "completed").length,
    group: active.filter((item) => item.screening.screeningType === "group").length,
    individual: active.filter((item) => item.screening.screeningType === "individual").length,
    national: active.filter((item) => item.screening.screeningType === "national").length,
    unregistered: active.filter((item) => ["none", "unknown"].includes(item.screening.screeningType)).length,
    excluded: items.length - active.length,
  };
}
