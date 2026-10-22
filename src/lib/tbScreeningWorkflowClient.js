import { joinTbScreeningWorkflow, validatedSchoolYear } from "./tbScreeningWorkflowModel.js";

export function mergeTbWorkflowPages(previous, next) {
  if (!previous) return next;
  const merge = (beforeItem, afterItem) => {
    const before = beforeItem?.workflow;
    const after = afterItem.workflow;
    if (!before || !after) return afterItem;
    const evidence = new Map([...before.evidence, ...after.evidence]
      .filter((entry) => entry.staffId === afterItem.staffId && entry.schoolYear === afterItem.schoolYear)
      .map((entry) => [entry.submissionId, entry]));
    const status = (before.status?.revision || 0) > (after.status?.revision || 0)
      ? before.status : after.status || before.status;
    return {
      ...afterItem,
      workflow: joinTbScreeningWorkflow({
        staffId: afterItem.staffId,
        schoolYear: afterItem.schoolYear,
        route: after.route || before.route,
        evidence: [...evidence.values()],
        status,
        evidenceComplete: next.datasets?.completeness?.evidence !== false,
      }),
    };
  };
  if (next.item) return { ...next, item: merge(previous.item, next.item) };
  const rows = new Map((previous.items || []).map((item) => [item.staffId, item]));
  for (const item of next.items || []) rows.set(item.staffId, merge(rows.get(item.staffId), item));
  return { ...next, items: [...rows.values()] };
}

async function request({ schoolYear, scope = "self", signal, body, evidenceCursor, statusCursor }) {
  const year = validatedSchoolYear(schoolYear);
  const { auth } = await import("./firebase.js");
  if (!auth.currentUser) throw Object.assign(new Error("로그인 후 이용해주세요."), { status: 401 });
  const token = await auth.currentUser.getIdToken();
  const query = new URLSearchParams({ resource: "tb-screening-workflow", schoolYear: String(year), scope, limit: "100" });
  if (evidenceCursor) query.set("evidenceCursor", evidenceCursor);
  if (statusCursor) query.set("statusCursor", statusCursor);
  const response = await fetch(`/api/firebase/staff-directory?${query}`, {
    method: body ? "POST" : "GET",
    signal,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify({ ...body, schoolYear: year, scope }) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true) {
    const message = response.status === 409 ? "다른 확인이 저장되었습니다. 최신 내용을 다시 확인해주세요."
      : response.status === 403 ? "결핵검진 자료를 확인할 권한이 없습니다."
      : data?.message || "결핵검진 자료를 처리하지 못했습니다. 다시 시도해주세요.";
    throw Object.assign(new Error(message), { status: response.status });
  }
  return data;
}

export async function loadTbScreeningWorkflow(options) {
  let data = await request(options);
  const seen = new Set();
  while (Object.values(data.datasets?.completeness || {}).some((value) => value === false)) {
    const { evidence: evidenceCursor, statuses: statusCursor } = data.datasets.cursors || {};
    const key = JSON.stringify([evidenceCursor, statusCursor]);
    if ((!evidenceCursor && !statusCursor) || seen.has(key) || seen.size >= 100) {
      throw new Error("전체 확인자료 조회가 완료되지 않았습니다. 다시 시도해주세요.");
    }
    seen.add(key);
    const next = await request({ ...options, evidenceCursor, statusCursor });
    const wrap = (page) => ({ ...page, item: { staffId: page.item.staffId, schoolYear: page.item.schoolYear, workflow: page.item } });
    const merged = mergeTbWorkflowPages(wrap(data), wrap(next));
    data = { ...merged, item: merged.item.workflow };
  }
  return data;
}

export function reviewTbScreeningEvidence({ staffId, schoolYear, submissionId, expectedRevision, action = "confirm" }) {
  if (!["confirm", "invalidate"].includes(action)) throw new Error("지원하지 않는 확인 작업입니다.");
  return request({ schoolYear, scope: "admin", body: { staffId, submissionId, expectedRevision, action } });
}

export function tbEvidenceLabel(workflow) {
  if (!workflow || workflow.evidenceComplete === false) return "조회 미완료 · 자료 유무 확인 필요";
  if (!workflow.evidence?.length) return "접수 자료 없음";
  const valid = workflow.evidence.filter((item) => item.reviewState !== "invalid" && item.status !== "rejected");
  return valid.length ? `${valid.length}건 접수 · ${workflow.completed ? "관리자 확인 완료" : "관리자 확인 필요"}` : "보완 필요";
}
