import { useEffect, useMemo, useState } from "react";
import FirebaseV2AccessGate from "../components/FirebaseV2AccessGate.jsx";
import { FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { getRoleLabel, getRoleLabels } from "../lib/firebaseRoles.js";
import {
  ASSIGNMENT_FILTERS,
  ASSIGNMENT_ROLES,
  copyAssignmentsToTerm,
  getNextTerm,
  getUsersWithAssignments,
  previewAssignmentCopy,
  saveUserAssignment,
  validateAssignmentDraft,
} from "../lib/userAssignmentsAdmin.js";

const FILTER_LABELS = {
  all: "전체",
  unregistered: "권한 미등록",
  staff: "교직원",
  homeroom: "담임교사",
  health_teacher: "보건교사",
  inactive: "비활성",
};

const GRADE_OPTIONS = [1, 2, 3];
const CLASS_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);

function RoleBadges({ roles }) {
  const labels = getRoleLabels(roles);
  if (!labels.length) return <span className="rounded-full bg-[#FFF7F7] px-3 py-1 text-xs font-black text-[#B42318]">권한 미등록</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((label) => (
        <span key={label} className="rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]">
          {label}
        </span>
      ))}
    </div>
  );
}

function StateMessage({ state, emptyMessage }) {
  if (state.status === "loading") {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-36 animate-pulse rounded-[26px] border border-[#DDEAE7] bg-white/80" />
        ))}
      </div>
    );
  }

  if (state.status === "permission-denied" || state.status === "error") {
    return (
      <p className="rounded-[26px] border border-[#F6D8D8] bg-[#FFF7F7] p-5 text-sm font-black text-[#B42318]">
        {state.message}
      </p>
    );
  }

  if (state.status === "empty") {
    return (
      <p className="rounded-[26px] border border-[#DDEAE7] bg-[#F7FBF9] p-5 text-sm font-black text-[#627083]">
        {emptyMessage}
      </p>
    );
  }

  return null;
}

function createDraft(user, schoolYear, semester) {
  const assignment = user.assignment;
  return {
    uid: user.uid,
    schoolYear,
    semester,
    roles: Array.isArray(assignment?.roles) && assignment.roles.length ? assignment.roles : ["staff"],
    grade: assignment?.grade ?? "",
    classNo: assignment?.classNo ?? "",
    position: assignment?.position || "",
    active: assignment?.active !== false,
  };
}

