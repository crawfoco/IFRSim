/**
 * Display data for the glass PFD that the point-mass model does not carry. Pure; the flight
 * model is not changed.
 */
import { clamp } from '../geo/angles';
import { LIMITS } from './model';

const FPM_PER_KT = 6076.12 / 60;
const AOA_AT_MIN_DEG = 4;
const AOA_AT_MAX_DEG = 2;
const PITCH_LIMIT_DEG = 20;
/** Speed trend look-ahead. */
export const TREND_S = 6;

/**
 * Display pitch: the flight-path angle (from VS and TAS) plus a nominal angle of attack that
 * falls linearly from 4° at 80 KIAS to 2° at 110 KIAS. Clamped to ±20°.
 */
export function displayPitchDeg(vsFpm: number, tasKt: number, iasKt: number): number {
  const fpaDeg = (Math.atan2(vsFpm / FPM_PER_KT, Math.max(tasKt, 1)) * 180) / Math.PI;
  const f =
    (clamp(iasKt, LIMITS.iasMinKt, LIMITS.iasMaxKt) - LIMITS.iasMinKt) /
    (LIMITS.iasMaxKt - LIMITS.iasMinKt);
  const aoaDeg = AOA_AT_MIN_DEG + f * (AOA_AT_MAX_DEG - AOA_AT_MIN_DEG);
  return clamp(fpaDeg + aoaDeg, -PITCH_LIMIT_DEG, PITCH_LIMIT_DEG);
}

/**
 * Airspeed trend: the change expected over the next 6 s, from the model's acceleration toward
 * the power-selector target. Zero within 1 kt (the trend vector is hidden).
 */
export function speedTrendKt(iasKt: number, iasCmdKt: number): number {
  const max = LIMITS.iasRateKtPerS * TREND_S;
  const d = clamp(iasCmdKt - iasKt, -max, max);
  return Math.abs(d) < 1 ? 0 : d;
}
