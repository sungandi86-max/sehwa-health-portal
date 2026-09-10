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
    <footer className="border-t border-[#DDEAE7] bg-white px-4 py-4 text-center text-xs text-[#627083]">
      <p className="font-semibold text-[#102047]">세화여자고등학교 온라인 보건실</p>
      <p className="mt-1 font-normal">교직원 보건업무 안내 · 제출 · 자료 확인 포털</p>
      <p className="mt-1 text-[11px] font-normal text-[#8A96A8]">© 2026 보건교사 박숙현. All rights reserved.</p>
    </footer>
  );
}
