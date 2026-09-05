import { useLocation } from "react-router-dom";

export default function Footer() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const isPublicUpload =
    location.pathname === "/upload" &&
    params.get("mode") === "public" &&
    params.get("type") === "tbreply";

  if (isPublicUpload) return null;

  return (
    <footer className="bg-[#183B8F] px-4 py-5 text-center text-xs text-blue-50">
      <p className="font-semibold">세화여자고등학교 온라인 보건실</p>
      <p className="mt-1 text-blue-100">교직원 보건업무 안내 · 제출 · 자료 확인 포털</p>
      <p className="mt-2 text-[11px] text-blue-200 opacity-60">Copyright 2026. 온라인 보건실. All rights reserved.</p>
    </footer>
  );
}
