// Explicit, synthetic server bindings for existing mocked submission scenarios.
// Real handler tests use their own context and never use this adapter.
export function submissionResourceContext(environment, options) {
  const prefix = environment === "production" ? "" : "QA_";
  const context = { APP_ENV: environment || "unknown" };
  context[environment === "production" ? "GAS_URL" : "QA_SUBMISSION_GAS_URL"] = options.destinationUrl ?? "https://script.google.com/macros/s/fixture/exec";
  context[`${prefix}SUBMISSION_PROXY_SECRET`] = options.proxySecret ?? "fixture-only-submission-secret-32bytes-minimum";
  for (const [field, suffix] of [["qaCprFolderId", "CPR_DRIVE_FOLDER_ID"],
    ["qaTbCertificateFolderId", "TB_CERTIFICATE_DRIVE_FOLDER_ID"], ["qaStudentReplyFolderId", "STUDENT_REPLY_DRIVE_FOLDER_ID"]]) {
    context[`QA_${suffix}`] = options[field];
  }
  return context;
}
