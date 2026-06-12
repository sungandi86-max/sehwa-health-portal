import { NavLink, useLocation, useNavigate } from "react-router-dom";

const adminMenuItems = [
  { label: "관리자 홈", path: "/admin" },
  { label: "업무 로드맵", path: "/admin/roadmap" },
  { label: "접수 현황", path: "/admin/receipts" },
  { label: "감염병 보고 관리", path: "/admin/infections" },
  { label: "메신저 문구 도우미", path: "/admin/messages" },
];

function isMenuActive(path, currentPath) {
  if (path === "/admin") return currentPath === "/admin";
  if (path === "/admin/infections") {
    return currentPath === "/admin/infections" || currentPath === "/admin/infection-reports";
  }
  return currentPath === path;
}

export default function AdminLayout({ children, alert }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <section className="mx-auto w-full max-w-[1440px] px-3 py-4 sm:px-4 lg:py-6">
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)]">
          <div className="border-b border-slate-100 pb-4">
            <p className="text-xs font-black text-[#D94F70]">ADMIN CONSOLE</p>
            <h2 className="mt-1 text-xl font-black text-[#1A3B8B]">온라인 보건실 관리자</h2>
            <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
              교직원 공개 화면과 분리된 운영 관리 영역입니다.
            </p>
          </div>

          <nav className="mt-4 grid gap-1.5">
            {adminMenuItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => {
                  const active = isActive || isMenuActive(item.path, location.pathname);
                  return `rounded-2xl px-4 py-3 text-sm font-black transition ${
                    active
                      ? "bg-[#1A3B8B] text-white shadow-sm"
                      : "text-slate-600 hover:bg-[#EAF3FF] hover:text-[#1A3B8B]"
                  }`;
                }}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-4 min-h-11 w-full rounded-2xl border border-[#C9DFFF] bg-white px-4 py-3 text-sm font-black text-[#1A3B8B] transition hover:bg-[#EAF3FF]"
          >
            공개 포털로 이동
          </button>
        </aside>

        <main className="min-w-0">
          {alert}
          <div className="min-w-0">{children}</div>
        </main>
      </div>
    </section>
  );
}
