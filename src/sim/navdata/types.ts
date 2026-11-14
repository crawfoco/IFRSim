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
}
