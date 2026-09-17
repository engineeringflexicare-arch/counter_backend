// Small bounded in-process cache for the single-instance/free-tier deployment.
// It prevents duplicate concurrent Firebase/Mongo work without retaining large
// CounterHistory arrays after a request completes.
const store = new Map();
const pending = new Map();
const MAX_ENTRIES = 500;

const now = () => Date.now();

export const cacheGet = (key) => {
  const item = store.get(key);
  if (!item) return undefined;
  if (item.expiresAt <= now()) {
    store.delete(key);
    return undefined;
  }
  return item.value;
};

export const cacheSet = (key, value, ttlMs) => {
  if (store.size >= MAX_ENTRIES && !store.has(key)) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: now() + ttlMs });
  return value;
};

export const cached = async (key, ttlMs, loader) => {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;

  const running = pending.get(key);
  if (running) return running;

  const promise = Promise.resolve()
    .then(loader)
    .then((value) => {
      cacheSet(key, value, ttlMs);
      return value;
    })
    .finally(() => pending.delete(key));

  pending.set(key, promise);
  return promise;
};

export const invalidateCachePrefix = (prefix) => {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
};
