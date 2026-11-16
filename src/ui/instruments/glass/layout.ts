/**
 * Glass PFD layout contract. The whole PFD is ONE SVG with viewBox 0 0 PFD_W PFD_H; every
 * glass component renders a <g> in these absolute coordinates (no nested <svg>). Draw order
 * in Pfd.tsx: Attitude (background, full area) → tapes/VSI → HSI → boxes → mode bar → alerts.
 *
 * Original artwork: no manufacturer names, logos or trademarked styling. Colours live in
 * glass.css (classes prefixed `g-`).
 */
import type { CdiSource } from '../../../sim/nav/source';
import type { CourseDeviation, GlideslopeDeviation } from '../geometry';

export const PFD_W = 560;
export const PFD_H = 420;

/** Mode annunciator bar across the top. */
export const MODE_BAR = { x: 0, y: 0, w: PFD_W, h: 24 } as const;

/** Attitude: aircraft symbol / horizon reference point; 1° of pitch = PITCH_PX units. */
export const ATT = { cx: 280, cy: 150, pitchPx: 6, bankR: 96 } as const;

/** Tapes share the attitude's vertical centre (the current value box sits on ATT.cy). */
export const TAPE = { top: 40, bottom: 260 } as const;
/** Airspeed tape; px per knot. */
export const SPD = { x: 34, w: 64, pxPerKt: 4 } as const;
/** Altitude tape; px per foot (100 ft = 30 px). */
export const ALT = { x: 432, w: 72, pxPerFt: 0.3 } as const;
/** VSI scale right of the altitude tape; ±2000 fpm over the tape's half-height. */
export const VSI = { x: 508, w: 40, maxFpm: 2000 } as const;
/** Selected-altitude readout above the altitude tape; BARO box below it. */
export const SEL_ALT_BOX = { x: 432, y: 26, w: 72, h: 14 } as const;
export const BARO_BOX = { x: 432, y: 262, w: 116, h: 14 } as const;

/** HSI rose: centre and radius; heading readout box sits just above the rose. */
export const HSI = { cx: 280, cy: 346, r: 68 } as const;
/** HDG and CRS selected-value boxes either side of the heading readout. */
export const HDG_BOX = { x: 150, y: 268, w: 64, h: 16 } as const;
export const CRS_BOX = { x: 346, y: 268, w: 64, h: 16 } as const;
/** Bearing info boxes, bottom left (BRG1) and bottom right (BRG2). */
export const BRG1_BOX = { x: 8, y: 352, w: 128, h: 60 } as const;
export const BRG2_BOX = { x: 424, y: 352, w: 128, h: 60 } as const;

// ---- Component props (the contract the pieces are built against) ----

export interface AttitudeProps {
  /** Display pitch, + nose up (from sim/aircraft/attitude displayPitchDeg). */
  pitchDeg: number;
  /** + right wing down. */
  bankDeg: number;
}

export interface SpeedTapeProps {
  iasKt: number;
  /** Speed change expected in 6 s; 0 hides the trend vector. */
  trendKt: number;
}

export interface Minimums {
  kind: 'DA' | 'MDA';
  altFt: number;
}

export interface AltTapeProps {
  altitudeFt: number;
  selectedAltFt: number;
  /** DA/MDA bug on the tape; null hides it. */
  minimums: Minimums | null;
}

export interface VsiProps {
  vsFpm: number;
  /** Selected VS bug (VS mode only); null hides it. */
  selectedVsFpm: number | null;
}

export interface GlassHsiProps {
  headingMagDeg: number;
  headingBugDeg: number;
  /** CRS of the CDI source's radio, magnetic. */
  courseDeg: number;
  cdiSource: CdiSource;
  deviation: CourseDeviation;
  /** Null when the CDI source is not an ILS (indicator hidden); flag when tuned but invalid. */
  glideslope: GlideslopeDeviation | null;
  /** Magnetic bearing to the station for BRG1 (single line) and BRG2 (double line); null hides. */
  bearing1Deg: number | null;
  bearing2Deg: number | null;
}
