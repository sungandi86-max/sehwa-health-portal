import { useNavigate } from "react-router-dom";
import { useAdminNotifications } from "../hooks/useAdminNotifications.js";

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function notificationStatusText(permission, unreadCount) {
  if (permission === "denied") return "브라우저에서 차단됨";
  if (unreadCount > 0) return `${unreadCount}건 미확인`;
  return "새 알림 없음";
}

export function AdminNotificationBadge({ user, enabled }) {
  const notifications = useAdminNotifications({ user, enabled });

  if (!enabled) return null;

  return notifications.unreadCount > 0 ? (
    <span className="ml-1 rounded-[7px] bg-[#B42318] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
      {notifications.unreadCount}
    </span>
  ) : null;
}

export default function AdminNotificationPanel({ user, enabled, compact = false }) {
  const navigate = useNavigate();
  const notifications = useAdminNotifications({ user, enabled });

  if (!enabled) return null;

  const canRegister = notifications.capability.supported && notifications.permission !== "denied";
  const isRegistered = notifications.registrationStatus === "registered";
  const showRecent = !compact && notifications.notifications.length > 0;
  const registerButtonLabel = notifications.isRegistering || notifications.registrationStatus === "checking"
    ? "등록 중"
    : isRegistered
      ? "알림 켜짐 ✓"
      : "알림 받기";
  const firstUnreadNotification = notifications.notifications.find((notification) => !notification.read);

  const openNotification = async (notification) => {
    await notifications.markRead(notification.id);
    navigate(notification.destination || "/firebase-dashboard");
  };

  const openForegroundNotification = async () => {
    if (!notifications.foregroundNotice) return;
    await openNotification(notifications.foregroundNotice);
  };

  const openPrimaryNotificationAction = async () => {
    if (firstUnreadNotification) {
      await openNotification(firstUnreadNotification);
      return;
    }

    navigate("/firebase-admin/access-requests");
  };

  if (compact) {
    return (
      <section className="rounded-[10px] bg-[#F8FAFA] px-2.5 py-2 text-[#102047]">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-[#102047]">관리자 알림</p>
          <span className="rounded-[8px] border border-[#DDEAE7] bg-white px-2 py-0.5 text-[11px] font-medium text-[#627083]">
            {notificationStatusText(notifications.permission, notifications.unreadCount)}
          </span>
          {canRegister ? (
            <button
              type="button"
              onClick={notifications.register}
              disabled={notifications.isRegistering || notifications.registrationStatus === "checking" || isRegistered}
              className={`ml-auto min-h-8 rounded-[8px] border px-2.5 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed ${
                isRegistered
                  ? "border-[#B8D8C9] bg-[#F3F8F6] text-[#08754B]"
                  : "border-[#C8D8FF] bg-white text-[#0D4EA6] hover:bg-[#FBFCFF] disabled:opacity-50"
              }`}
            >
              {registerButtonLabel}
            </button>
          ) : null}
        </div>

        {notifications.foregroundNotice && (
          <button
            type="button"
            onClick={openForegroundNotification}
            className="mt-2 block w-full rounded-[8px] border border-[#C8D8FF] bg-[#EEF4FF] px-2.5 py-1.5 text-left text-xs font-medium leading-5 text-[#3154A3]"
          >
            <span className="font-semibold">{notifications.foregroundNotice.title}</span>
            <span className="ml-1">{notifications.foregroundNotice.body}</span>
          </button>
        )}

        {notifications.state.status === "error" && (
          <p className="mt-2 rounded-[8px] border border-[#F6D8D8] bg-[#FFF7F7] px-2.5 py-1.5 text-xs font-semibold text-[#B42318]">
            {notifications.state.message}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-[12px] border border-[#DDEAE7] bg-white p-3 text-[#102047]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[#102047]">관리자 알림</p>
            <span className="rounded-[8px] border border-[#DDEAE7] bg-[#F8FAFA] px-2 py-0.5 text-[11px] font-medium text-[#627083]">
              {notificationStatusText(notifications.permission, notifications.unreadCount)}
            </span>
          </div>
          <p className="mt-1 text-xs font-normal leading-5 text-[#627083]">
            가입과 권한 신청을 이 브라우저에서 확인합니다.
          </p>
        </div>
        {canRegister ? (
          <button
            type="button"
            onClick={notifications.register}
            disabled={notifications.isRegistering || notifications.registrationStatus === "checking" || isRegistered}
            className={`min-h-9 rounded-[9px] border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${
              isRegistered
                ? "border-[#B8D8C9] bg-[#F3F8F6] text-[#08754B]"
                : "border-[#C8D8FF] bg-white text-[#0D4EA6] hover:bg-[#FBFCFF] disabled:opacity-50"
            }`}
          >
            {registerButtonLabel}
          </button>
        ) : null}
      </div>

      {notifications.foregroundNotice && (
        <button
          type="button"
          onClick={openForegroundNotification}
          className="mt-3 block w-full rounded-[9px] border border-[#C8D8FF] bg-[#EEF4FF] px-3 py-2 text-left text-xs font-medium leading-5 text-[#3154A3]"
        >
          <span className="block font-semibold">{notifications.foregroundNotice.title}</span>
          <span className="block">{notifications.foregroundNotice.body}</span>
        </button>
      )}

      {notifications.state.status === "error" && (
        <p className="mt-3 rounded-[8px] border border-[#F6D8D8] bg-[#FFF7F7] px-3 py-2 text-xs font-semibold text-[#B42318]">
          {notifications.state.message}
        </p>
      )}

      {showRecent && (
        <div className="mt-3 divide-y divide-[#DDEAE7] border-t border-[#DDEAE7]">
          {notifications.notifications.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => openNotification(notification)}
              className="flex w-full flex-col gap-1 py-2.5 text-left transition hover:bg-[#FBFCFF] sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#102047]">{notification.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-xs font-normal leading-5 text-[#627083]">
                  {notification.body}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-[11px] font-medium text-[#8A96A8]">
                {!notification.read && <span className="rounded-[7px] bg-[#B42318] px-1.5 py-0.5 text-white">미확인</span>}
                {formatDate(notification.createdAt)}
              </span>
            </button>
          ))}
        </div>
      )}

      {!compact && notifications.notifications.length === 0 && notifications.state.status === "success" && (
        <p className="mt-3 rounded-[9px] border border-[#DDEAE7] bg-[#F8FAFA] px-3 py-2 text-xs font-medium text-[#627083]">
          최근 관리자 알림이 없습니다.
        </p>
      )}

      {!compact && (
        <button
          type="button"
          onClick={openPrimaryNotificationAction}
          className="mt-3 inline-flex min-h-9 items-center rounded-[9px] border border-[#DDEAE7] bg-white px-3 py-1.5 text-xs font-semibold text-[#102047] transition hover:border-[#C8D8FF]"
        >
          권한 신청 확인
        </button>
      )}
    </section>
  );
}
