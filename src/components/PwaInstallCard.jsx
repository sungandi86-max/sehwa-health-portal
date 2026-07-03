import { useEffect, useState } from "react";

function isStandaloneMode() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isAndroidChrome() {
  const userAgent = window.navigator.userAgent;
  return /Android/i.test(userAgent) && /Chrome/i.test(userAgent) && !/EdgA|OPR/i.test(userAgent);
}

export default function PwaInstallCard() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [canUseInstallPrompt, setCanUseInstallPrompt] = useState(false);

  useEffect(() => {
    setIsInstalled(isStandaloneMode());
    setCanUseInstallPrompt(isAndroidChrome());

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
    <section className="mx-auto w-full max-w-6xl px-3 pb-4 sm:px-4 md:pb-5 lg:max-w-[1280px]">
      <details className="group overflow-hidden rounded-[26px] border border-[rgba(120,140,180,0.14)] bg-white/78 shadow-[var(--shh-shadow)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[var(--shh-shadow-hover)]">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-black text-[var(--shh-violet)]">PWA</p>
            <h2 className="text-base font-black text-[#1A3B8B] sm:text-lg">
              모바일에서 앱처럼 사용하기
            </h2>
            <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-600 sm:text-sm" style={{ wordBreak: "keep-all" }}>
              온라인 보건실을 자주 확인하시면 홈 화면에 추가해 더 빠르게 열 수 있습니다.
            </p>
          </div>
          <span className="shrink-0 text-xs font-black text-[var(--shh-primary)] group-open:hidden">자세히 보기</span>
          <span className="hidden shrink-0 text-xs font-black text-[var(--shh-primary)] group-open:inline">접기</span>
        </summary>
        <div className="border-t border-slate-200 px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="grid divide-y divide-slate-200 text-sm leading-6 text-slate-600 md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="py-4 md:pr-4">
              <p className="font-black text-[#1A3B8B]">안드로이드 Chrome</p>
              <p className="mt-1" style={{ wordBreak: "keep-all" }}>
                화면에 앱 설치 또는 홈 화면에 추가 안내가 보이면 선택해 주세요. 안내가 보이지 않으면 Chrome 오른쪽 위 메뉴에서 홈 화면에 추가를 선택해 주세요.
              </p>
            </div>
            <div className="py-4 md:px-4">
              <p className="font-black text-[#1A3B8B]">아이폰 Safari</p>
              <p className="mt-1" style={{ wordBreak: "keep-all" }}>
                공유 버튼을 누른 뒤 홈 화면에 추가를 선택해 주세요.
              </p>
            </div>
            <div className="py-4 md:pl-4">
              <p className="font-black text-[#1A3B8B]">PC Chrome 또는 Edge</p>
              <p className="mt-1" style={{ wordBreak: "keep-all" }}>
                주소창이나 브라우저 메뉴에 설치 아이콘이 보이면 선택해 사용할 수 있습니다.
              </p>
            </div>
          </div>
          <p className="mt-4 rounded-2xl bg-[#FFF5F8] p-4 text-sm font-bold leading-6 text-[#A93859]" style={{ wordBreak: "keep-all" }}>
            이 화면은 교직원용 보건업무 안내 허브이며, 학생 개인정보나 건강정보를 확인하는 공간이 아닙니다.
          </p>
          {canUseInstallPrompt && installPrompt && !isInstalled && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="mt-4 min-h-12 w-full rounded-2xl bg-[var(--shh-primary)] px-5 py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(24,59,143,0.24)] transition hover:-translate-y-[1px] hover:shadow-[0_16px_34px_rgba(24,59,143,0.3)] sm:w-auto"
            >
              앱 설치
            </button>
          )}
        </div>
      </details>
    </section>
  );
}
