// Offline Firestore mock with serialized transactions and real project metadata.
export function staffReceiptDb(projectId = "isolated-health-qa") {
  const records = new Map(), calls = [], failures = new Map();
  let queue = Promise.resolve();
  const fail = (op, path) => {
    const key = `${op}:${path}`, count = failures.get(key) || 0;
    if (count) { failures.set(key, count - 1); throw new Error("mock injected failure"); }
  };
  const snapshot = (path) => ({ id: path.split("/").at(-1), exists: records.has(path), data: () => records.get(path) });
  const ref = (path) => ({ path, id: path.split("/").at(-1),
    get: async () => { calls.push(["get", path]); fail("get", path); return snapshot(path); },
    create: async (value) => { calls.push(["create", path]); fail("create", path); if (records.has(path)) throw Object.assign(new Error("exists"), { code: 6 }); records.set(path, value); },
    update: async (value) => { calls.push(["update", path]); fail("update", path); if (!records.has(path)) throw new Error("missing"); records.set(path, { ...records.get(path), ...value }); },
    set: async (value, options) => { calls.push(["set", path]); fail("set", path); records.set(path, options?.merge ? { ...records.get(path), ...value } : value); },
  });
  const db = { app: { options: { projectId } }, records, calls, failures,
    collection: (name) => ({ doc: (id) => ref(`${name}/${id}`) }),
    runTransaction: async (fn) => {
      let release; const prior = queue; queue = new Promise((done) => { release = done; }); await prior;
      const changes = [];
      try {
        const result = await fn({ get: (r) => r.get(), create: (r, value) => changes.push(["create", r, value]),
          update: (r, value) => changes.push(["update", r, value]), set: (r, value, options) => changes.push(["set", r, value, options]) });
        const saved = new Map(records);
        try { for (const [op, r, value, options] of changes) await r[op](value, options); }
        catch (error) { records.clear(); for (const [key, value] of saved) records.set(key, value); throw error; }
        return result;
      } finally { release(); }
    } };
  return db;
}

// Upgrade legacy handler fixtures to a transaction-capable offline DB. The real
// receipt protocol still executes; no runtime validation or pipeline is bypassed.
export function staffReceiptTestOptions(options, context) {
  const runtime = context.APP_ENV || (context.VERCEL_ENV === "production" ? "production" : "unknown");
  const db = staffReceiptDb(runtime === "production" ? "sehwa-health-portal-v2" : "isolated-health-qa");
  const bound = { ...options, context: { ...context, ...(runtime === "qa" ? { QA_FIREBASE_PROJECT_ID: "isolated-health-qa" } : {}) } };
  for (const name of ["verifyStaff", "verifyTb"]) if (options[name]) bound[name] = async (...args) => {
    const value = await options[name](...args);
    return value.ok ? { ...value, db: value.db?.runTransaction ? value.db : db,
      submitter: value.submitter || { uid: "mock-approved-uid", email: "mock@example.invalid", displayName: "synthetic" } } : value;
  };
  return bound;
}
