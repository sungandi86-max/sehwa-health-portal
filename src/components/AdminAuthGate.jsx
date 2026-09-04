import { cloneElement, isValidElement, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "./AdminLayout.jsx";
import FirebaseAdminRoleAccessGate from "./FirebaseAdminRoleAccessGate.jsx";

const ADMIN_AUTH_API = "/api/health-room-status";
const DEV_ADMIN_AUTH_FALLBACK = "https://sehwa-health-portal.vercel.app/api/health-room-status";

async function loadAdminDashboard(firebaseUser) {
  const idToken = await firebaseUser.getIdToken();
  const payload = { action: "verifyAdminMaster" };
  const response = await fetch(ADMIN_AUTH_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });
  const contentType = response.headers.get("content-type") || "";

  if (response.ok && contentType.includes("application/json")) {
    return response.json();
  }

  if (import.meta.env.DEV) {
    const fallbackResponse = await fetch(DEV_ADMIN_AUTH_FALLBACK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });
    return fallbackResponse.json();
  }

  throw new Error(`HTTP ${response.status}`);
}

function AdminReceiptAlert({ alert }) {
  const navigate = useNavigate();
  const totalToday = Number(alert?.totalToday || 0);
  const items = Array.isArray(alert?.items) ? alert.items : [];

  if (totalToday < 1) return null;

  return (
    <section className="mb-4">
      <div className="rounded-[24px] border border-[#A8E6D1] bg-[#F2FBF7] p-4 shadow-sm md:flex md:items-center md:justify-between md:gap-5 md:p-5">
        <div>
          <p className="text-xs font-black text-[#2E7D32]">TODAY RECEIPTS</p>
          <h2 className="mt-1 text-xl font-black text-[#1A3B8B]">
            오늘 신규 접수 {totalToday}건이 있습니다.
          </h2>
          <div className="mt-3 grid gap-2 text-sm font-bold text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl bg-white/80 px-3 py-2">
                <span className="block text-xs text-slate-500">{item.label}</span>
                <span className="text-[#1A3B8B]">{Number(item.todayCount || 0)}건</span>
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate("/admin/receipts")}
          className="mt-4 min-h-11 w-full rounded-2xl bg-[#1A3B8B] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md md:mt-0 md:w-auto"
        >
          접수 현황 확인하기
        </button>
      </div>
    </section>
  );
}

export default function AdminAuthGate({ children }) {
  return (
    <FirebaseAdminRoleAccessGate deniedTitle="관리자 화면 접근 권한이 없습니다.">
      {(adminContext) => <AdminAuthorizedShell adminContext={adminContext}>{children}</AdminAuthorizedShell>}
    </FirebaseAdminRoleAccessGate>
  );
}

function AdminAuthorizedShell({ adminContext, children }) {
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [receiptAlert, setReceiptAlert] = useState(null);
  const [message, setMessage] = useState("");
  const { user, assignment, displayName } = adminContext;

  useEffect(() => {
    let ignore = false;

    loadAdminDashboard(user)
      .then((json) => {
        if (ignore) return;
        if (json?.success === true || json?.result === "success") {
          setReceiptAlert(json?.receiptAlert || null);
          setDashboardSummary(json?.adminDashboard || null);
          setMessage("");
        } else {
          setReceiptAlert(null);
          setDashboardSummary(null);
          setMessage(json?.message || "관리자 요약 정보를 불러올 수 없습니다.");
        }
      })
      .catch((error) => {
        if (ignore) return;
        console.error("[admin-auth] dashboard load failed", error);
        setReceiptAlert(null);
        setDashboardSummary(null);
        setMessage("관리자 요약 정보를 불러오지 못했습니다. 세부 메뉴는 계속 사용할 수 있습니다.");
      });

    return () => {
      ignore = true;
    };
  }, [user]);

  const content = isValidElement(children)
    ? cloneElement(children, {
        adminAssignment: assignment,
        adminDashboard: dashboardSummary,
        adminUser: user,
        adminUserName: displayName,
      })
    : children;

  return (
    <AdminLayout alert={<AdminReceiptAlert alert={receiptAlert} />}>
      {message && (
        <p className="mb-4 rounded-[14px] border border-[#DDEAE7] bg-white px-4 py-3 text-[13px] font-semibold leading-5 text-[#627083]">
          {message}
        </p>
      )}
      {content}
    </AdminLayout>
  );
}
