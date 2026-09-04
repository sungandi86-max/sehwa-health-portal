import { auth } from "./firebase.js";

const RESEARCH_TRAINING_SYNC_API = "/api/firebase/staff-directory?resource=health-mandatory-training-sync";
const RESEARCH_TRAINING_DRY_RUN_API = `${RESEARCH_TRAINING_SYNC_API}&dryRun=1`;

async function getIdToken() {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("로그인이 필요합니다.");
  return currentUser.getIdToken();
}

export async function checkResearchTrainingDryRun() {
  return requestResearchTrainingSync({ method: "GET" });
}

export async function applyResearchTrainingSnapshot() {
  return requestResearchTrainingSync({
    url: RESEARCH_TRAINING_SYNC_API,
    method: "POST",
    body: JSON.stringify({ apply: true }),
  });
}

async function requestResearchTrainingSync(options) {
  const idToken = await getIdToken();
  const response = await fetch(options.url || RESEARCH_TRAINING_DRY_RUN_API, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: options.body,
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || result?.ok !== true) {
    const error = new Error(result?.message || "연수 현황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    error.status = response.status;
    throw error;
  }

  return result;
}
