/**
 * Instrument geometry: how sensor readings map onto needle angles and deflections.
 * Pure functions, so the drawn instruments can be tested without a browser.
 *
 * SVG angles are degrees clockwise from 12 o'clock.
 */
import { clamp, normalize360 } from '../../sim/geo/angles';
import { GS_FULL_SCALE_DEG } from '../../sim/nav/gs';
import { LOC_FULL_SCALE_DEG } from '../../sim/nav/loc';
import type { NavReading } from '../../sim/nav/radios';
import type { GpsReading } from '../../sim/gps/receiver';
import { VOR_FULL_SCALE_DEG } from '../../sim/nav/vor';

/** The HSI and CDI have two dots each side of centre; full scale is 2 dots. */
export const FULL_SCALE_DOTS = 2;

export interface CourseDeviation {
  /** −2…+2; + = course is to the right (needle right). */
  dots: number;
  /** Red NAV flag: untuned, out of range, overhead or abeam. */
  flag: boolean;
  /** TO/FROM window; null for a localizer or when flagged. */
  toFrom: 'TO' | 'FROM' | null;
}

export interface GlideslopeDeviation {
  /** −2…+2; + = glide path above (pointer up). */
  dots: number;
  flag: boolean;
}

export function courseDeviation(r: NavReading): CourseDeviation {
  const ind = r.indication;
  if (!ind || ind.flag) return { dots: 0, flag: true, toFrom: null };
  const fullScale = ind.kind === 'VOR' ? VOR_FULL_SCALE_DEG : LOC_FULL_SCALE_DEG;
  const dots = clamp((ind.deviationDeg / fullScale) * FULL_SCALE_DOTS, -2, 2);
  const toFrom = ind.kind === 'VOR' && ind.toFrom !== 'OFF' ? ind.toFrom : null;
  return { dots, flag: false, toFrom };
}

/**
 * Glideslope pointer. Null when no ILS frequency is tuned (the pointer is stowed);
 * flagged when an ILS is tuned but its glideslope is out of service or out of range.
 */
export function glideslopeDeviation(r: NavReading): GlideslopeDeviation | null {
  if (r.station?.kind !== 'LOC') return null;
  if (!r.gs || r.gs.flag) return { dots: 0, flag: true };
  return {
    dots: clamp((r.gs.deviationDeg / GS_FULL_SCALE_DEG) * FULL_SCALE_DOTS, -2, 2),
    flag: false,
  };
}

/** GPS needle: linear (or angular) full scale from the receiver, two dots each side. */
export function gpsDeviation(g: GpsReading): CourseDeviation {
  if (g.flag) return { dots: 0, flag: true, toFrom: null };
  return {
    dots: clamp(g.deviation * FULL_SCALE_DOTS, -2, 2),
    flag: false,
    toFrom: g.toFrom === 'OFF' ? null : g.toFrom,
  };
}

/** GPS glidepath pointer (LPV, LNAV/VNAV, or the advisory +V); null when there is none. */
export function gpsGlidepath(g: GpsReading): GlideslopeDeviation | null {
  if (!g.gp) return null;
  if (g.gp.flag) return { dots: 0, flag: true };
  return {
    dots: clamp((g.gp.deviationDeg / GS_FULL_SCALE_DEG) * FULL_SCALE_DOTS, -2, 2),
    flag: false,
  };
}

/** HSI: the compass card turns so the heading is under the lubber line. */
export const hsiCardDeg = (headingMagDeg: number) => normalize360(-headingMagDeg);
/** HSI: a course or bug drawn on the card, relative to the lubber line. */
export const hsiRelativeDeg = (bearingMagDeg: number, headingMagDeg: number) =>
  normalize360(bearingMagDeg - headingMagDeg);

/** Airspeed: 40 kt at 20°, 160 kt at 340°. */
export const ASI_MIN_KT = 40;
export const ASI_MAX_KT = 160;
export function asiNeedleDeg(kt: number): number {
  const k = clamp(kt, ASI_MIN_KT, ASI_MAX_KT);
  return 20 + ((k - ASI_MIN_KT) / (ASI_MAX_KT - ASI_MIN_KT)) * 320;
}

/** Vertical speed: level at 9 o'clock; ±2000 fpm at ±170°. */
export const VSI_MAX_FPM = 2000;
export function vsiNeedleDeg(fpm: number): number {
  return -90 + (clamp(fpm, -VSI_MAX_FPM, VSI_MAX_FPM) / VSI_MAX_FPM) * 170;
}

/** Altimeter: long hand one turn per 1000 ft, short hand one turn per 10,000 ft. */
export function altimeterHandsDeg(altFt: number): { hundreds: number; thousands: number } {
  return {
    hundreds: normalize360((altFt / 1000) * 360),
    thousands: normalize360((altFt / 10_000) * 360),
  };
}
