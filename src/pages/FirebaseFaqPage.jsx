import { useEffect, useMemo, useState } from "react";
import FirebaseV2AccessGate from "../components/FirebaseV2AccessGate.jsx";
import { FirebaseContentState, FirebaseV2PageShell } from "../components/FirebaseV2PageShell.jsx";
import { getActiveFaqs, searchFaqs } from "../lib/faqs.js";

export default function FirebaseFaqPage() {
  const [faqs, setFaqs] = useState([]);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState("");
  const [loadState, setLoadState] = useState({ status: "loading", message: "" });

  useEffect(() => {
    let shouldIgnore = false;

    async function loadFaqs() {
      setLoadState({ status: "loading", message: "" });

      try {
        const activeFaqs = await getActiveFaqs();
        if (shouldIgnore) return;

        setFaqs(activeFaqs);
        setOpenId(activeFaqs[0]?.id || "");
        setLoadState({ status: activeFaqs.length ? "success" : "empty", message: "" });
      } catch (error) {
        if (shouldIgnore) return;

        console.error("[firebase-faq] load failed", error);
        setLoadState({
          status: error?.code === "permission-denied" ? "permission-denied" : "error",
          message:
            error?.code === "permission-denied"
              ? "FAQ 정보를 읽을 수 없습니다. Firestore 보안 규칙을 확인해 주세요."
              : "FAQ 정보를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
        });
      }
    }

    loadFaqs();

    return () => {
      shouldIgnore = true;
    };
  }, []);

  const filteredFaqs = useMemo(() => searchFaqs(faqs, query), [faqs, query]);
  const hasNoSearchResult = loadState.status === "success" && filteredFaqs.length === 0;

  return (
    <FirebaseV2AccessGate>
      {({ displayName }) => (
        <FirebaseV2PageShell
          label="Firebase FAQ"
          title="FAQ"
          description="교직원이 자주 확인하는 보건 업무 질문을 빠르게 검색합니다."
          displayName={displayName}
        >
          <section className="rounded-[30px] border border-[#DDEAE7] bg-white/95 p-5 shadow-[0_18px_48px_rgba(16,32,71,0.07)] sm:p-6">
            <label className="block">
              <span className="mb-2 block text-sm font-black text-[#102047]">FAQ 검색</span>
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setOpenId("");
                }}
                className="min-h-12 w-full rounded-2xl border border-[#DDEAE7] bg-[#F7FBF9] px-4 py-3 text-sm font-bold text-[#102047] outline-none transition focus:border-[#20A982] focus:ring-4 focus:ring-[#20A982]/10"
                placeholder="질문이나 답변을 검색해 주세요."
              />
            </label>
          </section>

          <section className="space-y-3">
            <FirebaseContentState
              status={loadState.status}
              message={loadState.message}
              emptyMessage="현재 등록된 FAQ가 없습니다."
            />

            {hasNoSearchResult && (
              <div className="rounded-[26px] border border-[#DDEAE7] bg-white/95 p-6 text-center shadow-[0_14px_36px_rgba(16,32,71,0.05)]">
                <p className="text-sm font-black text-[#627083]">검색 결과가 없습니다. 필요한 경우 보건실로 문의해주세요.</p>
              </div>
            )}

            {filteredFaqs.map((faq) => (
              <article
                key={faq.id}
                className="overflow-hidden rounded-[26px] border border-[#DDEAE7] bg-white/95 shadow-[0_14px_36px_rgba(16,32,71,0.05)]"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(openId === faq.id ? "" : faq.id)}
                  className="flex min-h-16 w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-[#F7FBF9] focus:outline-none focus:ring-4 focus:ring-[#20A982]/15"
                  aria-expanded={openId === faq.id}
                >
                  <span>
                    {faq.category && (
                      <span className="mb-2 block w-fit rounded-full bg-[#F0FBF7] px-3 py-1 text-xs font-black text-[#08754B]">
                        {faq.category}
                      </span>
                    )}
                    <span className="block text-base font-black leading-6 text-[#102047]">Q. {faq.question}</span>
                  </span>
                  <span className="text-2xl font-black text-[#20A982]">{openId === faq.id ? "-" : "+"}</span>
                </button>
                {openId === faq.id && (
                  <div className="border-t border-[#DDEAE7] bg-[#F7FBF9] p-5 text-sm font-medium leading-7 text-[#627083]">
                    {faq.answer || "답변이 등록되지 않았습니다."}
                  </div>
                )}
              </article>
            ))}
          </section>
        </FirebaseV2PageShell>
      )}
    </FirebaseV2AccessGate>
  );
}
