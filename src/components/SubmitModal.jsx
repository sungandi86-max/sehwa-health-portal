import { useEffect, useRef, useState } from "react";

const SCRIPT_URL = "/api/submit";
const GAS_URL = "https://script.google.com/macros/s/AKfycbxuO7QSiuGGBH5IngMlpMqpZvDhs-mpQhcrYa1SD40gB5gewx-Gs5EUHfuZX0eRDr68/exec";

const FOLDER_IDS = {
  cpr: "19foLN446v5ggGN6hxLBuH8tNAQuSXgtM",
  tb: "1MfxNVL1muROzpi1ZbV7WDWr4SKMU7ghm",
  other: "1T2yMxeKmab1SDqdVCRgdxpHMx3Fu2EO6",
};

const STAFF_TYPES = ["교사", "강사", "행정직원"];
const DEPT_TYPES = ["교무교육과정부", "진로진학홍보부", "연구정보부", "창의인성부", "생활안전부", "1학년부", "2학년부", "3학년부", "행정실", "관리자"];
const TB_DOC_TYPES = ["결핵검진 확인증", "흉부 X-ray 확인 자료", "기타 동등 자료"];

// ───────── 공통 입력 필드 스타일 ─────────
const inputCls =
  "w-full rounded-2xl border border-slate-200 bg-[#F7F9FC] px-4 py-3 text-sm text-[#263238] outline-none transition focus:border-[#1A3B8B] focus:ring-2 focus:ring-[#1A3B8B]/10 placeholder:text-slate-400";
const labelCls = "mb-1.5 block text-sm font-bold text-[#263238]";
const selectCls = inputCls + " cursor-pointer appearance-none";

function Field({ label, required, children }) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {required && <span className="ml-1 text-[#D94F70]">*</span>}
      </label>
      {children}
    </div>
  );
}

