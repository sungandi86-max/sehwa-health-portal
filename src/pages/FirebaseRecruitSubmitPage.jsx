import { useEffect, useState } from "react";
import FirebaseStaffSubmissionAccessGate from "../components/FirebaseStaffSubmissionAccessGate.jsx";
import { FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { createRecruitSubmission, validateRecruitRequest } from "../lib/staffSubmissions.js";
import { getSubmissionItem } from "../lib/submissionItems.js";

const DEFAULT_ITEM = {
  title: "채용검진 대체 인정 확인 요청",
  description: "채용검진 서류를 이미 행정실에 제출하신 경우 보건실에 대체 인정 확인을 요청합니다.",
  target: "채용검진으로 결핵검진 대체 인정 확인이 필요한 교직원",
  documentType: "파일 제출 없음",
  deadlineLabel: "상시",
  guideText: "보건실에서는 흉부 X-ray 검진일자 확인만 필요합니다. 채용검진 결과지 전체는 받지 않습니다.",
  buttonLabel: "확인 요청하기",
  status: "접수 중",
};

const STAFF_TYPES = ["교사", "직원", "기타"];

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-[#102047]">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

export default function FirebaseRecruitSubmitPage() {
  const [item, setItem] = useState(DEFAULT_ITEM);
  const [staffType, setStaffType] = useState("");
  const [submittedToAdminOffice, setSubmittedToAdminOffice] = useState(false);
  const [xrayDateCheckAcknowledged, setXrayDateCheckAcknowledged] = useState(false);
  const [loadState, setLoadState] = useState({ status: "loading", message: "" });
  const [submitState, setSubmitState] = useState({ status: "idle", message: "" });

  useEffect(() => {
    let shouldIgnore = false;

    async function loadItem() {
      setLoadState({ status: "loading", message: "" });
      try {
        const recruitItem = await getSubmissionItem("recruit");
        if (shouldIgnore) return;
        setItem(recruitItem || DEFAULT_ITEM);
        setLoadState({ status: recruitItem ? "success" : "empty", message: "" });
      } catch (error) {
        if (shouldIgnore) return;
        setLoadState({
          status: error?.code === "permission-denied" ? "permission-denied" : "error",
          message:
            error?.code === "permission-denied"
              ? "제출 항목 정보를 읽을 수 없습니다. Firestore 보안 규칙을 확인해 주세요."
              : "제출 항목 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        });
      }
    }

    loadItem();
    return () => {
      shouldIgnore = true;
    };
  }, []);

  const handleSubmit = async (event, user) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const requestError = validateRecruitRequest({
      staffType,
      submittedToAdminOffice,
      xrayDateCheckAcknowledged,
    });

    if (requestError) {
      setSubmitState({ status: "error", message: requestError });
      return;
    }

    setSubmitState({ status: "submitting", message: "제출 중..." });
    try {
      const result = await createRecruitSubmission({
        user,
        staffType,
        submittedToAdminOffice,
        xrayDateCheckAcknowledged,
      });
      setStaffType("");
      setSubmittedToAdminOffice(false);
      setXrayDateCheckAcknowledged(false);
      formElement.reset();
      setSubmitState({
        status: "success",
        message: `확인 요청이 접수되었습니다. 접수번호: ${result.id}`,
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error instanceof Error ? error.message : "제출 중 오류가 발생했습니다.",
      });
    }
  };

  const isSubmitDisabled =
    submitState.status === "submitting" ||
    Boolean(validateRecruitRequest({ staffType, submittedToAdminOffice, xrayDateCheckAcknowledged }));

  return (
    <FirebaseStaffSubmissionAccessGate>
      {({ user, displayName }) => (
          <FirebaseV2PageShell
            label="제출"
            title="채용검진 대체 인정 확인 요청"
            description="파일 업로드 없이 행정실 제출 여부 확인을 요청합니다."
            displayName={displayName}
          >
          <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <aside className="rounded-[30px] border border-[#DDEAE7] bg-white/95 p-6 shadow-[0_18px_48px_rgba(16,32,71,0.07)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]">
                  {item.status || "접수 중"}
                </span>
                <span className="rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-black text-[#3154A3]">
                  {item.deadlineLabel || "상시"}
                </span>
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-[-0.02em] text-[#102047]">{item.title}</h2>
              <p className="mt-3 text-sm font-medium leading-6 text-[#627083]">{item.description}</p>
              <dl className="mt-5 space-y-3 rounded-[24px] bg-[#F7FBF9] p-4 text-sm text-[#627083]">
                <div>
                  <dt className="font-black text-[#102047]">대상</dt>
                  <dd className="mt-1 font-medium">{item.target || "-"}</dd>
                </div>
                <div>
                  <dt className="font-black text-[#102047]">제출자료</dt>
                  <dd className="mt-1 font-medium">{item.documentType || "-"}</dd>
                </div>
                <div>
                  <dt className="font-black text-[#102047]">안내</dt>
                  <dd className="mt-1 whitespace-pre-line font-medium">{item.guideText || "-"}</dd>
                </div>
              </dl>
              <p className="mt-5 rounded-[22px] bg-[#F0FBF7] p-4 text-sm font-bold leading-6 text-[#08754B]">
                채용검진 결과지 파일, 주민등록번호, 검진 결과 세부 내용은 입력하거나 업로드하지 않습니다.
              </p>
              {loadState.status === "permission-denied" || loadState.status === "error" ? (
                <p className="mt-4 rounded-2xl bg-[#FFF7F7] px-4 py-3 text-sm font-black text-[#B42318]">
                  {loadState.message}
                </p>
              ) : null}
            </aside>

            <form
              onSubmit={(event) => handleSubmit(event, user)}
              className="rounded-[30px] border border-[#DDEAE7] bg-white/95 p-6 shadow-[0_18px_48px_rgba(16,32,71,0.07)]"
            >
              <p className="rounded-2xl bg-[#F7FBF9] px-4 py-3 text-sm font-bold leading-6 text-[#627083]">
                요청자: <span className="text-[#102047]">{user.displayName || displayName}</span>
                {user.email ? <span> · {user.email}</span> : null}
              </p>

              <div className="mt-5 space-y-4">
                <Field label="교직원 구분">
                  <select
                    value={staffType}
                    onChange={(event) => setStaffType(event.target.value)}
                    className="min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/20"
                  >
                    <option value="">선택 안 함</option>
                    {STAFF_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </Field>

                <label className="flex gap-3 rounded-[22px] border border-[#DDEAE7] bg-[#F7FBF9] p-4 text-sm font-bold leading-6 text-[#102047]">
                  <input
                    type="checkbox"
                    checked={submittedToAdminOffice}
                    onChange={(event) => setSubmittedToAdminOffice(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-[#B8C9C4] text-[#20A982] focus:ring-[#20A982]/30"
                  />
                  <span>채용검진 서류를 행정실에 이미 제출했습니다.</span>
                </label>

                <label className="flex gap-3 rounded-[22px] border border-[#DDEAE7] bg-[#F7FBF9] p-4 text-sm font-bold leading-6 text-[#102047]">
                  <input
                    type="checkbox"
                    checked={xrayDateCheckAcknowledged}
                    onChange={(event) => setXrayDateCheckAcknowledged(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-[#B8C9C4] text-[#20A982] focus:ring-[#20A982]/30"
                  />
                  <span>보건실에서 흉부 X-ray 검진일자 확인이 필요한 점을 확인했습니다.</span>
                </label>
              </div>

              {submitState.message && (
                <p
                  className={`mt-4 rounded-2xl px-4 py-3 text-sm font-black ${
                    submitState.status === "success"
                      ? "bg-[#F0FBF7] text-[#08754B]"
                      : submitState.status === "submitting"
                      ? "bg-[#EEF4FF] text-[#3154A3]"
                      : "bg-[#FFF7F7] text-[#B42318]"
                  }`}
                >
                  {submitState.message}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="mt-5 min-h-12 w-full rounded-2xl bg-[#20A982] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(32,169,130,0.22)] transition hover:-translate-y-[1px] hover:bg-[#178C6C] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitState.status === "submitting" ? "제출 중..." : item.buttonLabel || "확인 요청하기"}
              </button>
            </form>
          </section>
        </FirebaseV2PageShell>
      )}
    </FirebaseStaffSubmissionAccessGate>
  );
}
