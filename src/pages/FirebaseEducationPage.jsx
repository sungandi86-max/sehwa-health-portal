import { useEffect, useState } from "react";
import FirebaseV2AccessGate from "../components/FirebaseV2AccessGate.jsx";
import { FirebaseContentState, FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { getActiveEducationResources } from "../lib/educationResources.js";

export default function FirebaseEducationPage() {
  const [resources, setResources] = useState([]);
  const [loadState, setLoadState] = useState({ status: "loading", message: "" });

  useEffect(() => {
    let shouldIgnore = false;

    async function loadResources() {
      setLoadState({ status: "loading", message: "" });

      try {
        const activeResources = await getActiveEducationResources();
        if (shouldIgnore) return;

        setResources(activeResources);
        setLoadState({ status: activeResources.length ? "success" : "empty", message: "" });
      } catch (error) {
        if (shouldIgnore) return;

        console.error("[firebase-education] load failed", error);
        setLoadState({
          status: error?.code === "permission-denied" ? "permission-denied" : "error",
          message:
            error?.code === "permission-denied"
              ? "교육자료를 읽을 수 없습니다. Firestore 보안 규칙을 확인해 주세요."
              : "교육자료를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
        });
      }
    }

    loadResources();

    return () => {
      shouldIgnore = true;
    };
  }, []);

  return (
    <FirebaseV2AccessGate>
      {({ displayName }) => (
        <FirebaseV2PageShell
          label="Firebase Education"
          title="교육자료"
          description="보건 업무에 필요한 교육자료 링크를 Firestore v2 기준으로 확인합니다."
          displayName={displayName}
        >
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FirebaseContentState
              status={loadState.status}
              message={loadState.message}
              emptyMessage="현재 등록된 교육자료가 없습니다."
            />

            {resources.map((resource) => (
              <article
                key={resource.id}
                className="flex min-h-64 flex-col rounded-[26px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_14px_36px_rgba(16,32,71,0.05)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]">
                    {resource.category || "자료"}
                  </span>
                  {resource.target && (
                    <span className="rounded-full bg-[#EEF4FF] px-3 py-1 text-xs font-black text-[#3154A3]">
                      {resource.target}
                    </span>
                  )}
                </div>
                <h2 className="mt-4 text-lg font-black leading-7 text-[#102047]">
                  {resource.title || "제목 없는 교육자료"}
                </h2>
                {resource.description && (
                  <p className="mt-2 line-clamp-3 text-sm font-medium leading-6 text-[#627083]">
                    {resource.description}
                  </p>
                )}
                <div className="mt-4 space-y-2 rounded-2xl bg-[#F7FBF9] p-4 text-sm font-medium leading-6 text-[#627083]">
                  {resource.schedule && <p>일정 · {resource.schedule}</p>}
                  {resource.duration && <p>시간 · {resource.duration}</p>}
                  {resource.confirmation && <p>확인 · {resource.confirmation}</p>}
                  {resource.status && <p>상태 · {resource.status}</p>}
                </div>
                {resource.linkUrl ? (
                  <a
                    href={resource.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex min-h-11 w-fit items-center rounded-2xl bg-[#20A982] px-4 py-2 text-sm font-black text-white shadow-[0_12px_28px_rgba(32,169,130,0.18)] transition hover:-translate-y-[1px] hover:bg-[#178C6C] focus:outline-none focus:ring-4 focus:ring-[#20A982]/20"
                  >
                    {resource.linkLabel || "자료 열기"}
                  </a>
                ) : (
                  <p className="mt-auto text-sm font-black text-[#8A96A8]">링크 미등록</p>
                )}
              </article>
            ))}
          </section>
        </FirebaseV2PageShell>
      )}
    </FirebaseV2AccessGate>
  );
}
