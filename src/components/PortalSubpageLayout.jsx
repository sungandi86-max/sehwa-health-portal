import { Link, useNavigate } from "react-router-dom";

const badgeStyles = {
  audience: "border-[#BFEBDC] bg-[#F0FBF7] text-[#08754B]",
  period: "border-[#C8D8FF] bg-[#EEF4FF] text-[#3154A3]",
  status: "border-[#DDEAE7] bg-[#F8FAFA] text-[#627083]",
  warning: "border-[#F5E4B8] bg-[#FFF9EA] text-[#806018]",
  rose: "border-[#F6D8D8] bg-[#FFF7F7] text-[#B42318]",
};

export function PortalPageLayout({ children }) {
  return (
    <section className="min-h-full bg-[#F8FAFA] px-3 py-4 text-[#102047] sm:px-4 sm:py-5">
      <div className="mx-auto w-full max-w-[1280px] space-y-3">
        {children}
      </div>
    </section>
  );
}

export function PortalBackToHome() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate("/")}
      className="inline-flex min-h-10 items-center rounded-[10px] px-3 py-2 text-sm font-semibold text-[#627083] transition hover:bg-white hover:text-[#102047] focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/10"
    >
      ← 메인으로
    </button>
  );
}

export function PortalPageHeader({ label, title, description, identity }) {
  return (
    <header className="rounded-[16px] border border-[#DDEAE7] bg-white p-4 shadow-[0_8px_24px_rgba(16,32,71,0.04)] sm:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-[#0D4EA6]">{label}</p>
          <h1 className="mt-1 text-[22px] font-bold leading-tight text-[#102047] sm:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-3xl text-sm font-normal leading-6 text-[#627083]" style={{ wordBreak: "keep-all" }}>
              {description}
            </p>
          )}
        </div>
        {identity && (
          <div className="shrink-0 rounded-[12px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2.5 md:min-w-64">
            {identity}
          </div>
        )}
      </div>
    </header>
  );
}

export function PortalBadge({ children, tone = "status" }) {
  if (!children) return null;

  return (
    <span className={`inline-flex shrink-0 items-center rounded-[8px] border px-2.5 py-1 text-xs font-semibold ${badgeStyles[tone] || badgeStyles.status}`}>
      {children}
    </span>
  );
}

export function PortalInfoBox({ children, className = "" }) {
  if (!children) return null;

  return (
    <div className={`rounded-[12px] border border-[#DDEAE7] bg-[#F8FAFA] p-3 text-sm font-normal leading-6 text-[#627083] ${className}`}>
      {children}
    </div>
  );
}

export function PortalNoticeBox({ children }) {
  if (!children) return null;

  return (
    <div className="rounded-[12px] border border-[#F5E4B8] bg-[#FFF9EA] p-3 text-sm font-semibold leading-6 text-[#806018]">
      {children}
    </div>
  );
}

export function PortalAction({ children, href, onClick, disabled = false, variant = "primary", external = false }) {
  const baseClass =
    "inline-flex min-h-10 w-full items-center justify-center rounded-[10px] px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-4";
  const variantClass = disabled
    ? "cursor-not-allowed border border-[#DDEAE7] bg-[#F1F4F7] text-[#8A96A8] focus:ring-[#DDEAE7]/60"
    : variant === "secondary"
      ? "border border-[#C8D8FF] bg-white text-[#0D4EA6] hover:border-[#0D4EA6] hover:bg-[#F8FAFF] focus:ring-[#0D4EA6]/10"
      : "border border-[#0D4EA6] bg-[#0D4EA6] text-white hover:border-[#183B8F] hover:bg-[#183B8F] focus:ring-[#0D4EA6]/15";

  if (disabled || !href) {
    return (
      <button type="button" onClick={onClick} disabled={disabled || !onClick} className={`${baseClass} ${variantClass}`}>
        {children}
      </button>
    );
  }

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={`${baseClass} ${variantClass}`}>
        {children}
      </a>
    );
  }

  return (
    <Link to={href} className={`${baseClass} ${variantClass}`}>
      {children}
    </Link>
  );
}

export function PortalTaskCard({ badges, title, description, children, action }) {
  return (
    <article className="flex min-h-[232px] flex-col rounded-[16px] border border-[#DDEAE7] bg-white p-4 shadow-[0_8px_24px_rgba(16,32,71,0.04)]">
      {badges && <div className="mb-3 flex flex-wrap gap-2">{badges}</div>}
      <h2 className="text-base font-semibold leading-6 text-[#102047]">{title}</h2>
      {description && (
        <p className="mt-1.5 text-sm font-normal leading-6 text-[#627083]" style={{ wordBreak: "keep-all" }}>
          {description}
        </p>
      )}
      {children && <div className="mt-3 space-y-3">{children}</div>}
      {action && <div className="mt-auto pt-4">{action}</div>}
    </article>
  );
}

export function PortalTaskRow({
  icon,
  title,
  description,
  status,
  meta,
  details,
  action,
}) {
  return (
    <article className="rounded-[12px] border border-[#DDEAE7] bg-white px-3.5 py-3 transition hover:border-[#C8D8FF] hover:bg-[#FCFDFE] sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          {icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#C8D8FF] bg-[#EEF4FF] text-sm font-bold text-[#0D4EA6]">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-6 text-[#102047]">{title}</h2>
            {description && (
              <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-[#627083]" style={{ wordBreak: "keep-all" }}>
                {description}
              </p>
            )}
            {meta && (
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium leading-5 text-[#627083]">
                {meta}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {status && (
            <span className="inline-flex min-h-7 items-center rounded-[8px] border border-[#DDEAE7] bg-[#F8FAFA] px-2.5 text-xs font-semibold text-[#627083]">
              {status}
            </span>
          )}
          {action}
        </div>
      </div>
      {details && (
        <div className="mt-2 border-t border-[#EEF3F1] pt-2 text-xs leading-5 text-[#627083]">
          {details}
        </div>
      )}
    </article>
  );
}
