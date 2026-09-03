import { useEffect, useState } from "react";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { ACCESS_REQUEST_STAFF_TYPES, normalizeAccessRequestApplicant } from "../lib/accessRequestApplicant.js";
import { getCurrentAccessRequest, submitStaffAccessRequest } from "../lib/accessRequests.js";
import { getAuthProvider } from "../lib/firebaseAuth.js";

function getRequestMessage(request) {
  if (!request) return "";
  if (request.status === "pending") return "권한 신청이 접수되어 있습니다. 보건실 승인 후 이용할 수 있습니다.";
  if (request.status === "approved") return "권한 신청은 승인되었지만 현재 권한 문서가 확인되지 않습니다. 보건실에 문의해 주세요.";
  if (request.status === "rejected") return "이전 권한 신청이 거절되었습니다. 필요한 경우 다시 신청할 수 있습니다.";
  return "";
}

export default function FirebaseAccessRequestAction({ user, onSubmitted }) {
  const [request, setRequest] = useState(null);
  const [state, setState] = useState({ status: "loading", message: "" });
  const [applicant, setApplicant] = useState({ realName: "", department: "", staffType: "교사" });
  const isGoogleUser = getAuthProvider(user) === "google";

  useEffect(() => {
    let shouldIgnore = false;

    async function loadRequest() {
      if (!user?.uid || !isGoogleUser) {
        setState({ status: "idle", message: "" });
        return;
      }

      setState({ status: "loading", message: "" });
      try {
        const currentRequest = await getCurrentAccessRequest(user.uid, CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER);
        if (shouldIgnore) return;
        setRequest(currentRequest);
        setState({ status: "ready", message: getRequestMessage(currentRequest) });
      } catch (error) {
        if (shouldIgnore) return;
        setState({
          status: "error",
          message: error?.code === "permission-denied" ? "권한 신청 정보를 읽을 수 없습니다." : "권한 신청 상태를 확인하지 못했습니다.",
        });
      }
    }

    loadRequest();

    return () => {
      shouldIgnore = true;
    };
  }, [isGoogleUser, user]);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setApplicant((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalized = normalizeAccessRequestApplicant(applicant);
    if (!normalized.applicant) {
      setState({ status: "error", message: normalized.message });
      return;
    }

    setState({ status: "submitting", message: "권한 신청을 접수하는 중입니다." });
    try {
      const result = await submitStaffAccessRequest(user, CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER, normalized.applicant);
      const nextRequest = await getCurrentAccessRequest(user.uid, CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER);
      setRequest(nextRequest);
      setState({
        status: "ready",
        message:
          result.status === "already-pending"
            ? "권한 신청이 접수되어 있습니다."
            : "이용 권한 신청이 접수되었습니다.",
      });
      onSubmitted?.();
    } catch (error) {
      setState({
        status: "error",
        message: error?.code === "permission-denied" ? "권한 신청을 저장할 수 없습니다." : "권한 신청 중 문제가 발생했습니다.",
      });
    }
  };

  if (!isGoogleUser) {
    return (
      <p className="mt-5 rounded-2xl bg-[#FFF7F7] px-4 py-3 text-sm font-black text-[#B42318]">
        기본 이용 권한을 설정하지 못했습니다. 보건실에 문의해 주세요.
      </p>
    );
  }

  const canSubmit = state.status !== "loading" && state.status !== "submitting" && request?.status !== "pending" && request?.status !== "approved";

  return (
    <form className="mt-6 space-y-3 text-left" onSubmit={handleSubmit}>
      {state.message && (
        <p className={`rounded-2xl px-4 py-3 text-sm font-black ${state.status === "error" ? "bg-[#FFF7F7] text-[#B42318]" : "bg-[#F0FBF7] text-[#08754B]"}`}>
          {state.message}
        </p>
      )}
      {canSubmit && (
        <div className="grid gap-3 rounded-[24px] border border-[#DDEAE7] bg-white/90 p-4">
          <label className="grid gap-2 text-sm font-black text-[#102047]">
            실명
            <input
              type="text"
              name="realName"
              value={applicant.realName}
              onChange={handleFieldChange}
              placeholder="예: 박숙현"
              autoComplete="name"
              className="min-h-12 rounded-2xl border border-[#DDEAE7] bg-[#F7FBF9] px-4 text-sm font-bold text-[#102047] outline-none transition focus:border-[#20A982] focus:ring-4 focus:ring-[#20A982]/15"
              required
            />
          </label>
          <label className="grid gap-2 text-sm font-black text-[#102047]">
            소속/부서
            <input
              type="text"
              name="department"
              value={applicant.department}
              onChange={handleFieldChange}
              placeholder="예: 보건실, 행정실"
              autoComplete="organization-title"
              className="min-h-12 rounded-2xl border border-[#DDEAE7] bg-[#F7FBF9] px-4 text-sm font-bold text-[#102047] outline-none transition focus:border-[#20A982] focus:ring-4 focus:ring-[#20A982]/15"
            />
          </label>
          <label className="grid gap-2 text-sm font-black text-[#102047]">
            교직원 구분
            <select
              name="staffType"
              value={applicant.staffType}
              onChange={handleFieldChange}
              className="min-h-12 rounded-2xl border border-[#DDEAE7] bg-[#F7FBF9] px-4 text-sm font-bold text-[#102047] outline-none transition focus:border-[#20A982] focus:ring-4 focus:ring-[#20A982]/15"
            >
              {ACCESS_REQUEST_STAFF_TYPES.map((staffType) => (
                <option key={staffType} value={staffType}>
                  {staffType}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <button
        type="submit"
        disabled={!canSubmit}
        className="min-h-12 rounded-2xl bg-[#20A982] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(32,169,130,0.18)] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state.status === "submitting" ? "신청 중..." : "이용 권한 신청"}
      </button>
    </form>
  );
}
