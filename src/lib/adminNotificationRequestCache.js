export function createAdminNotificationRequestCache({ ttlMs = 45_000, now = Date.now } = {}) {
  const cached = new Map();
  const pending = new Map();

  async function run(key, loader, { force = false } = {}) {
    if (pending.has(key)) return pending.get(key);

    const entry = cached.get(key);
    if (!force && entry && now() - entry.fetchedAt < ttlMs) return entry.value;

    const request = Promise.resolve()
      .then(loader)
      .then((value) => {
        cached.set(key, { value, fetchedAt: now() });
        return value;
      })
      .finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });

    pending.set(key, request);
    return request;
  }

  function invalidate(key) {
    if (key) cached.delete(key);
    else cached.clear();
  }

  return { invalidate, run };
}
