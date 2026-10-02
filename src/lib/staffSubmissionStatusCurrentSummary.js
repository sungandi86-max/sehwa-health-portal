const HEALTH_MANDATORY_TRAINING_TASK_ID = "health-mandatory-training-2026";

export function reconcileCurrentTaskStatusItems({ taskId, items, currentTargetStaffIds }) {
  if (taskId !== HEALTH_MANDATORY_TRAINING_TASK_ID) {
    return { items, preservedOrphans: 0 };
  }

  if (!Array.isArray(currentTargetStaffIds)) {
    throw new Error("법정의무연수 현재 대상을 확인할 수 없습니다.");
  }

  const currentTargetStaffIdSet = new Set(currentTargetStaffIds);
  const currentItems = items.filter((item) => currentTargetStaffIdSet.has(item.staffId));

  return {
    items: currentItems,
    preservedOrphans: items.length - currentItems.length,
  };
}
