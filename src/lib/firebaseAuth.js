import {
  browserLocalPersistence,
  getRedirectResult,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { auth, googleProvider, microsoftProvider } from "./firebase.js";

const SCHOOL_MICROSOFT_DOMAIN = "@sehwa-gs.hs.kr";
const REDIRECT_ROUTE_KEY = "sehwa-health-portal:auth-redirect-route";
const REDIRECT_MESSAGE_KEY = "sehwa-health-portal:auth-redirect-message";

export const AUTH_REDIRECT_MESSAGE_EVENT = "sehwa-health-portal:auth-redirect-message";

const PROVIDER_IDS = {
  google: "google.com",
  microsoft: "microsoft.com",
};

let authPersistencePromise = null;

class FirebaseAuthPolicyError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "FirebaseAuthPolicyError";
    this.code = code;
  }
}

export function getFirebaseProviderId(firebaseUser) {
  const providerData = firebaseUser?.providerData || [];
  const knownProvider = providerData.find((provider) =>
    [PROVIDER_IDS.microsoft, PROVIDER_IDS.google].includes(provider.providerId)
  );

  return knownProvider?.providerId || providerData[0]?.providerId || "";
}

export function getAuthProvider(firebaseUser) {
  const providerId = getFirebaseProviderId(firebaseUser);

  if (providerId === PROVIDER_IDS.microsoft) return "microsoft";
  if (providerId === PROVIDER_IDS.google) return "google";
  return "unknown";
}

export function getAuthProviderLabel(firebaseUser) {
  const provider = getAuthProvider(firebaseUser);

  if (provider === "microsoft") return "Microsoft Teams";
  if (provider === "google") return "Google";
  return "확인 중";
}

export function getMicrosoftSchoolDomainBlockMessage(firebaseUser) {
  if (getFirebaseProviderId(firebaseUser) !== PROVIDER_IDS.microsoft) return "";

  const email = (firebaseUser?.email || "").toLowerCase();
  return email.endsWith(SCHOOL_MICROSOFT_DOMAIN)
    ? ""
    : `학교 Teams 계정(${SCHOOL_MICROSOFT_DOMAIN})으로 로그인해 주세요.`;
}

function hasBrowserWindow() {
  return typeof window !== "undefined";
}

function isStandalonePwa() {
  if (!hasBrowserWindow()) return false;

  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches === true ||
    window.navigator?.standalone === true
  );
}

function isCoarseTouchDevice() {
  if (!hasBrowserWindow()) return false;

  const hasCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches === true;
  const hasTouchPoints = Number(window.navigator?.maxTouchPoints || 0) > 0;
  const hasTouchEvent = "ontouchstart" in window;

  return hasCoarsePointer || hasTouchPoints || hasTouchEvent;
}

function isMobileLikeViewport() {
  if (!hasBrowserWindow()) return false;

  const viewportWidth = window.visualViewport?.width || window.innerWidth || 0;
  const viewportHeight = window.visualViewport?.height || window.innerHeight || 0;
  return Math.min(viewportWidth, viewportHeight) <= 820;
}

function getSessionItem(key) {
  try {
    return window.sessionStorage?.getItem(key) || "";
  } catch {
    return "";
  }
}

function setSessionItem(key, value) {
  try {
    window.sessionStorage?.setItem(key, value);
  } catch {
  }
}

function removeSessionItem(key) {
  try {
    window.sessionStorage?.removeItem(key);
  } catch {
  }
}

export function ensureAuthLocalPersistence() {
  if (!hasBrowserWindow()) return Promise.resolve();

  if (!authPersistencePromise) {
    authPersistencePromise = setPersistence(auth, browserLocalPersistence).catch((error) => {
      authPersistencePromise = null;
      throw error;
    });
  }

  return authPersistencePromise;
}

export function shouldUseRedirectSignIn() {
  return isStandalonePwa() || (isCoarseTouchDevice() && isMobileLikeViewport());
}

function currentInternalRoute() {
  if (!hasBrowserWindow()) return "/";

  return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
}

function isSafeInternalRoute(route) {
  if (!hasBrowserWindow() || typeof route !== "string" || !route.startsWith("/") || route.startsWith("//")) {
    return false;
  }

  try {
    const parsedUrl = new URL(route, window.location.origin);
    return parsedUrl.origin === window.location.origin;
  } catch {
    return false;
  }
}

