/**
 * Nav sources for the CDI and the bearing pointers: the two VLOC radios and, on a flight with
 * an RNAV approach in the GPS database (V3), the GPS. The cycle lists below are the VLOC-only
 * ones; the GPS is added to the cycle only when `withGps` is set, so V1/V2 flights behave as
 * before.
 */

export type VlocSource = 'NAV1' | 'NAV2';
export type NavSourceId = VlocSource | 'GPS';
/** The HSI's (and the autopilot's) nav source. */
export type CdiSource = NavSourceId;
/** A bearing pointer's source; null = OFF. */
export type BearingSource = NavSourceId | null;

/** Order the CDI button steps through (VLOC only). */
export const CDI_SOURCES: readonly CdiSource[] = ['NAV1', 'NAV2'];
/** Order a BRG button steps through (VLOC only). */
export const BEARING_SOURCES: readonly BearingSource[] = [null, 'NAV1', 'NAV2'];
const CDI_SOURCES_GPS: readonly CdiSource[] = ['NAV1', 'NAV2', 'GPS'];
const BEARING_SOURCES_GPS: readonly BearingSource[] = [null, 'NAV1', 'NAV2', 'GPS'];

function next<T>(list: readonly T[], current: T): T {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length]!;
}

export const nextCdiSource = (s: CdiSource, withGps = false): CdiSource =>
  next(withGps ? CDI_SOURCES_GPS : CDI_SOURCES, s);
export const nextBearingSource = (s: BearingSource, withGps = false): BearingSource =>
  next(withGps ? BEARING_SOURCES_GPS : BEARING_SOURCES, s);

export const isVloc = (s: NavSourceId): s is VlocSource => s !== 'GPS';

/** The nav radio behind a VLOC source. */
export function radioOf(s: VlocSource): 1 | 2 {
  return s === 'NAV1' ? 1 : 2;
}

/** Display label: VLOC1, VLOC2 or GPS. */
export const sourceLabel = (s: NavSourceId): string => (s === 'GPS' ? 'GPS' : `VLOC${radioOf(s)}`);
