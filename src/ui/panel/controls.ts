/**
 * What each panel control sends. Pure: given the current (view) state and a knob turn,
 * return the sim command. Keeping this out of the components makes it unit-testable.
 */
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

export const vsKnob = (s: SimState, steps: number): Command => ({
  type: 'vsTarget',
  fpm: s.ap.vsRefFpm + steps * 100,
});

export const speedKnob = (s: SimState, steps: number, big: boolean): Command => ({
  type: 'speed',
  kt: s.panel.iasCmdKt + steps * (big ? 5 : 1),
});

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
