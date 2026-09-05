import { useEffect, useMemo, useState } from "react";
import FirebaseAdminRoleAccessGate from "../components/FirebaseAdminRoleAccessGate.jsx";
import FirebaseUserDangerActions from "../components/FirebaseUserDangerActions.jsx";
import { FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import { getRoleLabel, getRoleLabels } from "../lib/firebaseRoles.js";
import { checkUserDeletion, deactivateUserAccount, deleteUserAccount } from "../lib/adminUserAccounts.js";
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
import { getStaffDirectory, linkStaffIdToAssignment } from "../lib/staffIdLinking.js";

const FILTER_LABELS = {
  all: "전체",
  unregistered: "권한 미등록",
  needsStaffId: "교직원ID 연결 필요",
  staff: "교직원",
  homeroom: "담임교사",
  health_teacher: "보건교사",
  inactive: "비활성",
};

const GRADE_OPTIONS = [1, 2, 3];
const CLASS_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const DIRECTORY_PREVIEW_LIMIT = 12;

function normalizeSearchText(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function exactText(value) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

function isActiveAssignment(assignment) {
  return assignment?.active === true;
}

function needsStaffIdLink(user) {
  return isActiveAssignment(user.assignment) && !user.assignment?.staffId;
}

function getStaffIdSuggestion(user, directory) {
  const assignment = user.assignment || {};
  const displayName = exactText(user.displayName);
  const position = exactText(assignment.position);
  const department = exactText(assignment.department);

  if (!displayName || (!position && !department)) return "";

  const matches = directory.filter((item) => {
    if (exactText(item.name) !== displayName) return false;
    const positionMatches = position && exactText(item.position) === position;
    const departmentMatches = department && exactText(item.department) === department;
    return positionMatches || departmentMatches;
  });

  return matches.length === 1 ? matches[0].staffId : "";
}

function staffDirectoryLabel(item) {
  return [item.staffId, item.name, item.position, item.department].filter(Boolean).join(" · ");
}

function formatAccountState(user) {
  const accountState = user.active ? "계정 활성" : "계정 비활성";
  const assignmentState = user.assignment
    ? user.assignment.active === true ? "권한 활성" : "권한 비활성"
    : "권한 미등록";
  return `${accountState} · ${assignmentState}`;
}

function RoleBadges({ roles }) {
  const labels = getRoleLabels(roles);
  if (!labels.length) return <span className="rounded-[8px] border border-[#F6D8D8] bg-[#FFF7F7] px-2 py-1 text-xs font-semibold text-[#B42318]">권한 미등록</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <span key={label} className="rounded-[8px] border border-[#BFEBDC] bg-[#F0FBF7] px-2 py-1 text-xs font-semibold text-[#08754B]">
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
          <div key={item} className="h-28 animate-pulse rounded-[12px] border border-[#DDEAE7] bg-white/80" />
        ))}
      </div>
    );
  }

  if (state.status === "permission-denied" || state.status === "error") {
    return (
      <p className="rounded-[12px] border border-[#F6D8D8] bg-[#FFF7F7] p-4 text-sm font-semibold text-[#B42318]">
        {state.message}
      </p>
    );
  }

  if (state.status === "empty") {
    return (
      <p className="rounded-[12px] border border-[#DDEAE7] bg-[#F8FAFA] p-4 text-sm font-semibold text-[#627083]">
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

function StaffIdLinkPanel({
  user,
  schoolYear,
  semester,
  directory,
  directoryState,
  linkedStaffIdCounts,
  pendingId,
  onLinkStaffId,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const isPending = pendingId === user.uid;
  const suggestionStaffId = useMemo(() => getStaffIdSuggestion(user, directory), [directory, user]);

  const filteredDirectory = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    const ordered = [...directory].sort((left, right) => {
      if (left.staffId === suggestionStaffId) return -1;
      if (right.staffId === suggestionStaffId) return 1;
      return left.staffId.localeCompare(right.staffId, "ko");
    });

    if (!normalizedQuery) return ordered.slice(0, DIRECTORY_PREVIEW_LIMIT);

    return ordered
      .filter((item) => {
        return [item.staffId, item.name, item.position, item.department]
          .some((value) => normalizeSearchText(value).includes(normalizedQuery));
      })
      .slice(0, DIRECTORY_PREVIEW_LIMIT);
  }, [directory, query, suggestionStaffId]);

  const selectedItem = directory.find((item) => item.staffId === selectedStaffId) || null;
  const duplicateCount = selectedItem ? linkedStaffIdCounts.get(selectedItem.staffId) || 0 : 0;

  const handleSubmit = async () => {
    setLocalMessage("");
    if (!selectedItem) {
      setLocalMessage("연결할 교직원을 선택해 주세요.");
      return;
    }

    const duplicateNotice = duplicateCount
      ? `\n\n주의: 같은 교직원ID가 다른 활성 권한 ${duplicateCount}건에 이미 연결되어 있습니다.`
      : "";
    const confirmed = window.confirm(
      `이 사용자를 ${staffDirectoryLabel(selectedItem)} 선생님과 연결하시겠습니까?${duplicateNotice}`
    );
    if (!confirmed) return;

    const result = await onLinkStaffId({
      uid: user.uid,
      schoolYear,
      semester,
      staffId: selectedItem.staffId,
      confirmDuplicate: duplicateCount > 0,
    });

    if (result?.ok) {
      setIsOpen(false);
      setSelectedStaffId("");
      setQuery("");
      return;
    }

    setLocalMessage(result?.message || "교직원ID를 연결하지 못했습니다.");
  };

  if (user.assignment?.staffId) {
    return (
      <p className="mt-2 rounded-[8px] border border-[#BFEBDC] bg-[#F0FBF7] px-2 py-1.5 text-[12px] font-semibold text-[#08754B]">
        연결됨 · {user.assignment.staffId}
      </p>
    );
  }

  if (!needsStaffIdLink(user)) {
    return (
      <p className="mt-2 rounded-[8px] border border-[#DDEAE7] bg-white px-2 py-1.5 text-[12px] font-semibold text-[#627083]">
        활성 권한 등록 후 연결 가능
      </p>
    );
  }

  return (
    <div className="mt-2 rounded-[10px] border border-[#DDEAE7] bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold text-[#B42318]">교직원ID 연결 필요</p>
          {suggestionStaffId && (
            <p className="mt-1 text-[12px] font-medium text-[#08754B]">추천 · {suggestionStaffId}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setIsOpen((value) => !value);
            setLocalMessage("");
            if (!selectedStaffId && suggestionStaffId) setSelectedStaffId(suggestionStaffId);
          }}
          disabled={isPending || directoryState.status === "loading"}
          className="min-h-10 rounded-[10px] border border-[#BFEBDC] bg-white px-3 py-2 text-[12px] font-semibold text-[#08754B] transition hover:bg-[#F0FBF7] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isOpen ? "연결 닫기" : "교직원 연결"}
        </button>
      </div>

      {isOpen && (
        <div className="mt-3 space-y-3">
          {directoryState.status === "error" && (
            <p className="rounded-[10px] border border-[#F6D8D8] bg-[#FFF7F7] px-3 py-2 text-[12px] font-semibold text-[#B42318]">
              {directoryState.message}
            </p>
          )}
          {directoryState.status !== "error" && (
            <>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이름, 교직원ID, 부서, 직책 검색"
                className="min-h-10 w-full rounded-[10px] border border-[#DDEAE7] bg-white px-3 text-[13px] font-semibold text-[#102047] placeholder:text-[#9AA6B6] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20"
              />
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {filteredDirectory.map((item) => {
                  const itemDuplicateCount = linkedStaffIdCounts.get(item.staffId) || 0;
                  const isSelected = selectedStaffId === item.staffId;
                  return (
                    <label
                      key={item.staffId}
                      className={`flex cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-2 text-[12px] transition ${
                        isSelected ? "border-[#20A982] bg-[#F0FBF7]" : "border-[#DDEAE7] bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`staff-id-link-${user.uid}`}
                        checked={isSelected}
                        onChange={() => setSelectedStaffId(item.staffId)}
                        className="mt-1 h-4 w-4 accent-[#20A982]"
                      />
                      <span className="min-w-0">
                        <span className="block break-keep font-bold text-[#102047]">
                          {staffDirectoryLabel(item)}
                          {item.staffId === suggestionStaffId && (
                            <span className="ml-2 rounded-[8px] bg-[#20A982] px-2 py-0.5 text-[11px] font-semibold text-white">
                              추천
                            </span>
                          )}
                        </span>
                        {itemDuplicateCount > 0 && (
                          <span className="mt-1 block font-semibold text-[#B42318]">
                            같은 교직원ID가 다른 활성 권한 {itemDuplicateCount}건에 연결됨
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
                {filteredDirectory.length === 0 && (
                  <p className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2 text-[12px] font-semibold text-[#627083]">
                    검색 결과가 없습니다.
                  </p>
                )}
              </div>
              {localMessage && (
                <p className="rounded-[10px] border border-[#F6D8D8] bg-[#FFF7F7] px-3 py-2 text-[12px] font-semibold text-[#B42318]">
                  {localMessage}
                </p>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isPending || !selectedItem}
                  className="min-h-10 rounded-[10px] bg-[#20A982] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#08754B] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? "연결 중..." : "연결 저장"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function UserAssignmentCard({
  user,
  schoolYear,
  semester,
  currentUid,
  directory,
  directoryState,
  linkedStaffIdCounts,
  pendingId,
  onSave,
  onLinkStaffId,
  onCheckDeletion,
  onDeactivateUser,
  onDeleteUser,
}) {
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
    <article className="rounded-[12px] border border-[#DDEAE7] bg-white p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-[8px] border px-2 py-1 text-xs font-semibold ${user.active ? "border-[#BFEBDC] bg-[#F0FBF7] text-[#08754B]" : "border-[#F6D8D8] bg-[#FFF7F7] text-[#B42318]"}`}>
              계정 {user.active ? "활성" : "비활성"}
            </span>
            <span className={`rounded-[8px] border px-2 py-1 text-xs font-semibold ${assignment?.active === true ? "border-[#C8D8FF] bg-[#EEF4FF] text-[#3154A3]" : "border-[#F6D8D8] bg-[#FFF7F7] text-[#B42318]"}`}>
              권한 {assignment ? (assignment.active === true ? "활성" : "비활성") : "미등록"}
            </span>
            {isSelf && (
              <span className="rounded-[8px] border border-[#DDEAE7] bg-[#F8FAFA] px-2 py-1 text-xs font-semibold text-[#627083]">
                현재 로그인
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
            <h2 className="break-keep text-base font-semibold text-[#102047]">{user.displayName || "이름 미등록"}</h2>
            <p className="break-all text-sm font-medium text-[#627083]">{user.email || "이메일 없음"}</p>
          </div>
          <div className="mt-2">
            <RoleBadges roles={assignment?.roles} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsEditing((value) => !value)}
          disabled={isPending}
          className="min-h-10 rounded-[10px] border border-[#DDEAE7] bg-white px-4 py-2 text-sm font-semibold text-[#102047] transition hover:bg-[#F3F8F6] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isEditing ? "닫기" : assignment ? "편집" : "권한 등록"}
        </button>
      </div>

      {!isEditing && (
        <dl className="mt-3 grid gap-3 rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] p-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold text-[#102047]">보직/업무</dt>
            <dd className="mt-1 text-sm font-medium text-[#627083]">{assignment?.position || "미등록"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[#102047]">담임 학급</dt>
            <dd className="mt-1 text-sm font-medium text-[#627083]">
              {assignment?.roles?.includes("homeroom") && assignment?.grade && assignment?.classNo
                ? `${assignment.grade}학년 ${assignment.classNo}반`
                : "해당 없음"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[#102047]">교직원ID</dt>
            <dd className="mt-1 text-sm font-medium text-[#627083]">
              {assignment?.staffId ? `연결됨 · ${assignment.staffId}` : assignment ? "연결 필요" : "미등록"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-[#102047]">계정 상태</dt>
            <dd className="mt-1 text-sm font-medium text-[#627083]">{formatAccountState(user)}</dd>
          </div>
        </dl>
      )}

      {!isEditing && (
        <StaffIdLinkPanel
          user={user}
          schoolYear={schoolYear}
          semester={semester}
          directory={directory}
          directoryState={directoryState}
          linkedStaffIdCounts={linkedStaffIdCounts}
          pendingId={pendingId}
          onLinkStaffId={onLinkStaffId}
        />
      )}

      {!isEditing && (
        <FirebaseUserDangerActions
          user={user}
          schoolYear={schoolYear}
          semester={semester}
          currentUid={currentUid}
          pendingId={pendingId}
          onCheckDeletion={onCheckDeletion}
          onDeactivateUser={onDeactivateUser}
          onDeleteUser={onDeleteUser}
        />
      )}

      {isEditing && (
        <div className="mt-4 space-y-4 rounded-[12px] border border-[#DDEAE7] bg-[#F8FAFA] p-4">
          <div>
            <p className="text-xs font-semibold text-[#102047]">역할</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {ASSIGNMENT_ROLES.map((role) => (
                <label key={role} className="flex min-h-10 items-center gap-3 rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-2 text-sm font-semibold text-[#102047]">
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
              <p className="mt-3 rounded-[10px] border border-[#C8D8FF] bg-[#EEF4FF] px-3 py-2 text-xs font-semibold leading-5 text-[#3154A3]">
                현재 로그인한 보건교사 권한은 이 화면에서 해제할 수 없습니다.
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-[#102047]">
              학년
              <select
                value={draft.grade}
                onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, grade: event.target.value }))}
                disabled={!hasHomeroomRole || isPending}
                className="mt-2 min-h-10 w-full rounded-[10px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#102047] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:opacity-50"
              >
                <option value="">선택</option>
                {GRADE_OPTIONS.map((grade) => (
                  <option key={grade} value={grade}>{grade}학년</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-[#102047]">
              반
              <select
                value={draft.classNo}
                onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, classNo: event.target.value }))}
                disabled={!hasHomeroomRole || isPending}
                className="mt-2 min-h-10 w-full rounded-[10px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#102047] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:opacity-50"
              >
                <option value="">선택</option>
                {CLASS_OPTIONS.map((classNo) => (
                  <option key={classNo} value={classNo}>{classNo}반</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm font-semibold text-[#102047]">
            보직/업무
            <input
              value={draft.position}
              onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, position: event.target.value }))}
              disabled={isPending}
              placeholder="예: 보건교사, 2학년 3반 담임, 생활안전부장"
              className="mt-2 min-h-10 w-full rounded-[10px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#102047] placeholder:text-[#9AA6B6] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:opacity-50"
            />
          </label>

          <label className="flex min-h-10 items-center gap-3 rounded-[10px] border border-[#DDEAE7] bg-white px-3 py-2 text-sm font-semibold text-[#102047]">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => setDraft((currentDraft) => ({ ...currentDraft, active: event.target.checked }))}
              disabled={isPending || isSelf}
              className="h-4 w-4 accent-[#20A982]"
            />
            이번 학기 권한 활성
          </label>

          {localMessage && <p className="rounded-[10px] border border-[#F6D8D8] bg-[#FFF7F7] px-3 py-2 text-sm font-semibold text-[#B42318]">{localMessage}</p>}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isPending}
              className="min-h-10 rounded-[10px] border border-[#DDEAE7] bg-white px-4 py-2 text-sm font-semibold text-[#102047] transition hover:bg-[#F3F8F6] disabled:cursor-not-allowed disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="min-h-10 rounded-[10px] bg-[#20A982] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#08754B] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50"
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
    <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#08754B]">Next term</p>
          <h2 className="mt-1 text-lg font-semibold text-[#102047]">다음 학기 권한 준비</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-[#31584C]">
            {schoolYear}학년도 {semester}학기 권한을 {nextTerm.schoolYear}학년도 {nextTerm.semester}학기로 복사합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={handlePreview}
          disabled={state.status === "loading"}
          className="min-h-10 rounded-[10px] border border-[#BFEBDC] bg-white px-4 py-2 text-sm font-semibold text-[#08754B] transition hover:bg-[#F0FBF7] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          dry-run 미리보기
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <label className="flex min-h-10 items-center gap-3 rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2 text-sm font-semibold text-[#102047]">
          <input
            type="checkbox"
            checked={options.copyRoles}
            onChange={(event) => setOptions((current) => ({ ...current, copyRoles: event.target.checked }))}
            className="h-4 w-4 accent-[#20A982]"
          />
          역할 복사
        </label>
        <label className="flex min-h-10 items-center gap-3 rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2 text-sm font-semibold text-[#102047]">
          <input
            type="checkbox"
            checked={options.copyPosition}
            onChange={(event) => setOptions((current) => ({ ...current, copyPosition: event.target.checked }))}
            className="h-4 w-4 accent-[#20A982]"
          />
          보직 복사
        </label>
        <label className="flex min-h-10 items-center gap-3 rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2 text-sm font-semibold text-[#102047]">
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
        <p className="mt-3 rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2 text-xs font-semibold leading-5 text-[#31584C]">
          담임 학급 복사가 꺼져 있으면 다음 학기 문서에는 homeroom 역할과 학년·반을 넣지 않습니다.
        </p>
      )}

      {preview && (
        <dl className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2">
            <dt className="text-xs font-semibold text-[#627083]">대상</dt>
            <dd className="mt-1 text-lg font-semibold text-[#102047]">{preview.sourceCount ?? "-"}</dd>
          </div>
          <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2">
            <dt className="text-xs font-semibold text-[#627083]">생성 예정</dt>
            <dd className="mt-1 text-lg font-semibold text-[#20A982]">{preview.createCount}</dd>
          </div>
          <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2">
            <dt className="text-xs font-semibold text-[#627083]">이미 존재</dt>
            <dd className="mt-1 text-lg font-semibold text-[#3154A3]">{preview.existingCount}</dd>
          </div>
          <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2">
            <dt className="text-xs font-semibold text-[#627083]">건너뜀</dt>
            <dd className="mt-1 text-lg font-semibold text-[#B42318]">{preview.skipCount}</dd>
          </div>
        </dl>
      )}

      {state.message && (
        <p className={`mt-4 rounded-[10px] border px-3 py-2 text-sm font-semibold ${state.status === "error" || state.status === "permission-denied" ? "border-[#F6D8D8] bg-[#FFF7F7] text-[#B42318]" : "border-[#BFEBDC] bg-[#F0FBF7] text-[#08754B]"}`}>
          {state.message}
        </p>
      )}

      <button
        type="button"
        onClick={handleApply}
        disabled={!preview || state.status === "loading" || preview.createCount === 0}
        className="mt-5 min-h-10 w-full rounded-[10px] bg-[#20A982] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#08754B] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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
  const [staffDirectory, setStaffDirectory] = useState([]);
  const [directoryState, setDirectoryState] = useState({ status: "idle", message: "" });
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

  const loadStaffDirectory = async () => {
    setDirectoryState({ status: "loading", message: "" });
    try {
      const result = await getStaffDirectory();
      setStaffDirectory(result.directory);
      setDirectoryState({ status: "success", message: "" });
    } catch (error) {
      setStaffDirectory([]);
      setDirectoryState({
        status: "error",
        message: error?.message || "교직원명단을 불러오지 못했습니다.",
      });
    }
  };

  useEffect(() => {
    loadUsers();
  }, [schoolYear, semester]);

  useEffect(() => {
    loadStaffDirectory();
  }, []);

  const linkedStaffIdCounts = useMemo(() => {
    const counts = new Map();
    users.forEach((userItem) => {
      const staffId = userItem.assignment?.staffId;
      if (isActiveAssignment(userItem.assignment) && staffId) {
        counts.set(staffId, (counts.get(staffId) || 0) + 1);
      }
    });
    return counts;
  }, [users]);

  const needsStaffIdCount = useMemo(() => users.filter(needsStaffIdLink).length, [users]);

  const visibleUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return users.filter((userItem) => {
      const assignment = userItem.assignment;
      const roles = assignment?.roles || [];
      const matchesFilter =
        filter === "all" ||
        (filter === "unregistered" && !assignment) ||
        (filter === "needsStaffId" && needsStaffIdLink(userItem)) ||
        (filter === "inactive" && assignment && assignment.active !== true) ||
        roles.includes(filter);
      if (!matchesFilter) return false;
      if (!normalizedSearch) return true;

      return [userItem.displayName, userItem.email, assignment?.position, assignment?.staffId]
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

  const handleLinkStaffId = async (payload) => {
    setPendingId(payload.uid);
    setActionState({ status: "loading", message: "교직원ID를 연결하는 중입니다." });
    try {
      await linkStaffIdToAssignment(payload);
      await loadUsers();
      setActionState({ status: "success", message: "교직원ID가 연결되었습니다." });
      return { ok: true };
    } catch (error) {
      const message = error?.message || "교직원ID를 연결하지 못했습니다.";
      setActionState({ status: "error", message });
      return { ok: false, message, code: error?.code || "" };
    } finally {
      setPendingId("");
    }
  };

  const handleCheckDeletion = async (targetUid) => {
    setPendingId(targetUid);
    setActionState({ status: "loading", message: "삭제 가능 여부를 확인하는 중입니다." });
    try {
      const result = await checkUserDeletion(targetUid);
      setActionState({ status: "success", message: result.message });
      return { ok: true, ...result };
    } catch (error) {
      const message = error?.message || "삭제 가능 여부를 확인하지 못했습니다.";
      setActionState({ status: "error", message });
      return { ok: false, message, references: error?.references || null };
    } finally {
      setPendingId("");
    }
  };

  const handleDeactivateUser = async (payload) => {
    setPendingId(payload.uid);
    setActionState({ status: "loading", message: "계정 접근을 비활성화하는 중입니다." });
    try {
      const result = await deactivateUserAccount(payload);
      await loadUsers();
      setActionState({ status: "success", message: result.message || "계정 접근을 비활성화했습니다." });
      return { ok: true };
    } catch (error) {
      const message = error?.message || "계정을 비활성화하지 못했습니다.";
      setActionState({ status: "error", message });
      return { ok: false, message };
    } finally {
      setPendingId("");
    }
  };

  const handleDeleteUser = async (payload) => {
    setPendingId(payload.uid);
    setActionState({ status: "loading", message: "계정을 완전히 삭제하는 중입니다." });
    try {
      const result = await deleteUserAccount(payload);
      await loadUsers();
      setActionState({ status: "success", message: result.message || "계정을 완전히 삭제했습니다." });
      return { ok: true };
    } catch (error) {
      const message = error?.message || "계정을 완전히 삭제하지 못했습니다.";
      setActionState({ status: "error", message });
      return { ok: false, message, references: error?.references || null };
    } finally {
      setPendingId("");
    }
  };

  return (
    <FirebaseV2PageShell
      label="관리자"
      title="교직원 권한 관리"
      description="사용자 계정 정보와 학년도·학기별 역할, 담임 학급, 보직 권한을 분리해서 관리합니다."
      displayName={displayName}
    >
      <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[220px_160px_1fr]">
          <label className="text-sm font-semibold text-[#102047]">
            학년도
            <select
              value={schoolYear}
              onChange={(event) => setSchoolYear(Number(event.target.value))}
              className="mt-2 min-h-10 w-full rounded-[10px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#102047] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}학년도</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-[#102047]">
            학기
            <select
              value={semester}
              onChange={(event) => setSemester(Number(event.target.value))}
              className="mt-2 min-h-10 w-full rounded-[10px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#102047] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20"
            >
              <option value={1}>1학기</option>
              <option value={2}>2학기</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-[#102047]">
            검색
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="이름, 이메일, 보직 검색"
              className="mt-2 min-h-10 w-full rounded-[10px] border border-[#DDEAE7] bg-white px-3 text-sm font-semibold text-[#102047] placeholder:text-[#9AA6B6] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {ASSIGNMENT_FILTERS.map((filterKey) => (
            <button
              key={filterKey}
              type="button"
              onClick={() => setFilter(filterKey)}
              className={`min-h-10 rounded-[10px] border px-3 py-2 text-xs font-semibold transition focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 ${
                filter === filterKey ? "border-[#20A982] bg-[#20A982] text-white" : "border-[#DDEAE7] bg-white text-[#627083] hover:bg-[#F3F8F6]"
              }`}
            >
              {FILTER_LABELS[filterKey]}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2">
            <p className="text-xs font-semibold text-[#627083]">전체 사용자</p>
            <p className="mt-1 text-lg font-semibold text-[#102047]">{users.length}</p>
          </div>
          <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2">
            <p className="text-xs font-semibold text-[#627083]">권한 등록</p>
            <p className="mt-1 text-lg font-semibold text-[#20A982]">{users.filter((userItem) => userItem.assignment).length}</p>
          </div>
          <div className="rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2">
            <p className="text-xs font-semibold text-[#627083]">현재 표시</p>
            <p className="mt-1 text-lg font-semibold text-[#3154A3]">{visibleUsers.length}</p>
          </div>
          <div className="rounded-[10px] border border-[#F6D8D8] bg-[#FFF7F7] px-3 py-2">
            <p className="text-xs font-semibold text-[#627083]">교직원ID 연결 필요</p>
            <p className="mt-1 text-lg font-semibold text-[#B42318]">{needsStaffIdCount}</p>
          </div>
        </div>

        <p className="mt-4 rounded-[10px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2 text-xs font-semibold leading-5 text-[#627083]">
          교직원ID는 Google Sheet 교직원명단을 읽어 선택하며, 저장 시 현재 권한 문서에 staffId만 연결합니다.
          {directoryState.status === "success" ? ` 교직원명단 ${staffDirectory.length}건 로드됨` : ""}
        </p>

        {actionState.message && (
          <p className={`mt-4 rounded-[10px] border px-3 py-2 text-sm font-semibold ${actionState.status === "success" ? "border-[#BFEBDC] bg-[#F0FBF7] text-[#08754B]" : actionState.status === "loading" ? "border-[#C8D8FF] bg-[#EEF4FF] text-[#3154A3]" : "border-[#F6D8D8] bg-[#FFF7F7] text-[#B42318]"}`}>
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
              directory={staffDirectory}
              directoryState={directoryState}
              linkedStaffIdCounts={linkedStaffIdCounts}
              pendingId={pendingId}
              onSave={handleSave}
              onLinkStaffId={handleLinkStaffId}
              onCheckDeletion={handleCheckDeletion}
              onDeactivateUser={handleDeactivateUser}
              onDeleteUser={handleDeleteUser}
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
    <FirebaseAdminRoleAccessGate deniedTitle="교직원 권한 관리 권한이 없습니다.">
      {({ user, displayName }) => <FirebaseUserAdminContent user={user} displayName={displayName} />}
    </FirebaseAdminRoleAccessGate>
  );
}
