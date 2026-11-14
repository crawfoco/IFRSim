/**
 * Geodesics on the WGS84 ellipsoid (Vincenty 1975), the datum FAA navigation data uses.
 * Accurate to well under a millimetre over approach-sized distances.
 */
import { DEG, normalize360 } from './angles';

export interface LatLon {
  latDeg: number;
  lonDeg: number;
}

export const METRES_PER_NM = 1852;

export const WGS84_A = 6_378_137;
export const WGS84_F = 1 / 298.257223563;
export const WGS84_B = WGS84_A * (1 - WGS84_F);
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);

const MAX_ITERATIONS = 200;
const EPSILON = 1e-12;

export interface InverseResult {
  distanceM: number;
  /** Initial true bearing at the first point. */
  initialBearingDeg: number;
  /** Final true bearing (direction of travel) at the second point. */
  finalBearingDeg: number;
}

/** Vincenty's correction term Δσ, shared by the inverse and direct solutions. */
function deltaSigma(B: number, sinS: number, cosS: number, cos2Sm: number): number {
  return (
    B *
    sinS *
    (cos2Sm +
      (B / 4) *
        (cosS * (-1 + 2 * cos2Sm * cos2Sm) -
          (B / 6) * cos2Sm * (-3 + 4 * sinS * sinS) * (-3 + 4 * cos2Sm * cos2Sm)))
  );
}

function aAndB(cosSqAlpha: number): { A: number; B: number } {
  const uSq = (cosSqAlpha * (WGS84_A * WGS84_A - WGS84_B * WGS84_B)) / (WGS84_B * WGS84_B);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  return { A, B };
}

export function inverse(p1: LatLon, p2: LatLon): InverseResult {
  const f = WGS84_F;
  const L = (p2.lonDeg - p1.lonDeg) * DEG;
  const U1 = Math.atan((1 - f) * Math.tan(p1.latDeg * DEG));
  const U2 = Math.atan((1 - f) * Math.tan(p2.latDeg * DEG));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let lambda = L;
  let sinSigma: number;
  let cosSigma: number;
  let sigma: number;
  let cosSqAlpha: number;
  let cos2SigmaM: number;
  let sinLambda: number;
  let cosLambda: number;

  for (let i = 0; ; i++) {
    if (i >= MAX_ITERATIONS) throw new Error('Vincenty inverse failed to converge');
    sinLambda = Math.sin(lambda);
    cosLambda = Math.cos(lambda);
    const t1 = cosU2 * sinLambda;
    const t2 = cosU1 * sinU2 - sinU1 * cosU2 * cosLambda;
    sinSigma = Math.sqrt(t1 * t1 + t2 * t2);
    if (sinSigma === 0) return { distanceM: 0, initialBearingDeg: 0, finalBearingDeg: 0 };
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    const prev = lambda;
    lambda =
      L +
      (1 - C) *
        f *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda - prev) < EPSILON) break;
  }

  const { A, B } = aAndB(cosSqAlpha);
  const distanceM = WGS84_B * A * (sigma - deltaSigma(B, sinSigma, cosSigma, cos2SigmaM));
  const az1 = Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
  const az2 = Math.atan2(cosU1 * sinLambda, -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda);
  return {
    distanceM,
    initialBearingDeg: normalize360(az1 / DEG),
    finalBearingDeg: normalize360(az2 / DEG),
  };
}

export function distanceNm(p1: LatLon, p2: LatLon): number {
  return inverse(p1, p2).distanceM / METRES_PER_NM;
}

export function initialBearingTrueDeg(from: LatLon, to: LatLon): number {
  return inverse(from, to).initialBearingDeg;
}

/** Point reached by travelling `distanceNm` from `start` on initial true bearing `bearingDeg`. */
export function destination(start: LatLon, bearingDeg: number, distNm: number): LatLon {
  if (distNm === 0) return { latDeg: start.latDeg, lonDeg: start.lonDeg };
  const f = WGS84_F;
  const s = distNm * METRES_PER_NM;
  const alpha1 = bearingDeg * DEG;
  const sinAlpha1 = Math.sin(alpha1);
  const cosAlpha1 = Math.cos(alpha1);
  const tanU1 = (1 - f) * Math.tan(start.latDeg * DEG);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU1 = tanU1 * cosU1;
  const sigma1 = Math.atan2(tanU1, cosAlpha1);
  const sinAlpha = cosU1 * sinAlpha1;
  const cosSqAlpha = 1 - sinAlpha * sinAlpha;
  const { A, B } = aAndB(cosSqAlpha);

  let sigma = s / (WGS84_B * A);
  for (let i = 0; ; i++) {
    if (i >= MAX_ITERATIONS) throw new Error('Vincenty direct failed to converge');
    const prev = sigma;
    sigma =
      s / (WGS84_B * A) +
      deltaSigma(B, Math.sin(sigma), Math.cos(sigma), Math.cos(2 * sigma1 + sigma));
    if (Math.abs(sigma - prev) < EPSILON) break;
  }
  const sinSigma = Math.sin(sigma);
  const cosSigma = Math.cos(sigma);
  const cos2SigmaM = Math.cos(2 * sigma1 + sigma);

  const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
  const lat = Math.atan2(
    sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
    (1 - f) * Math.sqrt(sinAlpha * sinAlpha + tmp * tmp),
  );
  const lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1);
  const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
  const L =
    lambda -
    (1 - C) *
      f *
      sinAlpha *
      (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  return { latDeg: lat / DEG, lonDeg: start.lonDeg + L / DEG };
}
