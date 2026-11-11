// Demo mode (?demo=1): replays the recorded fixture near KIWA on a loop so the
// app can be shown and tested offline or when the sky is quiet.

export async function loadDemo(url = './fixtures/kiwa-demo.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`demo fixture: HTTP ${res.status}`);
  const fixture = await res.json();
  const frames = fixture.frames;
  const intervalMs = (fixture.intervalSec || 5) * 1000;
  const startedAt = Date.now();
  let lastIndex = -1;
  let cycle = 0;

  return {
    fixture,
    center: fixture.center,
    /** Frame for "now", advancing at the recorded cadence regardless of poll rate. */
    next() {
      const elapsed = Date.now() - startedAt;
      const abs = Math.floor(elapsed / intervalMs);
      const index = abs % frames.length;
      const thisCycle = Math.floor(abs / frames.length);
      const reset = thisCycle !== cycle && lastIndex !== -1;
      cycle = thisCycle;
      lastIndex = index;
      // Re-stamp as live: positions are as old as they were when recorded.
      return { now: Date.now(), ac: frames[index].ac, reset };
    },
  };
}
