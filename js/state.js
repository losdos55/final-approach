// Tiny central store with shallow-merge updates and pub/sub.

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      for (const fn of subs) {
        try { fn(state, next); } catch (err) { console.warn('[store] subscriber failed', err); }
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

/** Very small event emitter for non-state signals (data arrived, toasts…). */
export function createEmitter() {
  const map = new Map();
  return {
    on(name, fn) {
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(fn);
      return () => map.get(name)?.delete(fn);
    },
    emit(name, payload) {
      for (const fn of map.get(name) ?? []) {
        try { fn(payload); } catch (err) { console.warn(`[events] ${name} handler failed`, err); }
      }
    },
  };
}
