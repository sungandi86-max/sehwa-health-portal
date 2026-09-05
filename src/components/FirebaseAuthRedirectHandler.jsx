import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { handleAuthRedirectResult } from "../lib/firebaseAuth.js";

let hasHandledRedirectResult = false;

export default function FirebaseAuthRedirectHandler({ onReady }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (hasHandledRedirectResult) {
      onReady?.();
      return;
    }
    hasHandledRedirectResult = true;

    let isMounted = true;

    handleAuthRedirectResult()
      .then(({ route }) => {
        if (!isMounted || !route) return;
        navigate(route, { replace: true });
      })
      .catch((error) => {
        console.error("[firebase-auth] redirect result handling failed", error);
      })
      .finally(() => {
        if (isMounted) onReady?.();
      });

    return () => {
      isMounted = false;
    };
  }, [navigate, onReady]);

  return null;
}
