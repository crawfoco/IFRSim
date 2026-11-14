/** Angle helpers. All public angles are in degrees. */

export const DEG = Math.PI / 180;

/** Wrap to [0, 360). */
export function normalize360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r === 0 ? 0 : r; // avoid -0
}

/** a − b wrapped to (−180, 180]. Positive means a is clockwise of b. */
export function signedAngleDiff(aDeg: number, bDeg: number): number {
  const d = normalize360(aDeg - bDeg);
  return d > 180 ? d - 360 : d;
}

export function reciprocal(courseDeg: number): number {
  return normalize360(courseDeg + 180);
}

/** Magnetic variation is east-positive: true = magnetic + variation. */
export function magToTrue(magDeg: number, variationEastDeg: number): number {
  return normalize360(magDeg + variationEastDeg);
}

export function trueToMag(trueDeg: number, variationEastDeg: number): number {
  return normalize360(trueDeg - variationEastDeg);
}

export type Hemisphere = 'N' | 'S' | 'E' | 'W';

/** Degrees/minutes/seconds to signed decimal degrees (S and W negative). */
export function dmsToDeg(deg: number, min: number, sec: number, hemi: Hemisphere): number {
  const v = deg + min / 60 + sec / 3600;
  return hemi === 'S' || hemi === 'W' ? -v : v;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
