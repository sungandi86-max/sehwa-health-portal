import { useEffect, useMemo, useState } from "react";
import FirebaseStaffSubmissionAccessGate from "../components/FirebaseStaffSubmissionAccessGate.jsx";
import HealthCheckLiveView from "../components/HealthCheckLiveView.jsx";
import {
  PortalBackToHome,
  PortalPageHeader,
  PortalPageLayout,
} from "../components/PortalSubpageLayout.jsx";
import { selectDefaultHealthCheckSession } from "../lib/healthCheckPublicSchedule.js";
import {
  HealthCheckScheduleConfigurationError,
  subscribeHealthCheckClasses,
  subscribeHealthCheckSessions,
} from "../lib/healthCheckPublicScheduleClient.js";

function toLoadError(error) {
  if (error instanceof HealthCheckScheduleConfigurationError) return { status: "configuration", message: error.message };
  return { status: "error", message: "별도검사 일정 정보를 불러오지 못했습니다." };
}

function LiveScheduleController() {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [classes, setClasses] = useState([]);
  const [sessionState, setSessionState] = useState({ status: "loading", message: "" });
  const [classState, setClassState] = useState({ status: "idle", message: "" });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setSessionState({ status: "loading", message: "" });
    return subscribeHealthCheckSessions({
      onData(nextSessions) {
        setSessions(nextSessions);
        setSelectedSessionId((current) => {
          if (current && nextSessions.some((item) => item.sessionId === current)) return current;
          return selectDefaultHealthCheckSession(nextSessions)?.sessionId || "";
        });
        setSessionState({ status: "success", message: "" });
        setNow(new Date());
      },
      onError(error) {
        console.error("[health-check-live] session read failed", error?.name || error?.code || "unknown");
        setSessionState(toLoadError(error));
      },
    });
  }, [refreshVersion]);

  useEffect(() => {
    if (!selectedSessionId) {
      setClasses([]);
      setClassState({ status: "idle", message: "" });
      return undefined;
    }
    setClasses([]);
    setClassState({ status: "loading", message: "" });
    return subscribeHealthCheckClasses(selectedSessionId, {
      onData(nextClasses) {
        setClasses(nextClasses);
        setClassState({ status: "success", message: "" });
        setNow(new Date());
      },
      onError(error) {
        console.error("[health-check-live] class read failed", error?.name || error?.code || "unknown");
        setClassState({ status: "error", message: "학급별 시간표를 불러오지 못했습니다." });
      },
    });
  }, [selectedSessionId, refreshVersion]);

  const sortedSessions = useMemo(() => [...sessions].sort((a, b) => {
    if (a.status === "inProgress" && b.status !== "inProgress") return -1;
    if (b.status === "inProgress" && a.status !== "inProgress") return 1;
    return b.examDate.localeCompare(a.examDate);
  }), [sessions]);

  return (
    <HealthCheckLiveView
      sessions={sortedSessions}
      selectedSessionId={selectedSessionId}
      onSelectSession={setSelectedSessionId}
      classes={classes}
      sessionState={sessionState}
      classState={classState}
      onRefresh={() => setRefreshVersion((value) => value + 1)}
      now={now}
    />
  );
}

export default function FirebaseHealthCheckLivePage() {
  return (
    <FirebaseStaffSubmissionAccessGate readOnly accessTitle="별도검사 일정·진행 현황">
      {({ displayName }) => (
        <PortalPageLayout>
          <PortalBackToHome />
          <PortalPageHeader
            label="검진·검사 안내"
            title="별도검사 일정·진행 현황"
            description="학급별 예정 시간과 진행 순서를 확인합니다. 시간은 현장 상황에 따라 달라집니다."
            identity={(
              <>
                <p className="text-sm font-semibold text-[#102047]">{displayName} 선생님</p>
                <p className="mt-1 text-xs text-[#627083]">조회 전용 안내</p>
              </>
            )}
          />
          <LiveScheduleController />
        </PortalPageLayout>
      )}
    </FirebaseStaffSubmissionAccessGate>
  );
}
