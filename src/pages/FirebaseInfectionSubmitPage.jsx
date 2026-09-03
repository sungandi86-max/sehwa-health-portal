import { useEffect, useState } from "react";
import FirebaseInfectionReportList from "../components/FirebaseInfectionReportList.jsx";
import FirebaseStudentHealthAccessGate from "../components/FirebaseStudentHealthAccessGate.jsx";
import { FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { CURRENT_SCHOOL_YEAR, CURRENT_SEMESTER } from "../config/school.js";
import {
  createInfectionReport,
  getAccessibleInfectionReports,
  validateInfectionReport,
} from "../lib/studentHealthSubmissions.js";
import { getSubmissionItem } from "../lib/submissionItems.js";
import { isHealthTeacher } from "../lib/userProfile.js";

const DEFAULT_ITEM = {
  title: "감염병 발생 보고",
  description: "학생이 감염병 진단을 받은 경우 필요한 정보만 입력해 보건실에 보고합니다.",
  target: "담임교사",
  documentType: "감염병 발생 정보",
  deadlineLabel: "수시",
  guideText: "학생 건강정보가 포함되므로 필요한 업무 범위 안에서만 입력해 주세요.",
  buttonLabel: "감염병 발생 보고하기",
  status: "접수 중",
};

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-[#102047]">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

export default function FirebaseInfectionSubmitPage() {
  const [item, setItem] = useState(DEFAULT_ITEM);
  const [grade, setGrade] = useState("");
  const [classNo, setClassNo] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [studentName, setStudentName] = useState("");
  const [diseaseName, setDiseaseName] = useState("");
  const [diagnosisDate, setDiagnosisDate] = useState("");
  const [exclusionStartDate, setExclusionStartDate] = useState("");
  const [exclusionEndDate, setExclusionEndDate] = useState("");
  const [note, setNote] = useState("");
  const [reports, setReports] = useState([]);
  const [loadState, setLoadState] = useState({ status: "loading", message: "" });
  const [listState, setListState] = useState({ status: "idle", message: "" });
  const [submitState, setSubmitState] = useState({ status: "idle", message: "" });

  useEffect(() => {
    let shouldIgnore = false;

    async function loadItem() {
      try {
        const infectionItem = await getSubmissionItem("infection");
        if (shouldIgnore) return;
        setItem(infectionItem || DEFAULT_ITEM);
        setLoadState({ status: infectionItem ? "success" : "empty", message: "" });
      } catch (error) {
        if (shouldIgnore) return;
        setLoadState({
          status: error?.code === "permission-denied" ? "permission-denied" : "error",
          message: "제출 항목 정보를 불러오지 못했습니다. Firestore 보안 규칙을 확인해 주세요.",
        });
      }
    }

    loadItem();
    return () => {
      shouldIgnore = true;
    };
  }, []);

  const refreshReports = async (assignment) => {
    setListState({ status: "loading", message: "" });
    try {
      const nextReports = await getAccessibleInfectionReports(assignment);
      setReports(nextReports);
      setListState({ status: "success", message: "" });
    } catch (error) {
      setListState({
        status: error?.code === "permission-denied" ? "permission-denied" : "error",
        message:
          error?.code === "permission-denied"
            ? "감염병 보고 목록을 읽을 수 없습니다. Firestore 보안 규칙을 확인해 주세요."
            : "감염병 보고 목록을 불러오지 못했습니다.",
      });
    }
  };

  const handleSubmit = async (event, user, assignment) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const healthTeacher = isHealthTeacher(assignment);
    const reportGrade = healthTeacher ? grade : String(assignment.grade || "");
    const reportClassNo = healthTeacher ? classNo : String(assignment.classNo || "");
    const reportError = validateInfectionReport({
      assignment,
      grade: reportGrade,
      classNo: reportClassNo,
      studentNumber,
      studentName,
      diseaseName,
    });

    if (reportError) {
      setSubmitState({ status: "error", message: reportError });
      return;
    }

    setSubmitState({ status: "submitting", message: "제출 중..." });
    try {
      const result = await createInfectionReport({
        user,
        assignment,
        grade: reportGrade,
        classNo: reportClassNo,
        studentNumber,
        studentName,
        diseaseName,
        diagnosisDate,
        exclusionStartDate,
        exclusionEndDate,
        note,
      });
      setStudentNumber("");
      setStudentName("");
      setDiseaseName("");
      setDiagnosisDate("");
      setExclusionStartDate("");
      setExclusionEndDate("");
      setNote("");
      formElement.reset();
      setSubmitState({ status: "success", message: `감염병 발생 보고가 접수되었습니다. 접수번호: ${result.id}` });
      await refreshReports(assignment);
    } catch (error) {
      const isPermissionDenied = error?.code === "permission-denied" || error?.message?.includes("insufficient permissions");
      setSubmitState({
        status: "error",
        message: isPermissionDenied
          ? "감염병 발생 보고를 저장할 수 없습니다. Firestore 보안 규칙을 확인해 주세요."
          : "감염병 발생 보고 저장 중 오류가 발생했습니다.",
      });
    }
  };

  return (
    <FirebaseStudentHealthAccessGate>
      {({ user, assignment, displayName }) => {
        const healthTeacher = isHealthTeacher(assignment);
        const fixedGrade = healthTeacher ? grade : String(assignment.grade || "");
        const fixedClassNo = healthTeacher ? classNo : String(assignment.classNo || "");
        const formError = validateInfectionReport({
          assignment,
          grade: fixedGrade,
          classNo: fixedClassNo,
          studentNumber,
          studentName,
          diseaseName,
        });

        return (
          <InfectionForm
            assignment={assignment}
            displayName={displayName}
            fixedClassNo={fixedClassNo}
            fixedGrade={fixedGrade}
            formError={formError}
            healthTeacher={healthTeacher}
            item={item}
            loadState={loadState}
            reports={reports}
            listState={listState}
            values={{ grade, classNo, studentNumber, studentName, diseaseName, diagnosisDate, exclusionStartDate, exclusionEndDate, note }}
            setters={{ setGrade, setClassNo, setStudentNumber, setStudentName, setDiseaseName, setDiagnosisDate, setExclusionStartDate, setExclusionEndDate, setNote }}
            submitState={submitState}
            onLoadReports={() => refreshReports(assignment)}
            onSubmit={(event) => handleSubmit(event, user, assignment)}
          />
        );
      }}
    </FirebaseStudentHealthAccessGate>
  );
}

function InfectionForm(props) {
  const { displayName, fixedClassNo, fixedGrade, formError, healthTeacher, item, loadState, listState, reports, values, setters, submitState } = props;

  useEffect(() => {
    if (!healthTeacher) {
      setters.setGrade(fixedGrade);
      setters.setClassNo(fixedClassNo);
    }
    props.onLoadReports();
  }, []);

  const isSubmitDisabled = submitState.status === "submitting" || Boolean(formError);

  return (
    <FirebaseV2PageShell label="Student Health" title="감염병 발생 보고" description="담임 학급 또는 보건교사 권한 범위 안에서 필요한 학생 감염병 정보만 접수합니다." displayName={displayName}>
      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="rounded-[30px] border border-[#DDEAE7] bg-white/95 p-6 shadow-[0_18px_48px_rgba(16,32,71,0.07)]">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]">{item.status || "접수 중"}</span>
            <span className="rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-black text-[#3154A3]">{item.deadlineLabel || "수시"}</span>
          </div>
          <h2 className="mt-4 text-2xl font-black tracking-[-0.02em] text-[#102047]">{item.title}</h2>
          <p className="mt-3 text-sm font-medium leading-6 text-[#627083]">{item.description}</p>
          <dl className="mt-5 space-y-3 rounded-[24px] bg-[#F7FBF9] p-4 text-sm text-[#627083]">
            <div><dt className="font-black text-[#102047]">대상</dt><dd className="mt-1 font-medium">{item.target || "-"}</dd></div>
            <div><dt className="font-black text-[#102047]">학급</dt><dd className="mt-1 font-medium">{fixedGrade || "-"}학년 {fixedClassNo || "-"}반</dd></div>
            <div><dt className="font-black text-[#102047]">안내</dt><dd className="mt-1 whitespace-pre-line font-medium">{item.guideText || "-"}</dd></div>
          </dl>
          <p className="mt-5 rounded-[22px] bg-[#F0FBF7] p-4 text-sm font-bold leading-6 text-[#08754B]">주민등록번호, 연락처, 상세 진료내용은 입력하지 않습니다.</p>
          {loadState.status === "permission-denied" || loadState.status === "error" ? <p className="mt-4 rounded-2xl bg-[#FFF7F7] px-4 py-3 text-sm font-black text-[#B42318]">{loadState.message}</p> : null}
        </aside>

        <form onSubmit={props.onSubmit} className="rounded-[30px] border border-[#DDEAE7] bg-white/95 p-6 shadow-[0_18px_48px_rgba(16,32,71,0.07)]">
          {healthTeacher ? <TeacherClassFields values={values} setters={setters} /> : <p className="rounded-[24px] border border-[#DDEAE7] bg-[#F7FBF9] p-4 text-sm font-black text-[#102047]">학급: {fixedGrade}학년 {fixedClassNo}반</p>}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="번호"><input type="number" min="1" value={values.studentNumber} onChange={(event) => setters.setStudentNumber(event.target.value)} className="min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/20" /></Field>
            <Field label="학생 이름"><input type="text" value={values.studentName} onChange={(event) => setters.setStudentName(event.target.value)} className="min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/20" /></Field>
            <Field label="감염병명"><input type="text" value={values.diseaseName} onChange={(event) => setters.setDiseaseName(event.target.value)} className="min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/20" /></Field>
            <Field label="진단일"><input type="date" value={values.diagnosisDate} onChange={(event) => setters.setDiagnosisDate(event.target.value)} className="min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/20" /></Field>
            <Field label="등교중지 시작일"><input type="date" value={values.exclusionStartDate} onChange={(event) => setters.setExclusionStartDate(event.target.value)} className="min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/20" /></Field>
            <Field label="등교중지 종료일"><input type="date" value={values.exclusionEndDate} onChange={(event) => setters.setExclusionEndDate(event.target.value)} className="min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/20" /></Field>
          </div>
          <Field label="비고"><textarea value={values.note} onChange={(event) => setters.setNote(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 py-3 text-sm font-bold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/20" /></Field>
          {submitState.message && <p className={`mt-4 rounded-2xl px-4 py-3 text-sm font-black ${submitState.status === "success" ? "bg-[#F0FBF7] text-[#08754B]" : submitState.status === "submitting" ? "bg-[#EEF4FF] text-[#3154A3]" : "bg-[#FFF7F7] text-[#B42318]"}`}>{submitState.message}</p>}
          <button type="submit" disabled={isSubmitDisabled} className="mt-5 min-h-12 w-full rounded-2xl bg-[#20A982] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(32,169,130,0.22)] transition hover:-translate-y-[1px] hover:bg-[#178C6C] disabled:cursor-not-allowed disabled:opacity-50">{submitState.status === "submitting" ? "제출 중..." : item.buttonLabel || "감염병 발생 보고하기"}</button>
        </form>
      </section>
      <section className="rounded-[30px] border border-[#DDEAE7] bg-white/95 p-6 shadow-[0_18px_48px_rgba(16,32,71,0.07)]">
        <h2 className="text-xl font-black text-[#102047]">{CURRENT_SCHOOL_YEAR}학년도 {CURRENT_SEMESTER}학기 감염병 보고 목록</h2>
        <div className="mt-4"><FirebaseInfectionReportList reports={reports} state={listState} /></div>
      </section>
    </FirebaseV2PageShell>
  );
}

function TeacherClassFields({ values, setters }) {
  const grades = ["1", "2", "3"];
  const classes = Array.from({ length: 12 }, (_, index) => String(index + 1));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="학년"><select value={values.grade} onChange={(event) => setters.setGrade(event.target.value)} className="min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/20"><option value="">선택</option>{grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select></Field>
      <Field label="반"><select value={values.classNo} onChange={(event) => setters.setClassNo(event.target.value)} className="min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-white px-4 text-sm font-bold text-[#102047] outline-none focus:ring-4 focus:ring-[#20A982]/20"><option value="">선택</option>{classes.map((classNo) => <option key={classNo} value={classNo}>{classNo}</option>)}</select></Field>
    </div>
  );
}
