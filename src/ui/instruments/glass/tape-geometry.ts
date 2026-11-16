/**
 * Pure geometry for the glass PFD tapes and VSI scale (layout.ts coordinates). The tapes are
 * re-rendered every frame, so tick lists only cover the visible window.
 */
import { ATT, TAPE, VSI } from './layout';

/** Half the tape height in SVG units (the current-value box sits on ATT.cy). */
export const TAPE_HALF_PX = Math.min(ATT.cy - TAPE.top, TAPE.bottom - ATT.cy);

/**
 * Multiples of `step` within `halfRange` (value units) of `value`, ascending, optionally
 * floored at `min` (e.g. no negative airspeed ticks).
 */
export function visibleTicks(
  value: number,
  step: number,
  halfRange: number,
  min = -Infinity,
): number[] {
  const lo = Math.max(min, Math.ceil((value - halfRange) / step) * step);
  const hi = Math.floor((value + halfRange) / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/** Screen y of tape value `v` when `current` sits on ATT.cy (higher values above). */
export function tapeY(v: number, current: number, pxPerUnit: number): number {
  return ATT.cy - (v - current) * pxPerUnit;
}

export interface Pinned {
  y: number;
  pinned: 'top' | 'bottom' | null;
}

/** Clamp a bug's y to [minY, maxY], reporting which edge it is pinned to. */
export function pinY(y: number, minY: number, maxY: number): Pinned {
  if (y < minY) return { y: minY, pinned: 'top' };
  if (y > maxY) return { y: maxY, pinned: 'bottom' };
  return { y, pinned: null };
}

/** True when y lies on the visible tape. */
export const onTape = (y: number) => y >= TAPE.top && y <= TAPE.bottom;

/** VSI pointer y for a vertical speed: linear, clamped at ±VSI.maxFpm over the half-height. */
export function vsiY(fpm: number): number {
  const c = Math.max(-VSI.maxFpm, Math.min(VSI.maxFpm, fpm));
  return ATT.cy - (c / VSI.maxFpm) * TAPE_HALF_PX;
}

/** Altitude readout: rounded to 10 ft with a thousands comma, e.g. "7,210", "-40". */
export function formatAlt(ft: number): string {
  const r = Math.round(ft / 10) * 10;
  const s = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return r < 0 ? `-${s}` : s;
}

/** Airspeed readout: whole knots, never negative. */
export const formatIas = (kt: number) => String(Math.max(0, Math.round(kt)));

/** VSI digits: |vs| rounded to 50 fpm, or null below 100 fpm (hidden). */
export function formatVs(fpm: number): string | null {
  if (Math.abs(fpm) < 100) return null;
  return String(Math.round(Math.abs(fpm) / 50) * 50);
}