// ───────── 파일 업로드 영역 ─────────
function FileUploadArea({ file, onChange, error }) {
  const inputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) onChange(f);
  };

  return (
    <div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition
          ${file ? "border-[#1A3B8B] bg-[#EAF3FF]" : "border-slate-200 bg-[#F7F9FC] hover:border-[#1A3B8B]/50"}
          ${error ? "border-[#D94F70] bg-[#FDEAF0]" : ""}`}
      >
        <span className="text-2xl">{file ? "📎" : "📁"}</span>
        {file ? (
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#1A3B8B]">{file.name}</p>
            <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        ) : (
          <>
            <p className="text-sm font-bold text-slate-600">파일을 여기에 드래그하거나 클릭해서 선택</p>
            <p className="text-xs text-slate-400">PDF · JPG · PNG / 최대 10MB</p>
          </>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs font-bold text-[#D94F70]">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => onChange(e.target.files[0])}
      />
      {file && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-2 text-xs text-slate-400 underline hover:text-[#D94F70]"
        >
          파일 제거
        </button>
      )}
    </div>
  );
}

// ───────── 파일 → base64 변환 ─────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ───────── 오늘 날짜 YYYYMMDD ─────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// ───────── 심폐소생술 이수증 폼 ─────────
function CprForm({ onSubmit, submitting }) {
  const [form, setForm] = useState({
    name: "", dept: "", completionDate: ""
  });
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "성명을 입력해주세요.";
    if (!form.dept.trim()) e.dept = "소속/부서를 입력해주세요.";
    if (!form.completionDate) e.completionDate = "이수일자를 선택해주세요.";
    if (!file) e.file = "파일을 첨부해주세요.";
    else if (file.size > 10 * 1024 * 1024) e.file = "파일 크기가 10MB를 초과합니다.";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const base64 = await fileToBase64(file);
    const ext = file.name.split(".").pop();
    const fileName = `${form.name}_심폐소생술이수증_${todayStr()}.${ext}`;

    await onSubmit({
      type: "cpr",
      sheetName: "응답_심폐소생술이수증",
      folderId: FOLDER_IDS.cpr,
      fields: { ...form },
      fileName,
      fileBase64: base64,
      fileMimeType: file.type,
    });
  };

  return (
    <div className="space-y-4">
      <Field label="성명" required>
        <input className={inputCls} placeholder="홍길동" value={form.name} onChange={set("name")} />
        {errors.name && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.name}</p>}
      </Field>
      <Field label="소속/부서" required>
        <select className={selectCls} value={form.dept} onChange={set("dept")}>
          <option value="">선택해주세요</option>
          {DEPT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        {errors.dept && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.dept}</p>}
      </Field>
      <Field label="이수일자" required>
        <input type="date" className={inputCls} value={form.completionDate} onChange={set("completionDate")} />
        {errors.completionDate && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.completionDate}</p>}
      </Field>
      <Field label="이수증 파일 업로드" required>
        <FileUploadArea file={file} onChange={setFile} error={errors.file} />
        <p className="mt-1.5 text-xs text-slate-400">권장 파일명: 성명_심폐소생술이수증</p>
      </Field>
      <SubmitButton onClick={handleSubmit} submitting={submitting} />
    </div>
  );
}

// ───────── 결핵검진 확인증 폼 ─────────
function TbForm({ onSubmit, submitting }) {
  const [form, setForm] = useState({
    name: "", dept: "", checkupDate: ""
  });
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "성명을 입력해주세요.";
    if (!form.dept.trim()) e.dept = "소속/부서를 입력해주세요.";
    if (!form.checkupDate) e.checkupDate = "검진일자를 선택해주세요.";
    if (!file) e.file = "파일을 첨부해주세요.";
    else if (file.size > 10 * 1024 * 1024) e.file = "파일 크기가 10MB를 초과합니다.";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const base64 = await fileToBase64(file);
    const ext = file.name.split(".").pop();
    const fileName = `${form.name}_결핵검진확인증_${todayStr()}.${ext}`;

    await onSubmit({
      type: "tb",
      sheetName: "응답_결핵검진확인증",
      folderId: FOLDER_IDS.tb,
      fields: { ...form },
      fileName,
      fileBase64: base64,
      fileMimeType: file.type,
    });
  };

  return (
    <div className="space-y-4">
      <Field label="성명" required>
        <input className={inputCls} placeholder="홍길동" value={form.name} onChange={set("name")} />
        {errors.name && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.name}</p>}
      </Field>
      <Field label="소속/부서" required>
        <select className={selectCls} value={form.dept} onChange={set("dept")}>
          <option value="">선택해주세요</option>
          {DEPT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        {errors.dept && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.dept}</p>}
      </Field>
      <Field label="검진일자" required>
        <input type="date" className={inputCls} value={form.checkupDate} onChange={set("checkupDate")} />
        {errors.checkupDate && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.checkupDate}</p>}
      </Field>
      <Field label="확인증 파일 업로드" required>
        <div className="mb-3 rounded-2xl bg-[#EAF3FF] p-4 text-sm leading-6 text-[#1A3B8B]">
          <p>결핵검진 확인증 또는 흉부 X-ray 검진 확인 자료를 업로드해주세요.</p>
          <p className="mt-1 font-semibold">확인 필요 항목: 성명, 검진일자, 검진 항목</p>
        </div>
        <FileUploadArea file={file} onChange={setFile} error={errors.file} />
      </Field>
      <SubmitButton onClick={handleSubmit} submitting={submitting} />
    </div>
  );
}

// ───────── 채용검진 대체 인정 확인 요청 폼 ─────────
function RecruitForm({ onSubmit, submitting }) {
  const [form, setForm] = useState({
    name: "", dept: "", adminSubmitted: "", submitPeriod: "", note: ""
  });
  const [errors, setErrors] = useState({});

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "성명을 입력해주세요.";
    if (!form.dept.trim()) e.dept = "소속/부서를 입력해주세요.";
    if (!form.adminSubmitted) e.adminSubmitted = "행정실 제출 여부를 선택해주세요.";
    if (!form.submitPeriod.trim()) e.submitPeriod = "제출 시기를 입력해주세요.";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    await onSubmit({
      type: "recruit",
      sheetName: "응답_채용검진확인요청",
      folderId: null,
      fields: { ...form },
      fileName: null,
      fileBase64: null,
      fileMimeType: null,
    });
  };

  return (
    <div className="space-y-4">
      {/* 안내 박스 */}
      <div className="rounded-2xl bg-[#EAF3FF] p-4 text-sm leading-6 text-[#1A3B8B]">
        <p className="font-bold mb-1">📋 파일 제출 없이 확인 요청만 접수합니다.</p>
        <p>채용검진 결과지 전체에는 보건 업무 목적과 직접 관련 없는 건강정보가 포함될 수 있으므로, 보건실에서는 파일을 받지 않습니다.</p>
        <p className="mt-2 font-semibold">보건실에서는 흉부 X-ray 검진일자 확인만 필요합니다.</p>
      </div>

      <Field label="성명" required>
        <input className={inputCls} placeholder="홍길동" value={form.name} onChange={set("name")} />
        {errors.name && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.name}</p>}
      </Field>
      <Field label="소속/부서" required>
        <select className={selectCls} value={form.dept} onChange={set("dept")}>
          <option value="">선택해주세요</option>
          {DEPT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        {errors.dept && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.dept}</p>}
      </Field>
      <Field label="행정실 제출 여부" required>
        <select className={selectCls} value={form.adminSubmitted} onChange={set("adminSubmitted")}>
          <option value="">선택해주세요</option>
          <option>제출 완료</option>
          <option>제출 예정</option>
          <option>미제출</option>
        </select>
        {errors.adminSubmitted && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.adminSubmitted}</p>}
      </Field>
      <Field label="제출 시기" required>
        <input
          className={inputCls}
          placeholder="예) 2025년 3월 채용 시, 올해 4월"
          value={form.submitPeriod}
          onChange={set("submitPeriod")}
        />
        {errors.submitPeriod && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.submitPeriod}</p>}
      </Field>
      <Field label="비고 (선택)">
        <textarea
          className={inputCls + " resize-none"}
          rows={3}
          placeholder="추가로 전달할 내용이 있으면 입력해주세요."
          value={form.note}
          onChange={set("note")}
        />
      </Field>
      <SubmitButton onClick={handleSubmit} submitting={submitting} />
    </div>
  );
}

// ───────── 기타 보건 자료 폼 ─────────
function OtherForm({ onSubmit, submitting }) {
  const [form, setForm] = useState({ name: "", dept: "", staffType: "", note: "" });
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "성명을 입력해주세요.";
    if (!form.dept.trim()) e.dept = "소속/부서를 입력해주세요.";
    if (!form.staffType) e.staffType = "교직원 구분을 선택해주세요.";
    if (!file) e.file = "파일을 첨부해주세요.";
    else if (file.size > 10 * 1024 * 1024) e.file = "파일 크기가 10MB를 초과합니다.";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    const base64 = await fileToBase64(file);
    const ext = file.name.split(".").pop();
    const fileName = `${form.name}_기타보건자료_${todayStr()}.${ext}`;

    await onSubmit({
      type: "other",
      sheetName: "응답_기타보건자료",
      folderId: FOLDER_IDS.other,
      fields: { ...form },
      fileName,
      fileBase64: base64,
      fileMimeType: file.type,
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[#F7F9FC] p-4 text-sm leading-6 text-slate-600">
        보건실에서 별도로 안내받은 자료를 제출하는 메뉴입니다. 안내받지 않은 자료는 제출하지 않아도 됩니다.
      </div>
      <Field label="성명" required>
        <input className={inputCls} placeholder="홍길동" value={form.name} onChange={set("name")} />
        {errors.name && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.name}</p>}
      </Field>
      <Field label="소속/부서" required>
        <select className={selectCls} value={form.dept} onChange={set("dept")}>
          <option value="">선택해주세요</option>
          {DEPT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        {errors.dept && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.dept}</p>}
      </Field>
      <Field label="교직원 구분" required>
        <select className={selectCls} value={form.staffType} onChange={set("staffType")}>
          <option value="">선택해주세요</option>
          {STAFF_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        {errors.staffType && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.staffType}</p>}
      </Field>
      <Field label="비고 (선택)">
        <textarea
          className={inputCls + " resize-none"}
          rows={3}
          placeholder="제출 자료에 대한 설명이나 전달 사항을 입력해주세요."
          value={form.note}
          onChange={set("note")}
        />
      </Field>
      <Field label="자료 파일 업로드" required>
        <FileUploadArea file={file} onChange={setFile} error={errors.file} />
      </Field>
      <SubmitButton onClick={handleSubmit} submitting={submitting} />
    </div>
  );
}

// ───────── 제출 버튼 ─────────
function SubmitButton({ onClick, submitting }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={submitting}
      className={`w-full rounded-2xl px-5 py-4 text-sm font-black text-white shadow-sm transition
        ${submitting
          ? "cursor-not-allowed bg-slate-300"
          : "bg-[#1A3B8B] hover:-translate-y-[1px] hover:shadow-md active:translate-y-0"
        }`}
    >
      {submitting ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" />
            <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          제출 중...
        </span>
      ) : (
        "제출하기"
      )}
    </button>
  );
}

// ───────── 교직원 결핵검진 유형 선택 폼 ─────────
const TB_REGISTRATION_TYPES = [
  "학교 단체검진 희망",
  "개별 결핵검진 예정",
  "건강검진/공단검진으로 대체 예정",
  "채용검진 대체 확인 요청",
];

function TbRegistrationForm({ onSubmit, submitting }) {
  const [configState, setConfigState] = useState("loading"); // loading | open | not-started | closed
  const [closedMessage, setClosedMessage] = useState("");
  const [form, setForm] = useState({ name: "", dept: "", registrationType: "" });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    fetch(`${GAS_URL}?action=getTbConfig`)
      .then((r) => r.json())
      .then(({ result, config }) => {
        if (result !== "success") {
          setClosedMessage("설정을 불러오지 못했습니다.");
          setConfigState("closed");
          return;
        }
        if (config.enabled === "FALSE") {
          setClosedMessage(config.closedMessage || "접수가 마감되었습니다.");
          setConfigState("closed");
          return;
        }
        const now = new Date();
        if (config.endDate) {
          const end = new Date(config.endDate);
          if (now > end) {
            setClosedMessage(config.closedMessage || "접수 기한이 지났습니다.");
            setConfigState("closed");
            return;
          }
        }
        if (config.startDate) {
          const start = new Date(config.startDate);
          if (now < start) {
            setConfigState("not-started");
            return;
          }
        }
        setConfigState("open");
      })
      .catch(() => {
        setClosedMessage("설정을 불러오지 못했습니다.");
        setConfigState("closed");
      });
  }, []);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "성명을 입력해주세요.";
    if (!form.dept) e.dept = "소속/부서를 선택해주세요.";
    if (!form.registrationType) e.registrationType = "검진 유형을 선택해주세요.";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    await onSubmit({
      sheetName: "응답_교직원결핵검진유형선택",
      folderId: null,
      fields: { name: form.name, dept: form.dept, registrationType: form.registrationType },
      fileName: null,
      fileBase64: null,
      fileMimeType: null,
    });
  };

  if (configState === "loading") {
    return (
      <div className="flex items-center justify-center py-10">
        <svg className="h-6 w-6 animate-spin text-[#1A3B8B]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    );
  }

  if (configState === "not-started") {
    return (
      <div className="rounded-2xl bg-[#EAF3FF] p-4 text-sm leading-6 text-[#1A3B8B]">
        아직 접수 기간이 아닙니다.
      </div>
    );
  }

  if (configState === "closed") {
    return (
      <div className="rounded-2xl bg-[#EAF3FF] p-4 text-sm leading-6 text-[#1A3B8B]">
        {closedMessage}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[#EAF3FF] p-4 text-sm leading-6 text-[#1A3B8B]">
        건강정보나 검진 결과지는 제출하지 않습니다. 교직원 결핵검진 진행 유형만 선택해 제출해주세요.
      </div>
      <Field label="성명" required>
        <input className={inputCls} placeholder="홍길동" value={form.name} onChange={set("name")} />
        {errors.name && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.name}</p>}
      </Field>
      <Field label="소속/부서" required>
        <select className={selectCls} value={form.dept} onChange={set("dept")}>
          <option value="">선택해주세요</option>
          {DEPT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        {errors.dept && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.dept}</p>}
      </Field>
      <Field label="검진 유형" required>
        <div className="space-y-2">
          {TB_REGISTRATION_TYPES.map((rt) => (
            <label key={rt} className="flex cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="registrationType"
                value={rt}
                checked={form.registrationType === rt}
                onChange={set("registrationType")}
                className="h-4 w-4 accent-[#1A3B8B]"
              />
              <span className="text-sm text-[#263238]">{rt}</span>
            </label>
          ))}
        </div>
        {errors.registrationType && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.registrationType}</p>}
      </Field>
      <SubmitButton onClick={handleSubmit} submitting={submitting} />
    </div>
  );
}

// ───────── 인바디 측정 신청 폼 ─────────
const INBODY_TIME_SLOTS = [
  "오전1 (08:00~10:00)",
  "오전2 (10:00~11:00)",
  "오후1 (12:00~14:00)",
  "오후2 (14:00~16:00)",
];

function InbodyRegistrationForm({ onSubmit, submitting }) {
  const [form, setForm] = useState({ name: "", dept: "", preferredDate: "", preferredTime: "" });
  const [errors, setErrors] = useState({});

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "성명을 입력해주세요.";
    if (!form.dept) e.dept = "소속/부서를 선택해주세요.";
    if (!form.preferredDate) e.preferredDate = "희망 날짜를 선택해주세요.";
    if (!form.preferredTime) e.preferredTime = "희망 시간대를 선택해주세요.";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    await onSubmit({
      sheetName: "응답_인바디측정신청",
      folderId: null,
      fields: { name: form.name, dept: form.dept, preferredDate: form.preferredDate, preferredTime: form.preferredTime },
      fileName: null,
      fileBase64: null,
      fileMimeType: null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[#EAF3FF] p-4 text-sm leading-6 text-[#1A3B8B]">
        매월 보건실에서 운영하는 인바디 체성분 측정 신청입니다.
      </div>
      <Field label="성명" required>
        <input className={inputCls} placeholder="홍길동" value={form.name} onChange={set("name")} />
        {errors.name && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.name}</p>}
      </Field>
      <Field label="소속/부서" required>
        <select className={selectCls} value={form.dept} onChange={set("dept")}>
          <option value="">선택해주세요</option>
          {DEPT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        {errors.dept && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.dept}</p>}
      </Field>
      <Field label="희망 날짜" required>
        <input type="date" className={inputCls} value={form.preferredDate} onChange={set("preferredDate")} />
        {errors.preferredDate && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.preferredDate}</p>}
      </Field>
      <Field label="희망 시간대" required>
        <div className="space-y-2">
          {INBODY_TIME_SLOTS.map((slot) => (
            <label key={slot} className="flex cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="preferredTime"
                value={slot}
                checked={form.preferredTime === slot}
                onChange={set("preferredTime")}
                className="h-4 w-4 accent-[#1A3B8B]"
              />
              <span className="text-sm text-[#263238]">{slot}</span>
            </label>
          ))}
        </div>
        {errors.preferredTime && <p className="mt-1 text-xs font-bold text-[#D94F70]">{errors.preferredTime}</p>}
      </Field>
      <SubmitButton onClick={handleSubmit} submitting={submitting} />
    </div>
  );
}

// ───────── 모달 타입 → 제목 ─────────
const MODAL_META = {
  cpr: { title: "심폐소생술 이수증 제출", icon: "💚", color: "text-[#2E7D32]" },
  tb: { title: "결핵검진 확인증 제출", icon: "🩺", color: "text-[#1A3B8B]" },
  recruit: { title: "채용검진 대체 인정 확인 요청", icon: "📋", color: "text-[#1A3B8B]" },
  other: { title: "기타 보건 관련 자료 제출", icon: "📂", color: "text-slate-600" },
  tb_registration: { title: "교직원 결핵검진 유형 선택", icon: "🫁", color: "text-[#1A3B8B]" },
  inbody: { title: "인바디 측정 신청", icon: "⚖️", color: "text-[#1A3B8B]" },
};

// ───────── 메인 모달 컴포넌트 ─────────
export default function SubmitModal({ type, onClose }) {
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const overlayRef = useRef(null);
  const meta = MODAL_META[type] || {};

  // 배경 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ESC 닫기
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async (payload) => {
    setStatus("submitting");
    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.status === "success") {
        setStatus("success");
      } else {
        throw new Error(json.message || "unknown error");
      }
    } catch (err) {
      setStatus("error");
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[32px] bg-white shadow-2xl sm:rounded-[32px]">
        {/* 헤더 */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className={`text-xl font-black ${meta.color}`}>
              {meta.icon} {meta.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        {/* 바디 */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {status === "success" ? (
            <SuccessView onClose={onClose} />
          ) : status === "error" ? (
            <ErrorView onRetry={() => setStatus("idle")} onClose={onClose} />
          ) : (
            <>
              {type === "cpr" && <CprForm onSubmit={handleSubmit} submitting={status === "submitting"} />}
              {type === "tb" && <TbForm onSubmit={handleSubmit} submitting={status === "submitting"} />}
              {type === "recruit" && <RecruitForm onSubmit={handleSubmit} submitting={status === "submitting"} />}
              {type === "other" && <OtherForm onSubmit={handleSubmit} submitting={status === "submitting"} />}
              {type === "tb_registration" && <TbRegistrationForm onSubmit={handleSubmit} submitting={status === "submitting"} />}
              {type === "inbody" && <InbodyRegistrationForm onSubmit={handleSubmit} submitting={status === "submitting"} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SuccessView({ onClose }) {
  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#DFF4EC]">
        <span className="text-4xl">✅</span>
      </div>
      <div>
        <p className="text-xl font-black text-[#263238]">제출 완료</p>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          제출이 완료되었습니다.<br />보건실 확인까지 시간이 소요될 수 있습니다.
        </p>
      </div>
      <button
        onClick={onClose}
        className="w-full max-w-xs rounded-2xl bg-[#1A3B8B] px-5 py-3 text-sm font-bold text-white shadow-sm"
      >
        닫기
      </button>
    </div>
  );
}

function ErrorView({ onRetry, onClose }) {
  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FDEAF0]">
        <span className="text-4xl">⚠️</span>
      </div>
      <div>
        <p className="text-xl font-black text-[#D94F70]">제출 오류</p>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          제출 중 오류가 발생했습니다.<br />파일 용량 또는 네트워크 상태를 확인해주세요.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button
          onClick={onRetry}
          className="w-full rounded-2xl bg-[#1A3B8B] px-5 py-3 text-sm font-bold text-white shadow-sm"
        >
          다시 시도
        </button>
        <button
          onClick={onClose}
          className="w-full rounded-2xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-600"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
