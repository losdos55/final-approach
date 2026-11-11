// Watchlist presets and matching. Pure functions.

// ICAO Doc 8643 type designators. Notes from live-data verification:
// - The KC-46A Pegasus is reported by ADS-B databases as "B762" (with the military
//   flag), so the K46 entry also matches military B762s via ALIASES.
// - The KC-10 Extender (retired from USAF service in 2024) uses the DC10 designator;
//   "KC10" matches military DC10s.
// - The F/A-18 Hornet is F18H; the Super Hornet/Growler is F18S. Both are in "Fighters".
export const PRESETS = [
  {
    id: 'mil-heavies',
    name: 'Military Heavies',
    types: ['C17', 'C5M', 'C30J', 'C130', 'K35R', 'K46', 'KC10', 'B52', 'B1', 'E3TF', 'P8'],
  },
  { id: 'fighters', name: 'Fighters', types: ['F35', 'F16', 'F15', 'F18H', 'F18S', 'F22', 'A10', 'T38'] },
  { id: 'rotary', name: 'Rotary', types: ['H60', 'H64', 'H47', 'V22', 'EC35', 'AS50'] },
  { id: 'widebodies', name: 'Widebodies', types: ['B744', 'B748', 'B77W', 'B788', 'B789', 'A359', 'A388', 'MD11'] },
];

/** Watchlist designator → extra predicate for aircraft whose DB type differs. */
const ALIASES = {
  K46: (ac) => ac.military && ac.type === 'B762',
  KC10: (ac) => ac.military && ac.type === 'DC10',
  E3TF: (ac) => ac.type === 'E3CF',
};

/** Union a preset's types into a watchlist (returns a new watchlist). */
export function addPreset(watchlist, presetId) {
  const p = PRESETS.find((x) => x.id === presetId);
  if (!p) return watchlist;
  return { ...watchlist, types: [...new Set([...(watchlist.types || []), ...p.types])] };
}

/**
 * Why (if at all) an aircraft matches the watchlist.
 * @returns {null | 'type' | 'reg' | 'callsign' | 'military'}
 */
export function matchReason(ac, watchlist) {
  if (!watchlist || !ac) return null;
  const types = watchlist.types || [];
  if (ac.type && types.includes(ac.type)) return 'type';
  for (const t of types) if (ALIASES[t]?.(ac)) return 'type';
  if (ac.reg && (watchlist.regs || []).includes(ac.reg)) return 'reg';
  if (ac.callsign && (watchlist.callsigns || []).some((p) => ac.callsign.startsWith(p))) return 'callsign';
  if (watchlist.allMilitary && ac.military) return 'military';
  return null;
}

export const isWatched = (ac, watchlist) => matchReason(ac, watchlist) !== null;
