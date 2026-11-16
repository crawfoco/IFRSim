import type { LatLon } from '../geo/geodesy';

/** Navigation data extracted from FAA NASR (public domain). Magnetic variation is east-positive. */

export type VorType = 'VOR' | 'VOR/DME' | 'VORTAC';

/** FAA standard service volume class: Terminal, Low, High. */
export type ServiceVolume = 'T' | 'L' | 'H';

export interface Navaid {
  id: string;
  name: string;
  type: VorType;
  position: LatLon;
  elevationFt: number;
  freqMHz: number;
  /** TACAN/DME channel, e.g. "110X". */
  dmeChannel?: string;
  /** DME antenna position when NASR lists it separately. */
  dmePosition?: LatLon;
  /** Station declination: the variation the VOR's radials are aligned to. */
  declinationEastDeg: number;
  declinationYear: number;
  serviceVolume: ServiceVolume;
}

export interface Glideslope {
  position: LatLon;
  elevationFt: number;
  angleDeg: number;
}

export interface IlsDme {
  position: LatLon;
  elevationFt: number;
  channel: string;
}

export interface Localizer {
  /** Chart identifier, e.g. "I-FTG". */
  id: string;
  airport: string;
  runway: string;
  /** NASR system type: LD = ILS/DME, LG = LOC/GS, LS = ILS, LC = LOC, … */
  systemType: string;
  position: LatLon;
  elevationFt: number;
  freqMHz: number;
  courseMagDeg: number;
  magVarEastDeg: number;
  glideslope?: Glideslope;
  dme?: IlsDme;
}

export interface Fix {
  id: string;
  state: string;
  position: LatLon;
  /** NASR fix use code, e.g. RP (reporting point), CN (computer navigation fix). */
  use: string;
}

export interface Airport {
  /** ICAO identifier, e.g. "KCFO". */
  id: string;
  faaId: string;
  name: string;
  position: LatLon;
  elevationFt: number;
  magVarEastDeg: number;
  magVarYear: number;
}

export interface RunwayEnd {
  airport: string;
  runway: string;
  threshold: LatLon;
  elevationFt: number;
  tdzeFt: number;
  trueAlignmentDeg: number;
  /** Threshold crossing height of the visual glide path (VGSI), if published. */
  vgsiTchFt?: number;
  displacedThreshold?: { position: LatLon; elevationFt: number; lengthFt: number };
}

export interface NavData {
  source: { dataset: 'FAA NASR'; cycle: string; extracted: string };
  airports: Record<string, Airport>;
  runwayEnds: RunwayEnd[];
  navaids: Record<string, Navaid>;
  localizers: Record<string, Localizer>;
  fixes: Record<string, Fix>;
  /** RNAV approaches from the FAA CIFP (V3); absent in V1/V2 extracts. */
  cifp?: CifpData;
}

// ---- FAA CIFP (ARINC 424) extract: RNAV approaches ----

/** An RNAV waypoint, VOR or runway threshold as the CIFP gives it. */
export interface RnavWaypoint {
  id: string;
  /** Airport for terminal waypoints and runways, "ENRT" for enroute, "NAVAID" for a VOR. */
  region: string;
  position: LatLon;
  magVarEastDeg: number;
}

/** One coded leg (ARINC 424 path terminator), as published in the CIFP. */
export interface CifpLeg {
  seq: number;
  fix: string | null;
  /** Section/subsection of the fix: PC terminal waypoint, EA enroute, D navaid, PG runway. */
  fixSection: string | null;
  /** Waypoint description code (4 characters, raw). */
  descriptor: string;
  flyOver: boolean;
  role: 'IAF' | 'IF' | 'IAF-hold' | 'IAF-FACF' | 'FACF' | 'FAF' | 'MAP' | 'hold' | null;
  /** First leg of the missed approach. */
  missedStart: boolean;
  turn: 'L' | 'R' | null;
  rnpNm: number | null;
  /** IF, TF, CF, DF, CA, HF, HM, HA, RF, … */
  pathTerminator: string;
  recommendedNavaid: string | null;
  courseMagDeg: number | null;
  distanceNm: number | null;
  holdMinutes: number | null;
  /** ARINC altitude description: "+" at or above, "-" at or below, "B" block, blank = at, … */
  altDesc: string | null;
  alt1Ft: number | null;
  alt2Ft: number | null;
  speedKt: number | null;
  /** Vertical angle (negative = descending), on the FAF-to-MAP leg. */
  verticalAngleDeg: number | null;
}

/** A route of an approach: a transition (type A) or the final route (R, H, …). */
export interface CifpRoute {
  routeType: string;
  /** Transition ident (the IAF), or "" for the final route. */
  transition: string;
  legs: CifpLeg[];
}

/** FAS data block (path point record) of an SBAS approach. */
export interface CifpPathPoint {
  runway: string;
  referencePathId: string;
  /** Landing threshold point. */
  ltp: LatLon;
  ellipsoidHeightM: number;
  gpaDeg: number;
  /** Flight path alignment point. */
  fpap: LatLon;
  /** Lateral full-scale deflection at the LTP, metres. */
  courseWidthM: number;
  tchFt: number;
  /** Approach performance label from the continuation, e.g. "LPV" or "LP". */
  approachLabel?: string;
}

export interface CifpApproach {
  airport: string;
  /** CIFP procedure ident, e.g. "R18". */
  ident: string;
  runway: string;
  /** Minimums lines the coding publishes (LPV, LNAV/VNAV, LNAV, LP). */
  minimumsLines: string[];
  routes: CifpRoute[];
  pathPoint?: CifpPathPoint;
}

export interface CifpData {
  dataset: 'FAA CIFP';
  /** AIRAC cycle, e.g. "2611". */
  cycle: string;
  /** Keyed "KLAA R18". */
  approaches: Record<string, CifpApproach>;
  /** Terminal waypoints and runways keyed "KLAA/LOLME", enroute waypoints and VORs by ident. */
  waypoints: Record<string, RnavWaypoint>;
}
