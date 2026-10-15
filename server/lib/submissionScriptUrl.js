import { trainingEnvironment } from "./trainingDeployment.js";

export function submissionScriptUrl(context = process.env) {
  const environment = trainingEnvironment(context);
  const url = environment === "qa" ? context.QA_SUBMISSION_GAS_URL
    : environment === "production" ? context.GAS_URL || context.VITE_GAS_BASE_URL : "";
  return typeof url === "string" && /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url) ? url : "";
}
