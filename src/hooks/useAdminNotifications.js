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

export function useAdminNotifications({ user, enabled }) {
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
      const result = await fetchAdminNotifications(user);
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
  }, [capability.supported, enabled, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
