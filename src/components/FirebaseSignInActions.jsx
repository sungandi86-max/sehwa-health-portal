import { useEffect, useState } from "react";
import { AUTH_REDIRECT_MESSAGE_EVENT, consumeRedirectAuthMessage } from "../lib/firebaseAuth.js";

export default function FirebaseSignInActions({
  compact = false,
  isWorking,
  message,
  onGoogleSignIn,
  onMicrosoftSignIn,
}) {
  const [redirectMessage, setRedirectMessage] = useState("");
  const buttonClass = compact
    ? "min-h-10 rounded-[10px] px-2 py-2 text-[11px] font-semibold sm:px-3 sm:text-xs"
    : "min-h-12 rounded-2xl px-5 py-3 text-sm font-black";
  const displayMessage = message || redirectMessage;

  const handleMicrosoftClick = () => {
    setRedirectMessage("");
    onMicrosoftSignIn();
  };

  const handleGoogleClick = () => {
    setRedirectMessage("");
    onGoogleSignIn();
  };

  useEffect(() => {
    const pendingMessage = consumeRedirectAuthMessage();
    if (pendingMessage) setRedirectMessage(pendingMessage);

    const handleRedirectMessage = (event) => {
      setRedirectMessage(event.detail?.message || "");
    };

    window.addEventListener(AUTH_REDIRECT_MESSAGE_EVENT, handleRedirectMessage);
    return () => window.removeEventListener(AUTH_REDIRECT_MESSAGE_EVENT, handleRedirectMessage);
  }, []);

  return (
    <div className={`${compact ? "mt-3 space-y-2" : "mt-5 space-y-3"} text-left`}>
      {displayMessage && (
        <p className={`${compact ? "rounded-[10px] px-3 py-2 text-xs font-semibold" : "rounded-2xl px-4 py-3 text-sm font-black"} border border-[#F6D8D8] bg-[#FFF7F7] text-[#B42318]`}>
          {displayMessage}
        </p>
      )}
      <div className={`grid ${compact ? "grid-cols-2 gap-2 lg:grid-cols-1" : "gap-3"}`}>
        <button
          type="button"
          onClick={handleMicrosoftClick}
          disabled={isWorking}
          className={`${buttonClass} bg-[#20A982] text-white ${compact ? "" : "shadow-[0_12px_28px_rgba(32,169,130,0.22)]"} transition hover:-translate-y-[1px] hover:bg-[#178C6C] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {isWorking ? "처리 중..." : "Microsoft Teams로 로그인"}
        </button>
        <button
          type="button"
          onClick={handleGoogleClick}
          disabled={isWorking}
          className={`${buttonClass} border border-[#DDEAE7] bg-white text-[#102047] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Google로 로그인
        </button>
      </div>
    </div>
  );
}
