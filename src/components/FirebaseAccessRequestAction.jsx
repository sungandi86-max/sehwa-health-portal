import { useEffect, useState } from "react";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import {
  ACCESS_REQUEST_STAFF_TYPES,
  getAccessRequestDepartmentOptions,
  normalizeAccessRequestApplicant,
} from "../lib/accessRequestApplicant.js";
import { getCurrentAccessRequest, submitStaffAccessRequest } from "../lib/accessRequests.js";
import { getAuthProvider } from "../lib/firebaseAuth.js";

const HOMEROOM_GRADE_OPTIONS = [1, 2, 3];
const HOMEROOM_CLASS_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function getRequestMessage(request) {
  if (!request) return "";
  if (request.status === "pending" && request.isHomeroomRequested === true) {
    return "기본 이용 권한과 담임 권한 신청이 접수되었습니다. 보건실 승인 후 이용할 수 있습니다.";
  }
  if (request.status === "pending") return "권한 신청이 접수되어 있습니다. 보건실 승인 후 이용할 수 있습니다.";
  if (request.status === "approved") return "권한 신청은 승인되었지만 현재 권한 문서가 확인되지 않습니다. 보건실에 문의해 주세요.";
  if (request.status === "rejected") return "이전 권한 신청이 거절되었습니다. 필요한 경우 다시 신청할 수 있습니다.";
  return "";
}

function getInitialDepartment(staffType) {
  const options = getAccessRequestDepartmentOptions(staffType);
  return options.length === 1 ? options[0] : "";
}

