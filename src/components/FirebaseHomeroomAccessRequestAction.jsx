import { useEffect, useMemo, useState } from "react";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { getCurrentHomeroomAccessRequest, submitHomeroomAccessRequest } from "../lib/accessRequests.js";

const GRADE_OPTIONS = [1, 2, 3];
const CLASS_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);

function getStatusMessage(request) {
  if (!request) return "";
  if (request.status === "pending") {
    return "담임 권한 신청이 접수되었습니다. 보건실 승인 후 학급별 기능을 이용할 수 있습니다. 승인 후 화면을 새로고침하거나 다시 접속해주세요.";
  }
  if (request.status === "approved") {
    return "담임 권한이 승인되었습니다. 화면을 새로고침하거나 다시 접속하면 학급별 기능을 이용할 수 있습니다.";
  }
  if (request.status === "rejected") {
    return "담임 권한 신청이 승인되지 않았습니다. 필요 시 보건실로 문의해주세요.";
  }
  return "";
}

function normalizeText(value) {
  return String(value || "").trim();
}

export default function FirebaseHomeroomAccessRequestAction({ user, profile, assignment }) {
  const [request, setRequest] = useState(null);
  const [grade, setGrade] = useState("1");
  const [classNo, setClassNo] = useState("1");
  const [state, setState] = useState({ status: "loading", message: "" });

  const identityText = useMemo(() => {
    const displayName = normalizeText(user?.displayName || profile?.displayName) || "교직원";
    const position = normalizeText(assignment?.position) || "교직원";
    return `${displayName} · ${position}`;
  }, [assignment, profile, user]);

  useEffect(() => {
    let shouldIgnore = false;

    async function loadRequest() {
      if (!user?.uid) return;

      setState({ status: "loading", message: "" });
      try {
        const currentRequest = await getCurrentHomeroomAccessRequest(user.uid, CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER);
        if (shouldIgnore) return;
        setRequest(currentRequest);
        setState({ status: "ready", message: getStatusMessage(currentRequest) });
      } catch (error) {
        if (shouldIgnore) return;
        setState({
          status: "error",
          message: error?.message || "담임 권한 신청 상태를 확인하지 못했습니다.",
        });
      }
    }

    loadRequest();

    return () => {
      shouldIgnore = true;
    };
  }, [user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setState({ status: "submitting", message: "담임 권한 신청을 접수하는 중입니다." });

    try {
      const result = await submitHomeroomAccessRequest(user, CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER, {
        grade,
        classNo,
      });
      const nextRequest = await getCurrentHomeroomAccessRequest(user.uid, CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER);
      setRequest(nextRequest);
      setState({
        status: "ready",
        message:
          result.status === "already-pending"
            ? "담임 권한 신청이 접수되어 있습니다."
            : result.message || "담임 권한 신청이 접수되었습니다.",
      });
    } catch (error) {
      setState({
        status: "error",
        message: error?.message || "담임 권한 신청 중 문제가 발생했습니다.",
      });
    }
  };

  const canSubmit = state.status !== "loading" && state.status !== "submitting" && request?.status !== "pending" && request?.status !== "approved";

  return (
    <form className="mt-3 rounded-[10px] border border-[#C8D8FF] bg-white px-3 py-3 text-left" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#0D4EA6]">담임교사이신가요?</p>
          <p className="mt-1 text-xs font-normal leading-5 text-[#627083]">
            학급별 건강관리 기능을 이용하려면 담임 권한을 신청해주세요.
          </p>
        </div>
        <p className="shrink-0 text-[11px] font-medium text-[#627083]">{CURRENT_SCHOOL_YEAR}학년도 {CURRENT_SEMESTER}학기</p>
      </div>

      <div className="mt-3 rounded-[8px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2">
        <p className="text-[11px] font-medium text-[#627083]">신청자</p>
        <p className="mt-0.5 text-xs font-semibold text-[#102047]">{identityText}</p>
        {assignment?.staffId && <p className="mt-0.5 text-[11px] font-normal text-[#627083]">교직원ID {assignment.staffId}</p>}
      </div>

      {state.message && (
        <p className={`mt-3 rounded-[8px] px-3 py-2 text-xs font-semibold ${state.status === "error" ? "bg-[#FFF7F7] text-[#B42318]" : "bg-[#EEF4FF] text-[#3154A3]"}`}>
          {state.message}
        </p>
      )}

      {canSubmit && (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-[#102047]">
              학년
              <select
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                className="min-h-10 rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-xs font-medium text-[#102047] outline-none transition focus:border-[#0D4EA6] focus:ring-4 focus:ring-[#0D4EA6]/10"
                required
              >
                {GRADE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}학년
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-[#102047]">
              반
              <select
                value={classNo}
                onChange={(event) => setClassNo(event.target.value)}
                className="min-h-10 rounded-[9px] border border-[#DDEAE7] bg-white px-3 text-xs font-medium text-[#102047] outline-none transition focus:border-[#0D4EA6] focus:ring-4 focus:ring-[#0D4EA6]/10"
                required
              >
                {CLASS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}반
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={state.status === "submitting"}
            className="mt-3 min-h-10 rounded-[9px] bg-[#0D4EA6] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#183B8F] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.status === "submitting" ? "신청 중..." : "담임 권한 신청"}
          </button>
        </>
      )}
    </form>
  );
}
