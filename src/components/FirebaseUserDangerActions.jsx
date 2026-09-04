import { useState } from "react";

export default function FirebaseUserDangerActions({
  user,
  schoolYear,
  semester,
  currentUid,
  pendingId,
  onCheckDeletion,
  onDeactivateUser,
  onDeleteUser,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [deletionCheck, setDeletionCheck] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const isSelf = user.uid === currentUid;
  const isPending = pendingId === user.uid;
  const canDelete = deletionCheck?.canDelete === true && !isSelf;

  const handleCheck = async () => {
    setLocalMessage("");
    setDeletionCheck(null);
    const result = await onCheckDeletion(user.uid);
    if (result?.ok) {
      setDeletionCheck(result);
      return;
    }
    setLocalMessage(result?.message || "삭제 가능 여부를 확인하지 못했습니다.");
  };

  const handleDeactivate = async () => {
    setLocalMessage("");
    if (isSelf) {
      setLocalMessage("현재 로그인한 계정은 비활성화할 수 없습니다.");
      return;
    }
    const confirmed = window.confirm("이 계정의 온라인 보건실 접근을 중지하시겠습니까?");
    if (!confirmed) return;

    const result = await onDeactivateUser({ uid: user.uid, schoolYear, semester });
    if (!result?.ok) setLocalMessage(result?.message || "계정을 비활성화하지 못했습니다.");
  };

  const handleDelete = async () => {
    setLocalMessage("");
    if (!canDelete) {
      setLocalMessage("삭제 가능 여부를 먼저 확인해 주세요.");
      return;
    }
    if (confirmText.trim() !== "삭제") {
      setLocalMessage("완전 삭제하려면 확인 문구를 입력해 주세요.");
      return;
    }

    const confirmed = window.confirm("이 계정을 완전히 삭제하시겠습니까?");
    if (!confirmed) return;

    const result = await onDeleteUser({ uid: user.uid, confirmText: confirmText.trim() });
    if (!result?.ok) setLocalMessage(result?.message || "계정을 완전히 삭제하지 못했습니다.");
  };

  return (
    <div className="mt-3 rounded-[16px] border border-[#F6D8D8] bg-[#FFF7F7] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12px] font-bold text-[#B42318]">위험 작업</p>
          <p className="mt-1 text-[12px] font-medium text-[#627083]">
            기존 제출·기록은 삭제하지 않고 계정 접근만 관리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsOpen((value) => !value);
            setLocalMessage("");
          }}
          disabled={isPending}
          className="min-h-10 rounded-[10px] border border-[#F6D8D8] bg-white px-3 py-2 text-[12px] font-bold text-[#B42318] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#B42318]/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isOpen ? "닫기" : "계정 관리"}
        </button>
      </div>

      {isOpen && (
        <div className="mt-3 space-y-3">
          {isSelf && (
            <p className="rounded-[12px] bg-white px-3 py-2 text-[12px] font-bold text-[#B42318]">
              현재 로그인한 자기 자신 계정은 비활성화하거나 완전 삭제할 수 없습니다.
            </p>
          )}

          <div className="rounded-[12px] border border-[#F6D8D8] bg-white p-3">
            <p className="text-[12px] font-bold text-[#102047]">계정 비활성화</p>
            <p className="mt-1 text-[12px] font-medium leading-5 text-[#627083]">
              Firebase Auth 계정과 과거 기록은 유지하고, users 및 현재 학기 권한을 비활성화합니다.
            </p>
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={isPending || isSelf || (user.active === false && user.assignment?.active === false)}
              className="mt-3 min-h-10 rounded-[10px] border border-[#F6D8D8] bg-white px-3 py-2 text-[12px] font-bold text-[#B42318] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#B42318]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "처리 중..." : "비활성화"}
            </button>
          </div>

          <div className="rounded-[12px] border border-[#F6D8D8] bg-white p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[12px] font-bold text-[#102047]">완전 삭제</p>
                <p className="mt-1 text-[12px] font-medium leading-5 text-[#627083]">
                  업무 기록 참조가 없는 테스트 계정만 삭제할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCheck}
                disabled={isPending}
                className="min-h-10 rounded-[10px] border border-[#DDEAE7] bg-[#F7FBF9] px-3 py-2 text-[12px] font-bold text-[#102047] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                삭제 가능 여부 확인
              </button>
            </div>

            {deletionCheck && (
              <div className={`mt-3 rounded-[12px] px-3 py-2 text-[12px] font-bold ${
                deletionCheck.canDelete ? "bg-[#F0FBF7] text-[#08754B]" : "bg-[#FFF7F7] text-[#B42318]"
              }`}>
                <p>{deletionCheck.message}</p>
                <dl className="mt-2 grid gap-1 text-[#627083] sm:grid-cols-2">
                  <div>권한 문서 {deletionCheck.references?.assignments ?? 0}건</div>
                  <div>권한 신청 {deletionCheck.references?.accessRequests ?? 0}건</div>
                  <div>교직원 제출 {deletionCheck.references?.staffSubmissions ?? 0}건</div>
                  <div>감염병/학생건강 {deletionCheck.references?.healthSubmissions ?? 0}건</div>
                  <div>관리 audit 참조 {deletionCheck.references?.auditRefs ?? 0}건</div>
                  <div>활성 권한 {deletionCheck.references?.activeAssignments ?? 0}건</div>
                </dl>
              </div>
            )}

            {canDelete && (
              <div className="mt-3">
                <label className="block text-[12px] font-bold text-[#102047]">
                  완전 삭제 확인
                  <input
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value)}
                    placeholder="삭제"
                    className="mt-2 min-h-10 w-full rounded-[10px] border border-[#F6D8D8] bg-[#FFF7F7] px-3 text-[13px] font-semibold text-[#102047] placeholder:text-[#9AA6B6] focus:outline-none focus:ring-4 focus:ring-[#B42318]/10"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending || confirmText.trim() !== "삭제"}
                  className="mt-3 min-h-10 rounded-[10px] bg-[#B42318] px-3 py-2 text-[12px] font-bold text-white transition hover:bg-[#9F1F16] focus:outline-none focus:ring-4 focus:ring-[#B42318]/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? "삭제 중..." : "완전 삭제"}
                </button>
              </div>
            )}
          </div>

          {localMessage && (
            <p className="rounded-[12px] bg-white px-3 py-2 text-[12px] font-bold text-[#B42318]">
              {localMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
