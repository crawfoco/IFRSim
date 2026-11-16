/**
 * Nav sources for the glass panel's CDI and bearing pointers. Only the two VLOC radios for now;
 * a GPS source would be added to `NavSourceId` and to the cycle lists below, with a reading for
 * it, without changing the commands or the UI.
 */

export type NavSourceId = 'NAV1' | 'NAV2';
/** The HSI's (and the autopilot's) nav source. */
export type CdiSource = NavSourceId;
/** A bearing pointer's source; null = OFF. */
export type BearingSource = NavSourceId | null;

/** Order the CDI button steps through. */
export const CDI_SOURCES: readonly CdiSource[] = ['NAV1', 'NAV2'];
/** Order a BRG button steps through. */
export const BEARING_SOURCES: readonly BearingSource[] = [null, 'NAV1', 'NAV2'];

function next<T>(list: readonly T[], current: T): T {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length]!;
}

export const nextCdiSource = (s: CdiSource): CdiSource => next(CDI_SOURCES, s);
export const nextBearingSource = (s: BearingSource): BearingSource => next(BEARING_SOURCES, s);

/** The nav radio behind a VLOC source. */
export function radioOf(s: NavSourceId): 1 | 2 {
  return s === 'NAV1' ? 1 : 2;
}
