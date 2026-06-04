import { useEffect, useState } from "react";

function isStandaloneMode() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export default function PwaInstallCard() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    setIsInstalled(isStandaloneMode());

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-4 pb-6">
      <div className="rounded-[24px] border border-[#C9DFFF] bg-white p-5 shadow-sm md:flex md:items-center md:justify-between md:gap-6">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-[#D94F70]">앱처럼 사용하기</p>
          <h2 className="mt-2 text-xl font-extrabold text-[#1A3B8B] md:text-2xl">
            홈 화면에 추가하면 더 빠르게 열 수 있어요
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 md:text-base" style={{ wordBreak: "keep-all" }}>
            온라인 보건실은 안내 허브로만 동작하며, 학생 개인정보나 민감정보가 포함된 제출·조회 결과는 기기에 저장하지 않습니다.
          </p>
        </div>
        <div className="mt-4 shrink-0 md:mt-0">
          {installPrompt && !isInstalled ? (
            <button
              type="button"
              onClick={handleInstallClick}
              className="w-full rounded-2xl bg-[#1A3B8B] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-[1px] hover:shadow-md md:w-auto"
            >
              홈 화면에 추가
            </button>
          ) : (
            <p className="rounded-2xl bg-[#EAF3FF] px-4 py-3 text-sm font-bold leading-6 text-[#1A3B8B]" style={{ wordBreak: "keep-all" }}>
              브라우저 공유 메뉴에서 홈 화면에 추가를 선택하세요.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