function UserAssignmentCard({ user, schoolYear, semester, currentUid, pendingId, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => createDraft(user, schoolYear, semester));
  const [localMessage, setLocalMessage] = useState("");
  const assignment = user.assignment;
  const isSelf = user.uid === currentUid;
  const hasHomeroomRole = draft.roles.includes("homeroom");
  const isPending = pendingId === user.uid;

  useEffect(() => {
    if (!isEditing) {
      setDraft(createDraft(user, schoolYear, semester));
      setLocalMessage("");
    }
  }, [isEditing, schoolYear, semester, user]);

  const toggleRole = (role) => {
    setLocalMessage("");
    if (isSelf && role === "health_teacher") return;

    setDraft((currentDraft) => {
      const hasRole = currentDraft.roles.includes(role);
      const roles = hasRole
        ? currentDraft.roles.filter((currentRole) => currentRole !== role)
        : [...currentDraft.roles, role];

      return {
        ...currentDraft,
        roles,
        grade: roles.includes("homeroom") ? currentDraft.grade : "",
        classNo: roles.includes("homeroom") ? currentDraft.classNo : "",
      };
    });
  };

  const handleSave = async () => {
    const validationMessage = validateAssignmentDraft(draft, currentUid);
    if (validationMessage) {
      setLocalMessage(validationMessage);
      return;
    }

    const result = await onSave(draft);
    if (result?.ok) {
      setIsEditing(false);
      return;
    }

    setLocalMessage(result?.message || "권한을 저장하지 못했습니다.");
  };

  return (
    <article className="rounded-[28px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_18px_48px_rgba(16,32,71,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-black ${user.active ? "bg-[#F0FBF7] text-[#08754B]" : "bg-[#FFF7F7] text-[#B42318]"}`}>
              계정 {user.active ? "활성" : "비활성"}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-black ${assignment?.active === true ? "bg-[#EEF4FF] text-[#3154A3]" : "bg-[#FFF7F7] text-[#B42318]"}`}>
              권한 {assignment ? (assignment.active === true ? "활성" : "비활성") : "미등록"}
            </span>
            {isSelf && (
              <span className="rounded-full bg-[#F8F3FF] px-3 py-1 text-xs font-black text-[#6A3BC2]">
                현재 로그인
              </span>
            )}
          </div>
          <h2 className="mt-4 break-keep text-lg font-black text-[#102047]">{user.displayName || "이름 미등록"}</h2>
          <p className="mt-1 break-all text-sm font-bold text-[#627083]">{user.email || "이메일 없음"}</p>
          <div className="mt-4">
            <RoleBadges roles={assignment?.roles} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsEditing((value) => !value)}
          disabled={isPending}
          className="min-h-11 rounded-2xl border border-[#DDEAE7] bg-[#F7FBF9] px-4 py-2 text-sm font-black text-[#102047] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isEditing ? "닫기" : assignment ? "편집" : "권한 등록"}
        </button>
      </div>

      {!isEditing && (
        <dl className="mt-5 grid gap-4 rounded-[24px] bg-[#F7FBF9] p-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-black text-[#102047]">보직/업무</dt>
            <dd className="mt-1 text-sm font-medium text-[#627083]">{assignment?.position || "미등록"}</dd>
          </div>
          <div>
            <dt className="text-xs font-black text-[#102047]">담임 학급</dt>
            <dd className="mt-1 text-sm font-medium text-[#627083]">
              {assignment?.roles?.includes("homeroom") && assignment?.grade && assignment?.classNo
                ? `${assignment.grade}학년 ${assignment.classNo}반`
                : "해당 없음"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-black text-[#102047]">문서</dt>
            <dd className="mt-1 break-all text-sm font-medium text-[#627083]">
              {assignment?.id || `${user.uid}_${schoolYear}_${semester}`}
            </dd>
          </div>
        </dl>
      )}

      {isEditing && (
        <div className="mt-5 space-y-5 rounded-[24px] bg-[#F7FBF9] p-4">
          <div>
            <p className="text-xs font-black text-[#102047]">역할</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {ASSIGNMENT_ROLES.map((role) => (
                <label key={role} className="flex min-h-11 items-center gap-3 rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#102047]">
                  <input
                    type="checkbox"
                    checked={draft.roles.includes(role)}
                    onChange={() => toggleRole(role)}
                    disabled={isPending || (isSelf && role === "health_teacher")}
                    className="h-4 w-4 accent-[#20A982]"
                  />
                  {getRoleLabel(role)}
                </label>
              ))}
            </div>
            {isSelf && (
              <p className="mt-3 rounded-2xl bg-[#EEF4FF] px-4 py-3 text-xs font-bold leading-5 text-[#3154A3]">
                현재 로그인한 보건교사 권한은 이 화면에서 해제할 수 없습니다.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-black text-[#102047]">
              학년
              <select
                value={draft.grade}
                onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, grade: event.target.value }))}
                disabled={!hasHomeroomRole || isPending}
                className="mt-2 min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:opacity-50"
              >
                <option value="">선택</option>
                {GRADE_OPTIONS.map((grade) => (
                  <option key={grade} value={grade}>{grade}학년</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-black text-[#102047]">
              반
              <select
                value={draft.classNo}
                onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, classNo: event.target.value }))}
                disabled={!hasHomeroomRole || isPending}
                className="mt-2 min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:opacity-50"
              >
                <option value="">선택</option>
                {CLASS_OPTIONS.map((classNo) => (
                  <option key={classNo} value={classNo}>{classNo}반</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm font-black text-[#102047]">
            보직/업무
            <input
              value={draft.position}
              onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, position: event.target.value }))}
              disabled={isPending}
              placeholder="예: 보건교사, 2학년 3반 담임, 생활안전부장"
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] placeholder:text-[#9AA6B6] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:opacity-50"
            />
          </label>

          <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#102047]">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, active: event.target.checked }))}
              disabled={isPending || isSelf}
              className="h-4 w-4 accent-[#20A982]"
            />
            이번 학기 권한 활성
          </label>

          {localMessage && <p className="rounded-2xl bg-[#FFF7F7] px-4 py-3 text-sm font-black text-[#B42318]">{localMessage}</p>}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isPending}
              className="min-h-11 rounded-2xl border border-[#DDEAE7] bg-white px-4 py-2 text-sm font-black text-[#102047] transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="min-h-11 rounded-2xl bg-[#20A982] px-4 py-2 text-sm font-black text-white shadow-[0_12px_28px_rgba(32,169,130,0.18)] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function CopyTermPanel({ schoolYear, semester, onCopied }) {
  const nextTerm = useMemo(() => getNextTerm(schoolYear, semester), [schoolYear, semester]);
  const [options, setOptions] = useState({ copyRoles: true, copyPosition: true, copyHomeroom: false });
  const [preview, setPreview] = useState(null);
  const [state, setState] = useState({ status: "idle", message: "" });

  const handlePreview = async () => {
    setState({ status: "loading", message: "복사 대상을 확인하는 중입니다." });
    try {
      const nextPreview = await previewAssignmentCopy({ schoolYear, semester }, nextTerm);
      setPreview(nextPreview);
      setState({ status: "success", message: "복사 대상을 확인했습니다." });
    } catch (error) {
      setPreview(null);
      setState({
        status: error?.code === "permission-denied" ? "permission-denied" : "error",
        message: error?.code === "permission-denied" ? "권한을 확인해 주세요." : "복사 대상을 확인하지 못했습니다.",
      });
    }
  };

  const handleApply = async () => {
    setState({ status: "loading", message: "다음 학기 권한을 준비하는 중입니다." });
    try {
      const result = await copyAssignmentsToTerm({ schoolYear, semester }, nextTerm, options);
      setPreview(result);
      setState({ status: "success", message: "다음 학기 권한 준비가 완료되었습니다." });
      onCopied();
    } catch (error) {
      setState({
        status: error?.code === "permission-denied" ? "permission-denied" : "error",
        message: error?.code === "permission-denied" ? "권한을 확인해 주세요." : "다음 학기 권한을 준비하지 못했습니다.",
      });
    }
  };

  return (
    <section className="rounded-[30px] border border-[#DDEAE7] bg-[#F0FBF7] p-5 shadow-[0_18px_48px_rgba(16,32,71,0.05)] sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#08754B]">Next term</p>
          <h2 className="mt-2 text-xl font-black text-[#102047]">다음 학기 권한 준비</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-[#31584C]">
            {schoolYear}학년도 {semester}학기 권한을 {nextTerm.schoolYear}학년도 {nextTerm.semester}학기로 복사합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={handlePreview}
          disabled={state.status === "loading"}
          className="min-h-11 rounded-2xl border border-[#BFEBDC] bg-white px-4 py-2 text-sm font-black text-[#08754B] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          dry-run 미리보기
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#102047]">
          <input
            type="checkbox"
            checked={options.copyRoles}
            onChange={(event) => setOptions((current) => ({ ...current, copyRoles: event.target.checked }))}
            className="h-4 w-4 accent-[#20A982]"
          />
          역할 복사
        </label>
        <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#102047]">
          <input
            type="checkbox"
            checked={options.copyPosition}
            onChange={(event) => setOptions((current) => ({ ...current, copyPosition: event.target.checked }))}
            className="h-4 w-4 accent-[#20A982]"
          />
          보직 복사
        </label>
        <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#102047]">
          <input
            type="checkbox"
            checked={options.copyHomeroom}
            onChange={(event) => setOptions((current) => ({ ...current, copyHomeroom: event.target.checked }))}
            className="h-4 w-4 accent-[#20A982]"
          />
          담임 학급 복사
        </label>
      </div>

      {!options.copyHomeroom && (
        <p className="mt-3 rounded-2xl bg-white/85 px-4 py-3 text-xs font-bold leading-5 text-[#31584C]">
          담임 학급 복사가 꺼져 있으면 다음 학기 문서에는 homeroom 역할과 학년·반을 넣지 않습니다.
        </p>
      )}

      {preview && (
        <dl className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white px-4 py-3">
            <dt className="text-xs font-black text-[#627083]">대상</dt>
            <dd className="mt-1 text-xl font-black text-[#102047]">{preview.sourceCount ?? "-"}</dd>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3">
            <dt className="text-xs font-black text-[#627083]">생성 예정</dt>
            <dd className="mt-1 text-xl font-black text-[#20A982]">{preview.createCount}</dd>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3">
            <dt className="text-xs font-black text-[#627083]">이미 존재</dt>
            <dd className="mt-1 text-xl font-black text-[#3154A3]">{preview.existingCount}</dd>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3">
            <dt className="text-xs font-black text-[#627083]">건너뜀</dt>
            <dd className="mt-1 text-xl font-black text-[#B42318]">{preview.skipCount}</dd>
          </div>
        </dl>
      )}

      {state.message && (
        <p className={`mt-4 rounded-2xl px-4 py-3 text-sm font-black ${state.status === "error" || state.status === "permission-denied" ? "bg-[#FFF7F7] text-[#B42318]" : "bg-white/85 text-[#08754B]"}`}>
          {state.message}
        </p>
      )}

      <button
        type="button"
        onClick={handleApply}
        disabled={!preview || state.status === "loading" || preview.createCount === 0}
        className="mt-5 min-h-12 w-full rounded-2xl bg-[#20A982] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(32,169,130,0.18)] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        현재 권한 복사
      </button>
    </section>
  );
}

function FirebaseUserAdminContent({ user, displayName }) {
  const [schoolYear, setSchoolYear] = useState(CURRENT_SCHOOL_YEAR);
  const [semester, setSemester] = useState(CURRENT_SEMESTER);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loadState, setLoadState] = useState({ status: "idle", message: "" });
  const [actionState, setActionState] = useState({ status: "idle", message: "" });
  const [pendingId, setPendingId] = useState("");

  const yearOptions = useMemo(() => {
    return [CURRENT_SCHOOL_YEAR - 1, CURRENT_SCHOOL_YEAR, CURRENT_SCHOOL_YEAR + 1];
  }, []);

  const loadUsers = async () => {
    setLoadState({ status: "loading", message: "" });
    try {
      const nextUsers = await getUsersWithAssignments(schoolYear, semester);
      setUsers(nextUsers);
      setLoadState({ status: nextUsers.length ? "success" : "empty", message: "" });
    } catch (error) {
      setUsers([]);
      setLoadState({
        status: error?.code === "permission-denied" ? "permission-denied" : "error",
        message:
          error?.code === "permission-denied"
            ? "교직원 권한을 읽을 수 없습니다. Firestore 보안 규칙을 확인해 주세요."
            : error?.message?.includes("requires an index")
            ? "Firestore index 설정이 필요합니다. 콘솔의 index 안내를 확인해 주세요."
            : "교직원 목록을 불러오지 못했습니다.",
      });
    }
  };

  useEffect(() => {
    loadUsers();
  }, [schoolYear, semester]);

  const visibleUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return users.filter((userItem) => {
      const assignment = userItem.assignment;
      const roles = assignment?.roles || [];
      const matchesFilter =
        filter === "all" ||
        (filter === "unregistered" && !assignment) ||
        (filter === "inactive" && assignment && assignment.active !== true) ||
        roles.includes(filter);
      if (!matchesFilter) return false;
      if (!normalizedSearch) return true;

      return [userItem.displayName, userItem.email, assignment?.position]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [filter, searchTerm, users]);

  const handleSave = async (draft) => {
    setPendingId(draft.uid);
    setActionState({ status: "loading", message: "권한을 저장하는 중입니다." });
    try {
      const result = await saveUserAssignment(draft, user.uid);
      await loadUsers();
      setActionState({
        status: "success",
        message: result.mode === "created" ? "새 학기 권한이 등록되었습니다." : "권한이 저장되었습니다.",
      });
      return { ok: true };
    } catch (error) {
      const message =
        error?.code === "permission-denied"
          ? "권한 저장 권한을 확인해 주세요."
          : error.message || "권한을 저장하지 못했습니다.";
      setActionState({
        status: "error",
        message,
      });
      return { ok: false, message };
    } finally {
      setPendingId("");
    }
  };

  return (
    <FirebaseV2PageShell
      label="Firebase Admin"
      title="교직원 권한 관리"
      description="사용자 계정 정보와 학년도·학기별 역할, 담임 학급, 보직 권한을 분리해서 관리합니다."
      displayName={displayName}
    >
      <section className="rounded-[30px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_18px_48px_rgba(16,32,71,0.07)] sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[220px_160px_1fr]">
          <label className="text-sm font-black text-[#102047]">
            학년도
            <select
              value={schoolYear}
              onChange={(event) => setSchoolYear(Number(event.target.value))}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-[#F7FBF9] px-4 text-sm font-bold text-[#102047] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}학년도</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-black text-[#102047]">
            학기
            <select
              value={semester}
              onChange={(event) => setSemester(Number(event.target.value))}
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-[#F7FBF9] px-4 text-sm font-bold text-[#102047] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20"
            >
              <option value={1}>1학기</option>
              <option value={2}>2학기</option>
            </select>
          </label>
          <label className="text-sm font-black text-[#102047]">
            검색
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="이름, 이메일, 보직 검색"
              className="mt-2 min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-[#F7FBF9] px-4 text-sm font-bold text-[#102047] placeholder:text-[#9AA6B6] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {ASSIGNMENT_FILTERS.map((filterKey) => (
            <button
              key={filterKey}
              type="button"
              onClick={() => setFilter(filterKey)}
              className={`min-h-10 rounded-2xl px-4 py-2 text-xs font-black transition focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 ${
                filter === filterKey ? "bg-[#20A982] text-white shadow-[0_10px_24px_rgba(32,169,130,0.18)]" : "bg-[#F7FBF9] text-[#627083]"
              }`}
            >
              {FILTER_LABELS[filterKey]}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-[#F7FBF9] px-4 py-3">
            <p className="text-xs font-black text-[#627083]">전체 사용자</p>
            <p className="mt-1 text-2xl font-black text-[#102047]">{users.length}</p>
          </div>
          <div className="rounded-2xl bg-[#F7FBF9] px-4 py-3">
            <p className="text-xs font-black text-[#627083]">권한 등록</p>
            <p className="mt-1 text-2xl font-black text-[#20A982]">{users.filter((userItem) => userItem.assignment).length}</p>
          </div>
          <div className="rounded-2xl bg-[#F7FBF9] px-4 py-3">
            <p className="text-xs font-black text-[#627083]">현재 표시</p>
            <p className="mt-1 text-2xl font-black text-[#3154A3]">{visibleUsers.length}</p>
          </div>
        </div>

        {actionState.message && (
          <p className={`mt-4 rounded-2xl px-4 py-3 text-sm font-black ${actionState.status === "success" ? "bg-[#F0FBF7] text-[#08754B]" : actionState.status === "loading" ? "bg-[#EEF4FF] text-[#3154A3]" : "bg-[#FFF7F7] text-[#B42318]"}`}>
            {actionState.message}
          </p>
        )}
      </section>

      <CopyTermPanel schoolYear={schoolYear} semester={semester} onCopied={loadUsers} />

      <section className="space-y-4">
        {loadState.status === "success" &&
          visibleUsers.map((userItem) => (
            <UserAssignmentCard
              key={userItem.uid}
              user={userItem}
              schoolYear={schoolYear}
              semester={semester}
              currentUid={user.uid}
              pendingId={pendingId}
              onSave={handleSave}
            />
          ))}

        {loadState.status === "success" && visibleUsers.length === 0 && (
          <StateMessage state={{ status: "empty" }} emptyMessage="조건에 맞는 교직원이 없습니다." />
        )}

        {loadState.status !== "success" && (
          <StateMessage state={loadState} emptyMessage="등록된 교직원 계정이 없습니다." />
        )}
      </section>
    </FirebaseV2PageShell>
  );
}

export default function FirebaseUserAdminPage() {
  return (
    <FirebaseV2AccessGate>
      {({ user, displayName }) => <FirebaseUserAdminContent user={user} displayName={displayName} />}
    </FirebaseV2AccessGate>
  );
}
