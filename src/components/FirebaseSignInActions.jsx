export default function FirebaseSignInActions({
  isWorking,
  message,
  onGoogleSignIn,
  onMicrosoftSignIn,
}) {
  return (
    <div className="mt-5 space-y-3 text-left">
      {message && (
        <p className="rounded-2xl border border-[#F6D8D8] bg-[#FFF7F7] px-4 py-3 text-sm font-black text-[#B42318]">
          {message}
        </p>
      )}
      <div className="grid gap-3">
        <button
          type="button"
          onClick={onMicrosoftSignIn}
          disabled={isWorking}
          className="min-h-12 rounded-2xl bg-[#20A982] px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_rgba(32,169,130,0.22)] transition hover:-translate-y-[1px] hover:bg-[#178C6C] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isWorking ? "처리 중..." : "Microsoft Teams로 로그인"}
        </button>
        <button
          type="button"
          onClick={onGoogleSignIn}
          disabled={isWorking}
          className="min-h-12 rounded-2xl border border-[#DDEAE7] bg-white px-5 py-3 text-sm font-black text-[#102047] transition hover:-translate-y-[1px] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Google로 로그인
        </button>
      </div>
    </div>
  );
}
