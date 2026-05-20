import { useNavigate } from "react-router-dom";

// Badge component
export function Badge({ children, type = "blue" }) {
  const styles = {
    pink: "bg-[#FDEAF0] text-[#D94F70] border-[#F7C9D6]",
    green: "bg-[#E8F6EE] text-[#2E7D32] border-[#BFE6CB]",
    blue: "bg-[#EAF3FF] text-[#1A3B8B] border-[#C9DFFF]",
    gray: "bg-slate-100 text-slate-600 border-slate-200"
  };
  return (
    <span className={`inline-flex shrink-0 whitespace-nowrap items-center rounded-full border px-3 py-1 text-xs font-bold ${styles[type] || styles.gray}`}>
      {children}
    </span>
  );
}

// SectionTitle component
export function SectionTitle({ eyebrow, title, description }) {
  return (
    <div className="mb-5">
      {eyebrow && <p className="mb-2 text-sm font-bold text-[#D94F70]">{eyebrow}</p>}
      <h2 className="text-2xl font-extrabold tracking-tight text-[#1A3B8B] md:text-3xl">{title}</h2>
      {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">{description}</p>}
    </div>
  );
}

// AppCard component
export function AppCard({ children, className = "" }) {
  return (
    <div className={`min-w-0 rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// SafeText component
export function SafeText({ children, className = "" }) {
  return (
    <span className={className} style={{ wordBreak: "keep-all", overflowWrap: "normal" }}>
      {children}
    </span>
  );
}

// URL이 실제 링크인지 판별
export function isValidUrl(url) {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  // 임시 텍스트 목록
  const PLACEHOLDER = [
    "링크", "안내문 링크", "유튜브 링크", "url", "http", "준비 중", "추후 안내",
    "#", "/"
  ];
  if (PLACEHOLDER.some(p => trimmed.toLowerCase() === p.toLowerCase())) return false;
  return trimmed.startsWith("https://") || trimmed.startsWith("http://");
}

// 버튼 텍스트 → 이동 경로 매핑
const SECTION_BUTTON_MAP = {
  "자료실 열기": "/resources",
  "자료실로 이동": "/resources",
  "제출·업로드 센터": "/upload",
  "업로드 센터": "/upload",
  "제출하기": "/upload",
};

// 섹션 ID → 경로 매핑 (scrollTarget용)
const SECTION_ID_TO_ROUTE = {
  today: "/today",
  upload: "/upload",
  checkup: "/checkup",
  education: "/education",
  homeroom: "/homeroom",
  studentCare: "/student-care",
  resources: "/resources",
  faq: "/faq",
};

// PrimaryButton: url 유효 → 새 창 / 내부이동 텍스트 → 페이지 이동 / 그 외 → 숨김
export function PrimaryButton({ children, url, scrollTarget }) {
  const navigate = useNavigate();

  if (!children || children === "") return null;

  const btnCls = "mt-4 inline-block w-full rounded-2xl bg-[#1A3B8B] px-5 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md md:w-auto";

  // 1) 명시적 scrollTarget → 해당 페이지로 이동
  if (scrollTarget) {
    const route = SECTION_ID_TO_ROUTE[scrollTarget] || "/";
    return (
      <button onClick={() => navigate(route)} className={btnCls}>
        {children}
      </button>
    );
  }

  // 2) 버튼 텍스트가 내부 이동 목적인지 확인
  const inferredRoute = SECTION_BUTTON_MAP[String(children).trim()];
  if (inferredRoute) {
    return (
      <button onClick={() => navigate(inferredRoute)} className={btnCls}>
        {children}
      </button>
    );
  }

  // 3) 유효한 외부 URL이면 새 창
  if (isValidUrl(url)) {
    return (
      <a
        href={url.trim()}
        target="_blank"
        rel="noopener noreferrer"
        className={btnCls}
      >
        {children}
      </a>
    );
  }

  // 4) URL 없음/임시값 → 버튼 숨김
  return null;
}

// SchoolEmblem SVG
export function SchoolEmblem({ size = "md" }) {
  const sizeClass = size === "lg" ? "h-28 w-28" : "h-11 w-11";
  return (
    <div className={`${sizeClass} shrink-0 overflow-hidden rounded-full bg-white shadow-sm`} aria-label="세화여고 교표">
      <svg viewBox="0 0 100 100" className="h-full w-full" role="img">
        <circle cx="50" cy="50" r="49" fill="#0D4EA6" />
        <circle cx="50" cy="50" r="42" fill="none" stroke="white" strokeWidth="3.5" />
        <circle cx="50" cy="22" r="8" fill="white" />
        <path
          d="M20 40 H41 C46 40 49 42 50 46 C51 42 54 40 59 40 H80 V62 H58 C53 62 50 65 50 69 C50 65 47 62 42 62 H20 Z"
          fill="white"
        />
        <text
          x="50"
          y="84"
          textAnchor="middle"
          fontSize="15"
          fontWeight="800"
          fill="white"
          fontFamily="serif"
          letterSpacing="1.5"
        >
          世和
        </text>
      </svg>
    </div>
  );
}

// Utility function
export function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
