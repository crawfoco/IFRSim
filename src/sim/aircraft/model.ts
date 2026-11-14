/**
 * Point-mass aircraft (SPEC.md Domain Model): standard-rate turns with a bank ramp,
 * vertical speed limits, airspeed slewing, no wind. Position is integrated directly in
 * latitude/longitude using the WGS84 radii of curvature, so true heading stays true
 * everywhere in the 30 NM area (a flat local frame would bend headings by up to ~0.4°).
 */
import { clamp, DEG, normalize360 } from '../geo/angles';
import { WGS84_A, WGS84_E2, METRES_PER_NM, type LatLon } from '../geo/geodesy';

export interface AircraftState {
  position: LatLon;
  altitudeFt: number;
  headingTrueDeg: number;
  /** + = right wing down. */
  bankDeg: number;
  vsFpm: number;
  iasKt: number;
}

/** What the autopilot (or the hands-off aircraft) asks for each step. */
export interface AircraftControls {
  bankCmdDeg: number;
  vsCmdFpm: number;
  iasCmdKt: number;
}

export const LIMITS = {
  maxBankDeg: 25,
  standardRateDegPerS: 3,
  bankRateDegPerS: 8,
  vsMinFpm: -1500,
  vsMaxFpm: 1000,
  vsAccelFpmPerS: 250,
  iasMinKt: 90,
  iasMaxKt: 120,
  iasRateKtPerS: 2,
} as const;

const G = 9.80665;
const KT_TO_MPS = METRES_PER_NM / 3600;

export function initialAircraft(
  position: LatLon,
  altitudeFt: number,
  headingTrueDeg: number,
  iasKt: number,
): AircraftState {
  return {
    position,
    altitudeFt,
    headingTrueDeg: normalize360(headingTrueDeg),
    bankDeg: 0,
    vsFpm: 0,
    iasKt,
  };
}

/** True airspeed: the usual 2% per 1000 ft rule of thumb (standard day). */
export function tasKt(iasKt: number, altitudeFt: number): number {
  return iasKt * (1 + (0.02 * altitudeFt) / 1000);
}

/** Bank angle for a 3°/s turn at this TAS, capped at 25°. */
export function standardRateBankDeg(tas: number): number {
  const omega = LIMITS.standardRateDegPerS * DEG;
  return Math.min(LIMITS.maxBankDeg, Math.atan((omega * tas * KT_TO_MPS) / G) / DEG);
}

function toward(current: number, target: number, maxDelta: number): number {
  return current + clamp(target - current, -maxDelta, maxDelta);
}

export function stepAircraft(s: AircraftState, c: AircraftControls, dt: number): AircraftState {
  const tas = tasKt(s.iasKt, s.altitudeFt);
  const bankLimit = standardRateBankDeg(tas);
  const bankDeg = toward(
    s.bankDeg,
    clamp(c.bankCmdDeg, -bankLimit, bankLimit),
    LIMITS.bankRateDegPerS * dt,
  );
  const turnRateDegPerS = (G * Math.tan(bankDeg * DEG)) / (tas * KT_TO_MPS) / DEG;
  const headingTrueDeg = normalize360(s.headingTrueDeg + turnRateDegPerS * dt);

  const vsCmd = clamp(c.vsCmdFpm, LIMITS.vsMinFpm, LIMITS.vsMaxFpm);
  const vsFpm = toward(s.vsFpm, vsCmd, LIMITS.vsAccelFpmPerS * dt);
  const altitudeFt = s.altitudeFt + ((s.vsFpm + vsFpm) / 2) * (dt / 60);

  const iasCmd = clamp(c.iasCmdKt, LIMITS.iasMinKt, LIMITS.iasMaxKt);
  const iasKt = toward(s.iasKt, iasCmd, LIMITS.iasRateKtPerS * dt);

  // Advance along the mid-step heading using the local radii of curvature.
  const midHeading = (s.headingTrueDeg + (turnRateDegPerS * dt) / 2) * DEG;
  const distM = tas * KT_TO_MPS * dt;
  const lat = s.position.latDeg * DEG;
  const w = 1 - WGS84_E2 * Math.sin(lat) ** 2;
  const meridianR = (WGS84_A * (1 - WGS84_E2)) / w ** 1.5;
  const normalR = WGS84_A / Math.sqrt(w);
  const position = {
    latDeg: s.position.latDeg + (distM * Math.cos(midHeading)) / meridianR / DEG,
    lonDeg: s.position.lonDeg + (distM * Math.sin(midHeading)) / (normalR * Math.cos(lat)) / DEG,
  };

  return { position, altitudeFt, headingTrueDeg, bankDeg, vsFpm, iasKt };
}
