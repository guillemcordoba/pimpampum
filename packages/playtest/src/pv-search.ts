/**
 * The PV range a hero-PV derivation searches, and the two bisections it
 * searches it with. Both assume the obvious direction: more PV, longer fights
 * and fewer knockouts.
 */

export const PV_MIN = 1;
/** Heroes sit near 26 today and every derivation so far stayed under 40. */
export const PV_MAX = 60;

/** The most PV at which `holds` (true up to some PV, false past it); null when
 *  it fails even at `PV_MIN`. */
export function mostPVWhere(holds: (pv: number) => boolean): number | null {
  if (!holds(PV_MIN)) return null;
  let lo = PV_MIN, hi = PV_MAX;
  if (holds(hi)) return hi;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (holds(mid)) lo = mid; else hi = mid; }
  return lo;
}

/** The least PV at which `holds` (false up to some PV, true past it); `PV_MAX`
 *  when it fails even there. */
export function leastPVWhere(holds: (pv: number) => boolean): number {
  let lo = PV_MIN, hi = PV_MAX;
  if (!holds(hi)) return hi;
  if (holds(lo)) return lo;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (holds(mid)) hi = mid; else lo = mid; }
  return hi;
}
