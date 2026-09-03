import { signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider, microsoftProvider } from "./firebase.js";

const SCHOOL_MICROSOFT_DOMAIN = "@sehwa-gs.hs.kr";

const PROVIDER_IDS = {
  google: "google.com",
  microsoft: "microsoft.com",
};

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

export async function signInWithMicrosoft() {
  const result = await signInWithPopup(auth, microsoftProvider);
  const blockedMessage = getMicrosoftSchoolDomainBlockMessage(result.user);

  if (blockedMessage) {
    await signOut(auth);
    throw new FirebaseAuthPolicyError(blockedMessage, "auth/invalid-school-domain");
  }

  return result;
}

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutFirebase() {
  return signOut(auth);
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
    return "로그인 창이 닫혔습니다. 다시 시도해 주세요.";
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
