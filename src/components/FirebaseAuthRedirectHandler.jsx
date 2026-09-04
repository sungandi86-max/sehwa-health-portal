import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { handleAuthRedirectResult } from "../lib/firebaseAuth.js";

let hasHandledRedirectResult = false;

export default function FirebaseAuthRedirectHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (hasHandledRedirectResult) return;
    hasHandledRedirectResult = true;

    let isMounted = true;

    handleAuthRedirectResult()
      .then(({ route }) => {
        if (!isMounted || !route) return;
        navigate(route, { replace: true });
      })
      .catch((error) => {
        console.error("[firebase-auth] redirect result handling failed", error);
      });

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return null;
}