export default function FirebaseAccessRequestAction({ user, onSubmitted }) {
  const [request, setRequest] = useState(null);
  const [state, setState] = useState({ status: "loading", message: "" });
  const [applicant, setApplicant] = useState({
    realName: "",
    department: getInitialDepartment("교사"),
    staffType: "교사",
  });
  const [homeroomRequest, setHomeroomRequest] = useState({
    isHomeroomRequested: false,
    requestedGrade: "1",
    requestedClassNo: "1",
  });
  const [usesCustomDepartment, setUsesCustomDepartment] = useState(false);
  const isGoogleUser = getAuthProvider(user) === "google";
  const departmentOptions = getAccessRequestDepartmentOptions(applicant.staffType);

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

  const handleStaffTypeChange = (event) => {
    const staffType = event.target.value;
    setUsesCustomDepartment(false);
    setApplicant((current) => ({
      ...current,
      staffType,
      department: getInitialDepartment(staffType),
    }));
  };

  const handleDepartmentSelectChange = (event) => {
    const value = event.target.value;
    if (value === "custom") {
      setUsesCustomDepartment(true);
      setApplicant((current) => ({ ...current, department: "" }));
      return;
    }

    setUsesCustomDepartment(false);
    setApplicant((current) => ({ ...current, department: value }));
  };

  const handleHomeroomChoiceChange = (event) => {
    setHomeroomRequest((current) => ({
      ...current,
      isHomeroomRequested: event.target.value === "yes",
    }));
  };

  const handleHomeroomFieldChange = (event) => {
    const { name, value } = event.target;
    setHomeroomRequest((current) => ({ ...current, [name]: value }));
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
      const result = await submitStaffAccessRequest({
        firebaseUser: user,
        schoolYear: CURRENT_SCHOOL_YEAR,
        semester: CURRENT_SEMESTER,
        applicantInput: normalized.applicant,
        homeroomInput: homeroomRequest,
      });
      const nextRequest = await getCurrentAccessRequest(user.uid, CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER);
      setRequest(nextRequest);
      setState({
        status: "ready",
        message: getRequestMessage(nextRequest) || (result.status === "already-pending" ? "권한 신청이 접수되어 있습니다." : "이용 권한 신청이 접수되었습니다."),
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
      <p className="mt-5 rounded-2xl bg-[#FFF7F7] px-4 py-3 text-sm font-semibold text-[#B42318]">
        기본 이용 권한을 설정하지 못했습니다. 보건실에 문의해 주세요.
      </p>
    );
  }

  const canSubmit = state.status !== "loading" && state.status !== "submitting" && request?.status !== "pending" && request?.status !== "approved";

  return (
    <form className="mt-6 space-y-3 text-left" onSubmit={handleSubmit}>
      {state.message && (
        <p className={`rounded-2xl px-4 py-3 text-sm font-semibold ${state.status === "error" ? "bg-[#FFF7F7] text-[#B42318]" : "bg-[#F0FBF7] text-[#08754B]"}`}>
          {state.message}
        </p>
      )}
      {canSubmit && (
        <div className="grid gap-3 rounded-[24px] border border-[#DDEAE7] bg-white/90 p-4">
          <label className="grid gap-2 text-sm font-semibold text-[#102047]">
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
          <label className="grid gap-2 text-sm font-semibold text-[#102047]">
            교직원 구분
            <select
              name="staffType"
              value={applicant.staffType}
              onChange={handleStaffTypeChange}
              className="min-h-12 rounded-2xl border border-[#DDEAE7] bg-[#F7FBF9] px-4 text-sm font-bold text-[#102047] outline-none transition focus:border-[#20A982] focus:ring-4 focus:ring-[#20A982]/15"
            >
              {ACCESS_REQUEST_STAFF_TYPES.map((staffType) => (
                <option key={staffType} value={staffType}>
                  {staffType}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#102047]">
            소속/부서
            <select
              value={usesCustomDepartment ? "custom" : applicant.department}
              onChange={handleDepartmentSelectChange}
              className="min-h-12 rounded-2xl border border-[#DDEAE7] bg-[#F7FBF9] px-4 text-sm font-bold text-[#102047] outline-none transition focus:border-[#20A982] focus:ring-4 focus:ring-[#20A982]/15"
              required
            >
              {departmentOptions.length !== 1 && <option value="">소속/부서 선택</option>}
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
              {applicant.staffType === "기타" && <option value="custom">직접입력</option>}
            </select>
          </label>
          {applicant.staffType === "기타" && usesCustomDepartment && (
            <label className="grid gap-2 text-sm font-semibold text-[#102047]">
              소속/부서 직접입력
              <input
                type="text"
                name="department"
                value={applicant.department}
                onChange={handleFieldChange}
                placeholder="소속 또는 역할을 입력해 주세요."
                autoComplete="organization-title"
                className="min-h-12 rounded-2xl border border-[#DDEAE7] bg-[#F7FBF9] px-4 text-sm font-bold text-[#102047] outline-none transition focus:border-[#20A982] focus:ring-4 focus:ring-[#20A982]/15"
                required
              />
            </label>
          )}
          <fieldset className="grid gap-3 rounded-2xl border border-[#DDEAE7] bg-[#F8FAFA] p-3">
            <legend className="px-1 text-sm font-semibold text-[#102047]">담임교사 여부</legend>
            <div className="grid gap-2 text-sm font-medium text-[#102047] sm:grid-cols-2">
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#DDEAE7] bg-white px-3">
                <input
                  type="radio"
                  name="isHomeroomRequested"
                  value="no"
                  checked={!homeroomRequest.isHomeroomRequested}
                  onChange={handleHomeroomChoiceChange}
                  className="h-4 w-4 accent-[#0D4EA6]"
                />
                아니오
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[#DDEAE7] bg-white px-3">
                <input
                  type="radio"
                  name="isHomeroomRequested"
                  value="yes"
                  checked={homeroomRequest.isHomeroomRequested}
                  onChange={handleHomeroomChoiceChange}
                  className="h-4 w-4 accent-[#0D4EA6]"
                />
                예
              </label>
            </div>
            {homeroomRequest.isHomeroomRequested && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-[#102047]">
                  학년
                  <select
                    name="requestedGrade"
                    value={homeroomRequest.requestedGrade}
                    onChange={handleHomeroomFieldChange}
                    className="min-h-12 rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] outline-none transition focus:border-[#0D4EA6] focus:ring-4 focus:ring-[#0D4EA6]/15"
                    required
                  >
                    {HOMEROOM_GRADE_OPTIONS.map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}학년
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-[#102047]">
                  반
                  <select
                    name="requestedClassNo"
                    value={homeroomRequest.requestedClassNo}
                    onChange={handleHomeroomFieldChange}
                    className="min-h-12 rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] outline-none transition focus:border-[#0D4EA6] focus:ring-4 focus:ring-[#0D4EA6]/15"
                    required
                  >
                    {HOMEROOM_CLASS_OPTIONS.map((classNo) => (
                      <option key={classNo} value={classNo}>
                        {classNo}반
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </fieldset>
        </div>
      )}
      <button
        type="submit"
        disabled={!canSubmit}
        className="min-h-12 rounded-2xl bg-[#20A982] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(32,169,130,0.18)] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state.status === "submitting" ? "신청 중..." : "이용 권한 신청"}
      </button>
    </form>
  );
}
