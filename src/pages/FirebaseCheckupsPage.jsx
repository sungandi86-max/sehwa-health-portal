import { useEffect, useState } from "react";
import FirebaseV2AccessGate from "../components/FirebaseV2AccessGate.jsx";
import { FirebaseContentState } from "../components/FirebaseV2PageShell.jsx";
import {
  PortalAction,
  PortalBackToHome,
  PortalBadge,
  PortalInfoBox,
  PortalNoticeBox,
  PortalPageHeader,
  PortalPageLayout,
  PortalTaskCard,
} from "../components/PortalSubpageLayout.jsx";
import { getActiveCheckups } from "../lib/checkups.js";
import { formatContentEndDate } from "../lib/contentVisibility.js";

function isExternalUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

export default function FirebaseCheckupsPage() {
  const [checkups, setCheckups] = useState([]);
  const [loadState, setLoadState] = useState({ status: "loading", message: "" });
  const [notice, setNotice] = useState(null);

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
        <PortalPageLayout>
          <PortalBackToHome />
          <PortalPageHeader
            label="검진·검사 안내"
            title="검진·검사 안내"
            description="현재 노출 가능한 검진·검사 안내를 확인합니다."
            identity={(
              <>
                <p className="text-sm font-semibold text-[#102047]">{displayName} 선생님</p>
                <p className="mt-1 text-xs font-normal text-[#627083]">현재 학기 검진·검사 안내</p>
              </>
            )}
          />
          {loadState.status !== "success" && (
            <FirebaseContentState
              status={loadState.status}
              message={loadState.message}
              emptyMessage="현재 안내 중인 검진·검사 일정이 없습니다."
            />
          )}

          {loadState.status === "success" && (
            <section className="grid gap-3 md:grid-cols-2">
              {checkups.map((checkup) => (
                <PortalTaskCard
                  key={checkup.id}
                  badges={(
                    <>
                      <PortalBadge tone="audience">{checkup.target || "전체"}</PortalBadge>
                      <PortalBadge tone="period">{formatContentEndDate(checkup)}</PortalBadge>
                      <PortalBadge tone="status">{checkup.scheduleStatus || checkup.status}</PortalBadge>
                    </>
                  )}
                  title={checkup.title || "제목 없는 검진 안내"}
                  description={checkup.description}
                  action={(
                    <div className="grid gap-2">
                      {isExternalUrl(checkup.linkUrl) && (
                        <PortalAction href={checkup.linkUrl} external>
                          {checkup.linkLabel || `${checkup.title || "검진·검사"} 안내 보기`}
                        </PortalAction>
                      )}
                      {checkup.displayMode === "image" && isExternalUrl(checkup.imageUrl) && (
                        <PortalAction href={checkup.imageUrl} external variant={isExternalUrl(checkup.linkUrl) ? "secondary" : "primary"}>
                          운영표 보기
                        </PortalAction>
                      )}
                      {isExternalUrl(checkup.downloadUrl) && (
                        <PortalAction href={checkup.downloadUrl} external variant={isExternalUrl(checkup.linkUrl) || isExternalUrl(checkup.imageUrl) ? "secondary" : "primary"}>
                          원본 보기
                        </PortalAction>
                      )}
                      {checkup.displayMode === "link" && checkup.linkLabel && !isExternalUrl(checkup.linkUrl) && (
                        <PortalAction disabled>
                          링크 준비 중
                        </PortalAction>
                      )}
                      {checkup.secondaryButtonLabel && checkup.secondaryAction === "notice" && (
                        <PortalAction
                          onClick={() => setNotice({ title: checkup.secondaryButtonLabel, message: checkup.copyText || checkup.updateNotice })}
                          variant={isExternalUrl(checkup.linkUrl) || isExternalUrl(checkup.imageUrl) || isExternalUrl(checkup.downloadUrl) ? "secondary" : "primary"}
                        >
                          {checkup.secondaryButtonLabel}
                        </PortalAction>
                      )}
                      {!isExternalUrl(checkup.linkUrl) &&
                        !(checkup.displayMode === "image" && isExternalUrl(checkup.imageUrl)) &&
                        !isExternalUrl(checkup.downloadUrl) &&
                        !(checkup.secondaryButtonLabel && checkup.secondaryAction === "notice") &&
                        !(checkup.displayMode === "link" && checkup.linkLabel && !isExternalUrl(checkup.linkUrl)) && (
                          <PortalAction disabled>링크 준비 중</PortalAction>
                        )}
                    </div>
                  )}
                >
                  {checkup.details.length > 0 && (
                    <PortalInfoBox>
                      <ul className="space-y-1.5">
                        {checkup.details.slice(0, 4).map((detail) => (
                          <li key={detail}>• {detail}</li>
                        ))}
                      </ul>
                    </PortalInfoBox>
                  )}
                  {checkup.updateNotice && (
                    <PortalNoticeBox>{checkup.updateNotice}</PortalNoticeBox>
                  )}
                </PortalTaskCard>
              ))}
            </section>
          )}

          {notice && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102047]/40 p-4">
              <div className="w-full max-w-md rounded-[28px] border border-[#DDEAE7] bg-white p-6 shadow-[0_24px_80px_rgba(16,32,71,0.18)]">
                <h2 className="text-xl font-semibold text-[#102047]">{notice.title}</h2>
                <p className="mt-4 whitespace-pre-line text-sm font-medium leading-7 text-[#627083]">
                  {notice.message || "추가 안내가 준비 중입니다."}
                </p>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  className="mt-5 inline-flex min-h-10 items-center rounded-[10px] bg-[#0D4EA6] px-5 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-[#0D4EA6]/15"
                >
                  확인
                </button>
              </div>
            </div>
          )}
        </PortalPageLayout>
      )}
    </FirebaseV2AccessGate>
  );
}
