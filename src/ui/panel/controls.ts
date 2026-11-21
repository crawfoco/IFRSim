/**
 * What each panel control sends. Pure: given the current (view) state and a knob turn,
 * return the sim command. Keeping this out of the components makes it unit-testable.
 */
import { ALT_PRESELECT_MAX_FT } from '../../sim/commands';
import type { Command, RadioId, SimState } from '../../sim/state';

/**
 * How panel controls talk to the sim. Knobs pass a function so the command is computed
 * from the latest state, including commands queued earlier in the same frame; otherwise
 * several wheel or key events between renders would each start from the same stale value.
 */
export type Send = (c: Command | ((latest: SimState) => Command)) => void;

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** NAV frequencies in hundredths of a MHz: 108.00…117.95, 50 kHz spacing. */
export function stepFrequency(mhz: number, part: 'mhz' | 'khz', steps: number): number {
  const k = Math.round(mhz * 100);
  let whole = Math.floor(k / 100);
  let frac = k - whole * 100;
  if (part === 'mhz') whole = 108 + mod(whole - 108 + steps, 10);
  else frac = mod(frac + steps * 5, 100);
  return (whole * 100 + frac) / 100;
}

/**
 * A frequency typed into a standby window: "113.85", "113.8" (= 113.80), "113", or the
 * digits alone ("11385", "1138"). Returns MHz, or null unless it is a NAV frequency
 * (108.00…117.95) on the 50 kHz spacing; 113.87 is rejected, not rounded.
 */
export function parseFrequency(text: string): number | null {
  const t = text.trim().replace(',', '.');
  let m = /^(\d{3})(?:\.(\d{0,2}))?$/.exec(t);
  if (!m) {
    const digits = /^(\d{3})(\d{1,2})$/.exec(t);
    if (!digits) return null;
    m = digits;
  }
  const k = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (k < 10800 || k > 11795 || k % 5 !== 0) return null;
  return k / 100;
}

/**
 * A typed heading or course: whole degrees 0…360, "°" allowed; 0 reads as 360 (north),
 * as a heading bug or course is set.
 */
export function parseDegrees(text: string): number | null {
  const m = /^(\d{1,3})°?$/.exec(text.trim());
  if (!m) return null;
  const deg = Number(m[1]);
  if (deg > 360) return null;
  return deg === 0 ? 360 : deg;
}

/**
 * A typed altitude preselect in feet: "4000", "4,000" or "4 000", 0 to 18,000 in
 * hundreds. Returns feet, or null; 4050 is rejected, not rounded.
 */
export function parseAltitude(text: string): number | null {
  const t = text.trim().replace(/[,\s]/g, '');
  if (!/^\d{1,5}$/.test(t)) return null;
  const ft = Number(t);
  if (ft > ALT_PRESELECT_MAX_FT || ft % 100 !== 0) return null;
  return ft;
}

export const formatMHz = (mhz: number) => mhz.toFixed(2);
export const formatCourse = (deg: number) => String(Math.round(deg) % 360 || 360).padStart(3, '0');

export const headingKnob = (s: SimState, steps: number, big: boolean): Command => ({
  type: 'headingBug',
  deg: s.panel.headingBugDeg + steps * (big ? 10 : 1),
});

export const altitudeKnob = (s: SimState, steps: number, big: boolean): Command => ({
  type: 'altPreselect',
  ft: s.panel.altPreselectFt + steps * (big ? 1000 : 100),
});

/** How far one press of the VS +/− buttons moves the vertical-speed target. */
export const VS_STEP_FPM = 500;

/** The VS buttons: move the vertical-speed target by `fpm` (the sim clamps it). */
export const vsStep = (s: SimState, fpm: number): Command => ({
  type: 'vsTarget',
  fpm: s.ap.vsRefFpm + fpm,
});

/** The target speeds the speed menu offers, in KIAS. */
export const SPEED_CHOICES = [80, 90, 100] as const;

export const courseKnob = (s: SimState, radio: RadioId, steps: number, big: boolean): Command => ({
  type: 'course',
  radio,
  deg: s.radios[radio === 1 ? 'nav1' : 'nav2'].obsDeg + steps * (big ? 10 : 1),
});

export const frequencyKnob = (
  s: SimState,
  radio: RadioId,
  part: 'mhz' | 'khz',
  steps: number,
): Command => ({
  type: 'standby',
  radio,
  mhz: stepFrequency(s.radios[radio === 1 ? 'nav1' : 'nav2'].standbyMHz, part, steps),
});

/** Approach category from the power selector (SPEC: A ≤ 90 kt, B 91–110). */
export const approachCategory = (iasKt: number): 'A' | 'B' => (iasKt <= 90 ? 'A' : 'B');
