import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAdminNotifications,
  fetchAdminPushRegistrationStatus,
  getBrowserNotificationPermission,
  getPushCapability,
  markAdminNotificationRead,
  registerAdminPushToken,
  subscribeToForegroundAdminNotifications,
} from "../lib/adminNotifications.js";

const ADMIN_NOTIFICATIONS_CHANGED_EVENT = "admin-notifications:changed";

function notifyAdminNotificationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ADMIN_NOTIFICATIONS_CHANGED_EVENT));
}

export function useAdminNotifications({ user, enabled, includeAcknowledged = false }) {
  const [state, setState] = useState({ status: "idle", message: "" });
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permission, setPermission] = useState(getBrowserNotificationPermission());
  const [registrationStatus, setRegistrationStatus] = useState("unknown");
  const [isRegistering, setIsRegistering] = useState(false);
  const [foregroundNotice, setForegroundNotice] = useState(null);
  const capability = useMemo(() => getPushCapability(), []);

  const refresh = useCallback(async () => {
    if (!enabled || !user) {
      setNotifications([]);
      setUnreadCount(0);
      setRegistrationStatus("unknown");
      setState({ status: "idle", message: "" });
      return;
    }

    setState({ status: "loading", message: "" });
    try {
      const result = await fetchAdminNotifications(user, { includeAcknowledged });
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      const nextPermission = getBrowserNotificationPermission();
      setPermission(nextPermission);
      if (nextPermission === "granted" && capability.supported) {
        setRegistrationStatus("checking");
        try {
          const registration = await fetchAdminPushRegistrationStatus(user);
          setRegistrationStatus(registration.registered ? "registered" : "unregistered");
        } catch {
          setRegistrationStatus("unknown");
        }
      } else {
        setRegistrationStatus("unregistered");
      }
      setState({ status: "success", message: "" });
    } catch (error) {
      setNotifications([]);
      setUnreadCount(0);
      setRegistrationStatus("unknown");
      setState({ status: "error", message: error?.message || "관리자 알림을 불러오지 못했습니다." });
    }
  }, [capability.supported, enabled, includeAcknowledged, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !user || typeof window === "undefined") return undefined;

    const refreshIfVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh();
    };

    window.addEventListener(ADMIN_NOTIFICATIONS_CHANGED_EVENT, refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", refreshIfVisible);
    }

    return () => {
      window.removeEventListener(ADMIN_NOTIFICATIONS_CHANGED_EVENT, refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", refreshIfVisible);
      }
    };
  }, [enabled, refresh, user]);

  useEffect(() => {
    if (!enabled || !user) return undefined;

    let active = true;
    let unsubscribe = null;
    subscribeToForegroundAdminNotifications((notification) => {
      if (!active) return;
      setForegroundNotice(notification);
      void refresh();
    }).then((nextUnsubscribe) => {
      if (!active) {
        nextUnsubscribe?.();
        return;
      }
      unsubscribe = nextUnsubscribe;
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [enabled, refresh, user]);

  const register = async () => {
    if (!enabled || !user) return;

    setIsRegistering(true);
    setRegistrationStatus("checking");
    setState({ status: "loading", message: "" });
    try {
      await registerAdminPushToken(user);
      setPermission(getBrowserNotificationPermission());
      setRegistrationStatus("registered");
      await refresh();
      setRegistrationStatus("registered");
      setState({ status: "success", message: "이 브라우저에서 관리자 알림을 받습니다." });
      notifyAdminNotificationsChanged();
    } catch (error) {
      setPermission(getBrowserNotificationPermission());
      setRegistrationStatus("unregistered");
      setState({ status: "error", message: error?.message || "알림을 켜지 못했습니다." });
    } finally {
      setIsRegistering(false);
    }
  };

  const markRead = async (notificationId) => {
    if (!enabled || !user || !notificationId) return;

    await markAdminNotificationRead(user, notificationId);
    await refresh();
    notifyAdminNotificationsChanged();
  };

  return {
    capability,
    foregroundNotice,
    isRegistering,
    markRead,
    notifications,
    permission,
    registrationStatus,
    refresh,
    register,
    state,
    unreadCount,
  };
}
