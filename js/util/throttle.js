// Global per-host request limiter and backoff bookkeeping.
//
// Every network request to a data provider (positions, routes, photos) goes
// through `limiter.run(host, fn)`, which guarantees request *starts* to one
// host are at least `minIntervalMs` apart across the whole app.

export class HostLimiter {
  constructor({ minIntervalMs = 1000, now = () => Date.now(), sleep } = {}) {
    this.minIntervalMs = minIntervalMs;
    this.now = now;
    this.sleep = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.next = new Map(); // host -> earliest next start time
    this.log = []; // [{host, t}] recent request starts, for diagnostics/tests
  }

  /** Reserve the next slot for `host`; resolves when it's our turn. */
  async acquire(host) {
    const now = this.now();
    const at = Math.max(now, this.next.get(host) ?? 0);
    this.next.set(host, at + this.minIntervalMs);
    if (at > now) await this.sleep(at - now);
    const t = this.now();
    this.log.push({ host, t });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
    return t;
  }

  async run(host, fn) {
    await this.acquire(host);
    return fn();
  }

  /** Smallest gap observed between consecutive starts to the same host. */
  minGap(host) {
    const ts = this.log.filter((e) => e.host === host).map((e) => e.t);
    let min = Infinity;
    for (let i = 1; i < ts.length; i++) min = Math.min(min, ts[i] - ts[i - 1]);
    return min;
  }
}

/** Exponential backoff state per key. */
export class Backoff {
  constructor({ baseMs = 2000, maxMs = 60000, now = () => Date.now() } = {}) {
    this.baseMs = baseMs;
    this.maxMs = maxMs;
    this.now = now;
    this.state = new Map(); // key -> {failures, until}
  }
  fail(key, retryAfterMs) {
    const s = this.state.get(key) ?? { failures: 0, until: 0 };
    s.failures += 1;
    const delay = Math.min(this.maxMs, Math.max(retryAfterMs ?? 0, this.baseMs * 2 ** (s.failures - 1)));
    s.until = this.now() + delay;
    this.state.set(key, s);
    return delay;
  }
  succeed(key) { this.state.delete(key); }
  blocked(key) { return (this.state.get(key)?.until ?? 0) > this.now(); }
  remaining(key) { return Math.max(0, (this.state.get(key)?.until ?? 0) - this.now()); }
  failures(key) { return this.state.get(key)?.failures ?? 0; }
}

export const limiter = new HostLimiter();

/** Trailing-edge throttle for UI work. */
export function throttle(fn, ms) {
  let last = 0;
  let timer = null;
  let lastArgs;
  return (...args) => {
    lastArgs = args;
    const now = Date.now();
    const wait = last + ms - now;
    if (wait <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        fn(...lastArgs);
      }, wait);
    }
  };
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
