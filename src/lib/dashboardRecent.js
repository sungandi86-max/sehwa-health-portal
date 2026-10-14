export const RECENT_DISPLAY_LIMIT = 5;
export const RECENT_SCAN_LIMIT = 20;

export function selectActionableRecentItems(items = []) {
  return [...items]
    .sort((left, right) => right.submittedAtMillis - left.submittedAtMillis)
    .filter((item) => item.status !== "completed")
    .slice(0, RECENT_DISPLAY_LIMIT);
}
