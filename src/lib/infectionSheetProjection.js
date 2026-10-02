const PROJECTION_API_PATH = "/api/health-room-status";

export async function projectInfectionCaseBestEffort(user, docId) {
  if (!user?.getIdToken || !docId) return false;

  try {
    const token = await user.getIdToken();
    const response = await fetch(PROJECTION_API_PATH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "projectInfectionCase", docId }),
    });
    if (!response.ok) throw new Error(`projection-http-${response.status}`);
    return true;
  } catch (error) {
    console.warn("[infection-sheet-projection] sync deferred", {
      reason: error?.message || "unknown",
    });
    return false;
  }
}
