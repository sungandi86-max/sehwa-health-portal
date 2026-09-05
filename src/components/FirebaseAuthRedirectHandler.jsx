import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase.js";
import { handleAuthRedirectResult, hasPendingRedirectRoute } from "../lib/firebaseAuth.js";

let hasHandledRedirectResult = false;
const REDIRECT_READY_TIMEOUT_MS = 8000;

function waitForInitialAuthState() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      () => {
        unsubscribe();
        resolve();
      },
      () => {
        unsubscribe();
        resolve();
      }
    );
  });
}

export default function FirebaseAuthRedirectHandler({ onReady }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (hasHandledRedirectResult) {
      onReady?.();
      return;
    }
    hasHandledRedirectResult = true;

    let isMounted = true;
    let hasNotifiedReady = false;
    const hadPendingRedirectRoute = hasPendingRedirectRoute();

    const notifyReady = () => {
      if (!isMounted || hasNotifiedReady) return;
      hasNotifiedReady = true;
      onReady?.();
    };

    const timeoutId = window.setTimeout(notifyReady, REDIRECT_READY_TIMEOUT_MS);

    waitForInitialAuthState().then(() => {
      if (!hadPendingRedirectRoute) notifyReady();
    });

    handleAuthRedirectResult()
      .then(({ route }) => {
        if (!isMounted || !route) return;
        navigate(route, { replace: true });
      })
      .catch((error) => {
        console.error("[firebase-auth] redirect result handling failed", error);
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        notifyReady();
      });

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [navigate, onReady]);

  return null;
}
