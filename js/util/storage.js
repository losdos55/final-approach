// localStorage wrapper that never throws (Safari private mode, quota, disabled
// storage) and falls back to an in-memory map for the session.

export function createStorage(backend) {
  const memory = new Map();
  let ls = backend;
  if (ls === undefined) {
    try {
      ls = globalThis.localStorage;
      const probe = '__fa_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
    } catch {
      ls = null;
    }
  }
  return {
    get persistent() { return !!ls; },
    get(key) {
      try { if (ls) return ls.getItem(key); } catch { /* fall through */ }
      return memory.has(key) ? memory.get(key) : null;
    },
    set(key, value) {
      memory.set(key, value);
      try { if (ls) ls.setItem(key, value); } catch { /* keep in memory */ }
    },
    remove(key) {
      memory.delete(key);
      try { if (ls) ls.removeItem(key); } catch { /* ignore */ }
    },
    getJSON(key) {
      const v = this.get(key);
      if (v == null) return null;
      try { return JSON.parse(v); } catch { return null; }
    },
    setJSON(key, value) { this.set(key, JSON.stringify(value)); },
  };
}

export const storage = createStorage();
