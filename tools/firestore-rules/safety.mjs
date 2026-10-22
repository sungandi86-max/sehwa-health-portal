export const PROJECT_ID = "demo-sehwa-rules-local";
export const EMULATOR_VERSION = "1.19.8";
export const EMULATOR_SHA256 = "9d43599ed6151199e8d604dc87fac51218e49e5f3a48519b1ae560bbe5e3382d";
export function requireLocalTarget(projectId, endpoint) {
  if (projectId !== PROJECT_ID || !/^127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(endpoint) ||
      Number(endpoint.split(":")[1]) > 65535) throw new Error("LOCAL_EMULATOR_TARGET_REQUIRED");
  return { host: "127.0.0.1", port: Number(endpoint.split(":")[1]) };
}
