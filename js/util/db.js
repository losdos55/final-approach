// Minimal IndexedDB key/value cache with TTL and an in-memory fallback.

const DB_NAME = 'final-approach';
const DB_VERSION = 1;
export const STORES = ['photos', 'routes'];

let dbPromise = null;
const memory = new Map(STORES.map((s) => [s, new Map()]));

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (!globalThis.indexedDB) return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve) => {
    try {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

/** Get a cached value if younger than ttlMs. Returns undefined on miss. */
export async function cacheGet(store, key, ttlMs) {
  const mem = memory.get(store).get(key);
  if (mem && Date.now() - mem.t < ttlMs) return mem.v;
  const db = await open();
  if (!db) return undefined;
  const rec = await tx(db, store, 'readonly', (s) => s.get(key));
  if (rec && Date.now() - rec.t < ttlMs) {
    memory.get(store).set(key, rec);
    return rec.v;
  }
  return undefined;
}

/** Synchronous peek at the in-memory layer (for rendering lists without awaiting). */
export function cachePeek(store, key) {
  return memory.get(store).get(key)?.v;
}

export async function cacheSet(store, key, value) {
  const rec = { t: Date.now(), v: value };
  memory.get(store).set(key, rec);
  const db = await open();
  if (!db) return;
  await tx(db, store, 'readwrite', (s) => s.put(rec, key));
}

/** Remove entries older than maxAgeMs (called occasionally). */
export async function cachePrune(store, maxAgeMs) {
  const db = await open();
  if (!db) return;
  await tx(db, store, 'readwrite', (s) => {
    const req = s.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      if (Date.now() - (c.value?.t ?? 0) > maxAgeMs) c.delete();
      c.continue();
    };
    return req;
  });
}
