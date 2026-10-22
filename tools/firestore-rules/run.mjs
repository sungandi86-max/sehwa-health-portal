import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { PROJECT_ID, EMULATOR_VERSION, EMULATOR_SHA256, requireLocalTarget } from "./safety.mjs";

// This runner NEVER downloads, authenticates or deploys. Install the official
// artifact separately; only a verified binary can start a loopback-only run.
const root = fileURLToPath(new URL("../../", import.meta.url));
const jar = process.env.FIRESTORE_EMULATOR_JAR;
let directory, emulator, tests;
let interrupted = false;
async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise((done) => child.once("exit", done));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 4000);
  timer.unref();
  await ended;
  clearTimeout(timer);
}
const interrupt = () => { interrupted = true; tests?.kill("SIGTERM"); emulator?.kill("SIGTERM"); };
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
try {
  if (!jar) throw new Error("EMULATOR_JAR_REQUIRED (set FIRESTORE_EMULATOR_JAR to the official verified artifact)");
  const jarPath = resolve(jar);
  await access(jarPath);
  if (createHash("sha256").update(await readFile(jarPath)).digest("hex") !== EMULATOR_SHA256) {
    throw new Error("EMULATOR_CHECKSUM_MISMATCH");
  }
  directory = await mkdtemp(`${tmpdir()}/sehwa-rules-`);
  const portServer = createServer();
  await new Promise((done, reject) => { portServer.once("error", reject); portServer.listen(0, "127.0.0.1", done); });
  const port = portServer.address().port;
  await new Promise((done) => portServer.close(done));
  const endpoint = `127.0.0.1:${port}`;
  requireLocalTarget(PROJECT_ID, endpoint);
  // A fresh environment excludes Firebase/Google credentials and local config.
  // Retain proxy/CA settings; the test target remains strictly loopback.
  const env = Object.fromEntries(["PATH", "LANG", "TZ", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
    "http_proxy", "https_proxy", "all_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS"]
    .filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
  env.NO_PROXY = [env.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(",");
  env.no_proxy = env.NO_PROXY;
  Object.assign(env, { HOME: directory, FIRESTORE_EMULATOR_HOST: endpoint,
    GCLOUD_PROJECT: PROJECT_ID, GOOGLE_CLOUD_PROJECT: PROJECT_ID, SEHWA_RULES_RUNNER: "local-only" });
  const rulesFile = resolve(directory, "firestore.rules");
  await writeFile(rulesFile, await readFile(resolve(root, "firestore.rules")));
  emulator = spawn("java", ["-jar", jarPath, "--host", "127.0.0.1", "--port", String(port),
    "--project_id", PROJECT_ID, "--single_project_mode", "true", "--rules", rulesFile], { cwd: directory, env, stdio: ["ignore", "pipe", "pipe"] });
  let launchError;
  emulator.once("error", (error) => { launchError = error; });
  emulator.stdout.resume();
  emulator.stderr.resume();
  let ready = false;
  for (let attempt = 0; attempt < 100 && !interrupted; attempt++) {
    if (launchError || emulator.exitCode !== null || emulator.signalCode !== null) throw new Error("EMULATOR_START_FAILED");
    try {
      const response = await fetch(`http://${endpoint}/`, { signal: AbortSignal.timeout(500) });
      if (response.status < 500) { ready = true; break; }
    } catch {}
    await delay(200);
  }
  if (!ready) throw new Error("EMULATOR_START_TIMEOUT");
  console.log(`Firestore Emulator ${EMULATOR_VERSION}: loopback ready; project=${PROJECT_ID}`);
  tests = spawn(process.execPath, ["--test", "--test-concurrency=1", resolve(root, "tools/firestore-rules/matrix.mjs")], {
    cwd: directory, env, stdio: "inherit" });
  const testTimer = setTimeout(() => tests.kill("SIGTERM"), 180000);
  testTimer.unref();
  const code = await new Promise((done, reject) => { tests.once("error", reject); tests.once("exit", (code) => done(code)); });
  clearTimeout(testTimer);
  const reportPath = resolve(tmpdir(), "sehwa-firestore-rules-results.json");
  await writeFile(reportPath, await readFile(resolve(directory, "rules-matrix-results.json")));
  console.log(`Matrix evidence: ${reportPath}`);
  if (code !== 0 || interrupted) throw new Error("RULES_MATRIX_FAILED");
} catch (error) {
  console.error(`BLOCKED/FAILED: ${error.code === "ENOENT" ? "EMULATOR_JAR_OR_JAVA_MISSING" : error.message}`);
  process.exitCode = 1;
} finally {
  await stop(tests);
  await stop(emulator);
  if (directory) await rm(directory, { recursive: true, force: true });
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}