function saveRedirectRoute() {
  if (!hasBrowserWindow()) return;

  const route = currentInternalRoute();
  if (!isSafeInternalRoute(route)) return;
  setSessionItem(REDIRECT_ROUTE_KEY, route);
}

export function takeRedirectRoute() {
  if (!hasBrowserWindow()) return "";

  const route = getSessionItem(REDIRECT_ROUTE_KEY);
  removeSessionItem(REDIRECT_ROUTE_KEY);
  return isSafeInternalRoute(route) ? route : "";
}

export function hasPendingRedirectRoute() {
  if (!hasBrowserWindow()) return false;

  return isSafeInternalRoute(getSessionItem(REDIRECT_ROUTE_KEY));
}

export function consumeRedirectAuthMessage() {
  if (!hasBrowserWindow()) return "";

  const message = getSessionItem(REDIRECT_MESSAGE_KEY);
  removeSessionItem(REDIRECT_MESSAGE_KEY);
  return message;
}

function publishRedirectAuthMessage(message) {
  if (!hasBrowserWindow() || !message) return;

  setSessionItem(REDIRECT_MESSAGE_KEY, message);
  window.dispatchEvent(new CustomEvent(AUTH_REDIRECT_MESSAGE_EVENT, { detail: { message } }));
}

async function startFederatedLogin(provider) {
  await ensureAuthLocalPersistence();

  if (shouldUseRedirectSignIn()) {
    saveRedirectRoute();
    return signInWithRedirect(auth, provider);
  }

  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    if (error?.code === "auth/popup-blocked") {
      saveRedirectRoute();
      return signInWithRedirect(auth, provider);
    }
    throw error;
  }
}

export async function signInWithMicrosoft() {
  const result = await startFederatedLogin(microsoftProvider);
  if (!result?.user) return result;

  const blockedMessage = getMicrosoftSchoolDomainBlockMessage(result.user);

  if (blockedMessage) {
    await signOut(auth);
    throw new FirebaseAuthPolicyError(blockedMessage, "auth/invalid-school-domain");
  }

  return result;
}

export async function signInWithGoogle() {
  return startFederatedLogin(googleProvider);
}

export function signOutFirebase() {
  return signOut(auth);
}

export function getFriendlyRedirectAuthErrorMessage(error) {
  const code = error?.code || "";

  if (code === "auth/account-exists-with-different-credential") {
    return "이 이메일은 다른 로그인 방식으로 등록되어 있습니다. 기존 방식으로 로그인해 주세요.";
  }
  if (code === "auth/unauthorized-domain") {
    return "현재 접속 주소가 Firebase 승인 도메인에 등록되어 있지 않습니다.";
  }
  if (code === "auth/network-request-failed") {
    return "로그인 서버에 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.";
  }

  return "로그인을 완료하지 못했습니다. 다시 시도해 주세요.";
}

export async function handleAuthRedirectResult() {
  const route = takeRedirectRoute();

  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      const blockedMessage = getMicrosoftSchoolDomainBlockMessage(result.user);
      if (blockedMessage) {
        await signOut(auth);
        publishRedirectAuthMessage(blockedMessage);
      }
    }
    return { result, route, error: null };
  } catch (error) {
    publishRedirectAuthMessage(getFriendlyRedirectAuthErrorMessage(error));
    return { result: null, route, error };
  }
}

export function getFriendlyAuthErrorMessage(error, fallbackMessage = "로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.") {
  const code = error?.code || "";

  if (code === "auth/invalid-school-domain") {
    return error.message || `학교 Teams 계정(${SCHOOL_MICROSOFT_DOMAIN})으로 로그인해 주세요.`;
  }
  if (code === "auth/account-exists-with-different-credential") {
    return "이 이메일은 다른 로그인 방식으로 등록되어 있습니다. 기존 방식으로 로그인해 주세요.";
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "로그인이 취소되었습니다.";
  }
  if (code === "auth/popup-blocked") {
    return "브라우저에서 로그인 팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.";
  }
  if (code === "auth/unauthorized-domain") {
    return "현재 접속 주소가 Firebase 승인 도메인에 등록되어 있지 않습니다.";
  }
  if (String(error?.message || "").includes("AADSTS50194")) {
    return "Microsoft single-tenant 앱 설정을 사용하려면 학교 tenant ID 설정이 필요합니다.";
  }
  if (code === "auth/network-request-failed") {
    return "로그인 서버에 연결하지 못했습니다. 네트워크 상태와 Firebase 로그인 제공자 설정을 확인해 주세요.";
  }

  return fallbackMessage;
}
