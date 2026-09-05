import { useEffect, useState } from "react";
import FirebaseStaffSubmissionAccessGate from "../components/FirebaseStaffSubmissionAccessGate.jsx";
import { FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { getStaffDisplayName, getStaffRoleDisplay } from "../lib/staffIdentity.js";
import { createTbSubmission, validateSubmissionFile } from "../lib/staffSubmissions.js";
import { getSubmissionItem } from "../lib/submissionItems.js";

const DEFAULT_ITEM = {
  title: "결핵검진 확인증 제출",
  description: "개별적으로 결핵검진 또는 흉부 X-ray 검진을 완료하신 교직원은 확인 가능한 자료를 제출해주세요.",
  target: "결핵검진 확인증 제출 대상 교직원",
  documentType: "결핵검진 확인증 또는 흉부 X-ray 확인 자료",
  deadlineLabel: "별도 안내일까지",
  guideText: "권장 파일명: 성명_결핵검진확인증\n확인 필요 항목: 성명, 검진일자, 검진 항목",
  buttonLabel: "확인증 업로드하기",
  status: "접수 중",
};

const DOCUMENT_TYPES = ["결핵검진 확인증", "흉부 X-ray 확인 자료", "기타 동등 자료"];
const STAFF_TYPES = ["교사", "강사", "행정직원"];

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-[#102047]">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function getFormError({ checkupDate, documentType, staffType, file }) {
  if (!checkupDate) return "검진일자를 선택해 주세요.";
  if (!documentType) return "제출자료유형을 선택해 주세요.";
  if (!staffType) return "교직원 구분을 선택해 주세요.";
  return validateSubmissionFile(file);
}

export default function FirebaseTbSubmitPage() {
  const [item, setItem] = useState(DEFAULT_ITEM);
  const [checkupDate, setCheckupDate] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [staffType, setStaffType] = useState("");
  const [file, setFile] = useState(null);
  const [loadState, setLoadState] = useState({ status: "loading", message: "" });
  const [submitState, setSubmitState] = useState({ status: "idle", message: "" });

  useEffect(() => {
    let shouldIgnore = false;

    async function loadItem() {
      setLoadState({ status: "loading", message: "" });
      try {
        const tbItem = await getSubmissionItem("tb");
        if (shouldIgnore) return;
        setItem(tbItem || DEFAULT_ITEM);
        setLoadState({ status: tbItem ? "success" : "empty", message: "" });
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

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setSubmitState({ status: "idle", message: selectedFile ? validateSubmissionFile(selectedFile) : "" });
  };

  const handleSubmit = async (event, user) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formError = getFormError({ checkupDate, documentType, staffType, file });
    if (formError) {
      setSubmitState({ status: "error", message: formError });
      return;
    }

    setSubmitState({ status: "submitting", message: "제출 중..." });
    try {
      const result = await createTbSubmission({ user, checkupDate, documentType, staffType, file });
      setCheckupDate("");
      setDocumentType("");
      setStaffType("");
      setFile(null);
      formElement.reset();
      setSubmitState({
        status: "success",
        message: `결핵검진 확인증 제출이 완료되었습니다. 접수번호: ${result.id}`,
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error instanceof Error ? error.message : "제출 중 오류가 발생했습니다.",
      });
    }
  };

  const isSubmitDisabled =
    submitState.status === "submitting" || Boolean(getFormError({ checkupDate, documentType, staffType, file }));

  return (
    <FirebaseStaffSubmissionAccessGate>
      {({ user, assignment, staffIdentity, displayName }) => {
        const submitterName = getStaffDisplayName({ identity: staffIdentity, displayName, user });
        const submitterRole = getStaffRoleDisplay({ assignment, identity: staffIdentity });

        return (
          <FirebaseV2PageShell
            label="제출"
            title="결핵검진 확인증 제출"
            description="검진일자와 확인 가능한 자료를 제출합니다."
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
                제출자: <span className="text-[#102047]">{submitterName}</span>
                <span> · {submitterRole}</span>
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="검진일자">
                  <input
                    type="date"
                    value={checkupDate}
                    onChange={(event) => setCheckupDate(event.target.value)}
                    className="min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/20"
                  />
                </Field>
                <Field label="제출자료유형">
                  <select
                    value={documentType}
                    onChange={(event) => setDocumentType(event.target.value)}
                    className="min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/20"
                  >
                    <option value="">선택 안 함</option>
                    {DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </Field>
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
                <Field label="확인증 파일">
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={handleFileChange}
                    className="block min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 py-3 text-sm font-bold text-[#102047] file:mr-3 file:rounded-xl file:border-0 file:bg-[#F0FBF7] file:px-3 file:py-2 file:text-sm file:font-black file:text-[#08754B]"
                  />
                </Field>
              </div>

              <p className="mt-5 rounded-[22px] bg-[#F0FBF7] p-4 text-sm font-bold leading-6 text-[#08754B]">
                PDF, JPG, PNG 파일만 제출할 수 있으며 파일 크기는 10MB 이하로 제한됩니다.
              </p>

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
                {submitState.status === "submitting" ? "제출 중..." : item.buttonLabel || "확인증 업로드하기"}
              </button>
            </form>
          </section>
        </FirebaseV2PageShell>
        );
      }}
    </FirebaseStaffSubmissionAccessGate>
  );
}
