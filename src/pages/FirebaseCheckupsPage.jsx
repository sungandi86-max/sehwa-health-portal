import { useEffect, useState } from "react";
import FirebaseV2AccessGate from "../components/FirebaseV2AccessGate.jsx";
import { FirebaseContentState, FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { getActiveCheckups } from "../lib/checkups.js";
import { formatContentEndDate } from "../lib/contentVisibility.js";

export default function FirebaseCheckupsPage() {
  const [checkups, setCheckups] = useState([]);
  const [loadState, setLoadState] = useState({ status: "loading", message: "" });

  useEffect(() => {
    let shouldIgnore = false;

    async function loadCheckups() {
      setLoadState({ status: "loading", message: "" });

      try {
        const activeCheckups = await getActiveCheckups();
        if (shouldIgnore) return;

        setCheckups(activeCheckups);
        setLoadState({ status: activeCheckups.length ? "success" : "empty", message: "" });
      } catch (error) {
        if (shouldIgnore) return;

        console.error("[firebase-checkups] load failed", error);
        setLoadState({
          status: error?.code === "permission-denied" ? "permission-denied" : "error",
          message:
            error?.code === "permission-denied"
              ? "검진·검사 정보를 읽을 수 없습니다. Firestore 보안 규칙을 확인해 주세요."
              : "검진·검사 정보를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
        });
      }
    }

    loadCheckups();

    return () => {
      shouldIgnore = true;
    };
  }, []);

  return (
    <FirebaseV2AccessGate>
      {({ displayName }) => (
        <FirebaseV2PageShell
          label="Firebase Checkups"
          title="검진·검사 안내"
          description="현재 노출 가능한 검진·검사 안내를 Firestore v2 기준으로 확인합니다."
          displayName={displayName}
        >
          <section className="grid gap-3 sm:grid-cols-2">
            <FirebaseContentState
              status={loadState.status}
              message={loadState.message}
              emptyMessage="현재 안내 중인 검진·검사 일정이 없습니다."
            />

            {checkups.map((checkup) => (
              <article
                key={checkup.id}
                className="rounded-[26px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_14px_36px_rgba(16,32,71,0.05)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]">
                    {checkup.target || "전체"}
                  </span>
                  <span className="rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-black text-[#3154A3]">
                    {formatContentEndDate(checkup)}
                  </span>
                  {checkup.status && (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#627083]">
                      {checkup.operatingStatus || checkup.status}
                    </span>
                  )}
                </div>
                <h2 className="mt-4 text-lg font-black leading-7 text-[#102047]">
                  {checkup.title || "제목 없는 검진 안내"}
                </h2>
                {checkup.description && (
                  <p className="mt-2 line-clamp-3 text-sm font-medium leading-6 text-[#627083]">
                    {checkup.description}
                  </p>
                )}
                {checkup.details.length > 0 && (
                  <ul className="mt-4 space-y-2 rounded-2xl bg-[#F7FBF9] p-4 text-sm font-medium leading-6 text-[#627083]">
                    {checkup.details.slice(0, 4).map((detail) => (
                      <li key={detail}>• {detail}</li>
                    ))}
                  </ul>
                )}
                {checkup.linkUrl && (
                  <a
                    href={checkup.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex min-h-11 items-center rounded-2xl bg-[#20A982] px-4 py-2 text-sm font-black text-white shadow-[0_12px_28px_rgba(32,169,130,0.18)] transition hover:-translate-y-[1px] hover:bg-[#178C6C] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20"
                  >
                    {checkup.linkLabel || "안내 열기"}
                  </a>
                )}
              </article>
            ))}
          </section>
        </FirebaseV2PageShell>
      )}
    </FirebaseV2AccessGate>
  );
}
