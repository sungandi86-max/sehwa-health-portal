import { useNavigate } from "react-router-dom";

// Badge component
export function Badge({ children, type = "blue" }) {
  const styles = {
    pink: "bg-[#FFF7F7] text-[#B42318] border-[#F6D8D8]",
    green: "bg-[#F0FBF7] text-[#08754B] border-[#BFEBDC]",
    blue: "bg-[#EEF4FF] text-[#3154A3] border-[#C8D8FF]",
    gray: "bg-[#F8FAFA] text-[#627083] border-[#DDEAE7]"
  };
  return (
    <span className={`inline-flex shrink-0 whitespace-nowrap items-center rounded-[8px] border px-2.5 py-1 text-xs font-semibold ${styles[type] || styles.gray}`}>
      {children}
    </span>
  );
}

// SectionTitle component
export function SectionTitle({ eyebrow, title, description }) {
  return (
    <div className="mb-4">
      {eyebrow && <p className="mb-1.5 text-xs font-semibold text-[#0D4EA6]">{eyebrow}</p>}
      <h2 className="text-xl font-bold text-[#102047] md:text-[1.45rem]">{title}</h2>
      {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-[#627083]">{description}</p>}
    </div>
  );
}

// AppCard component
export function AppCard({ children, className = "" }) {
  return (
    <div className={`min-w-0 rounded-[12px] border border-[#DDEAE7] bg-white p-4 shadow-none ${className}`}>
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

  const btnCls = "mt-4 inline-block w-full rounded-[10px] bg-[#0D4EA6] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#183B8F] md:w-auto";

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
  const sizeClass = size === "lg" ? "h-24 w-24" : "h-10 w-10";
  return (
    <div className={`${sizeClass} shrink-0 overflow-hidden rounded-full border border-[#DDEAE7] bg-white`} aria-label="세화여고 교표">
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
