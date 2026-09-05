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
    <section className="mx-auto w-full max-w-6xl px-3 pb-2 sm:px-4 lg:max-w-[1280px]">
      <details className="group overflow-hidden rounded-[12px] border border-[#DDEAE7] bg-white transition hover:border-[#BFEBDC]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-1.5 marker:content-none sm:gap-3 sm:px-4 sm:py-2">
          <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
            <h2 className="text-sm font-bold leading-5 text-[#102047]">
              모바일에서 앱처럼 사용하기
            </h2>
            <p className="truncate text-xs font-medium text-[#627083]" style={{ wordBreak: "keep-all" }}>
              자주 사용하는 경우 홈 화면에 추가해 빠르게 열 수 있습니다.
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-[#08754B] group-open:hidden">자세히 보기 →</span>
          <span className="hidden shrink-0 text-xs font-semibold text-[#08754B] group-open:inline">접기</span>
        </summary>
        <div className="border-t border-[#DDEAE7] px-3 pb-3 sm:px-4">
          <div className="grid divide-y divide-[#DDEAE7] text-xs leading-5 text-[#627083] md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="py-3 md:pr-4">
              <p className="font-bold text-[#102047]">안드로이드 Chrome</p>
              <p className="mt-1" style={{ wordBreak: "keep-all" }}>
                화면에 앱 설치 또는 홈 화면에 추가 안내가 보이면 선택해 주세요. 안내가 보이지 않으면 Chrome 오른쪽 위 메뉴에서 홈 화면에 추가를 선택해 주세요.
              </p>
            </div>
            <div className="py-3 md:px-4">
              <p className="font-bold text-[#102047]">아이폰 Safari</p>
              <p className="mt-1" style={{ wordBreak: "keep-all" }}>
                공유 버튼을 누른 뒤 홈 화면에 추가를 선택해 주세요.
              </p>
            </div>
            <div className="py-3 md:pl-4">
              <p className="font-bold text-[#102047]">PC Chrome 또는 Edge</p>
              <p className="mt-1" style={{ wordBreak: "keep-all" }}>
                주소창이나 브라우저 메뉴에 설치 아이콘이 보이면 선택해 사용할 수 있습니다.
              </p>
            </div>
          </div>
          <p className="mt-2 rounded-[8px] border border-[#F6D8D8] bg-[#FFF7F7] px-3 py-2 text-xs font-semibold leading-5 text-[#B42318]" style={{ wordBreak: "keep-all" }}>
            이 화면은 교직원용 보건업무 안내 허브이며, 학생 개인정보나 건강정보를 확인하는 공간이 아닙니다.
          </p>
          {canUseInstallPrompt && installPrompt && !isInstalled && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="mt-3 min-h-10 w-full rounded-[9px] bg-[#20A982] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#178C6C] sm:w-auto"
            >
              앱 설치
            </button>
          )}
        </div>
      </details>
    </section>
  );
}
