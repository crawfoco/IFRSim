/** Nav radios: what station a frequency tunes, and what NAV1/NAV2 and the DME read. */
import { distanceNm } from '../geo/geodesy';
import type { Localizer, Navaid } from '../navdata/types';
import type { World } from '../world';
import type { AircraftFix } from './common';
import { dmeSlantRangeNm, type DmeAntenna } from './dme';
import { gsIndication, type GlidePath, type GsIndication } from './gs';
import { locIndication, type LocIndication } from './loc';
import { vorIndication, vorServiceRangeNm, type VorIndication } from './vor';

const ILS_DME_RANGE_NM = 25;

export type TunedStation =
  { kind: 'VOR'; navaid: Navaid } | { kind: 'LOC'; loc: Localizer; glidePath: GlidePath | null };

export interface NavReading {
  freqMHz: number;
  station: TunedStation | null;
  /** Identifier for the Morse ident, e.g. "FQF" or "I-FTG". */
  ident: string | null;
  indication: VorIndication | LocIndication | null;
  gs: GsIndication | null;
}

const sameFreq = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** The nearest station on this frequency (VORs and localizers), or null. */
export function tuneStation(world: World, freqMHz: number, ac: AircraftFix): TunedStation | null {
  let best: { d: number; s: TunedStation } | null = null;
  for (const navaid of Object.values(world.navdata.navaids)) {
    if (!sameFreq(navaid.freqMHz, freqMHz)) continue;
    const d = distanceNm(navaid.position, ac.position);
    if (!best || d < best.d) best = { d, s: { kind: 'VOR', navaid } };
  }
  for (const loc of Object.values(world.navdata.localizers)) {
    if (!sameFreq(loc.freqMHz, freqMHz)) continue;
    const d = distanceNm(loc.position, ac.position);
    const glidePath = world.gsOutOfService ? null : (world.glidePaths[loc.id] ?? null);
    if (!best || d < best.d) best = { d, s: { kind: 'LOC', loc, glidePath } };
  }
  return best?.s ?? null;
}

export function readNav(
  world: World,
  freqMHz: number,
  obsDegMag: number,
  ac: AircraftFix,
): NavReading {
  const station = tuneStation(world, freqMHz, ac);
  if (!station) return { freqMHz, station: null, ident: null, indication: null, gs: null };
  if (station.kind === 'VOR') {
    return {
      freqMHz,
      station,
      ident: station.navaid.id,
      indication: vorIndication(ac, station.navaid, obsDegMag, world.vorRangeNm[station.navaid.id]),
      gs: null,
    };
  }
  return {
    freqMHz,
    station,
    ident: station.loc.id,
    indication: locIndication(ac, station.loc),
    gs: station.glidePath ? gsIndication(ac, station.glidePath) : null,
  };
}

/** DME paired with the tuned station, if it has one. */
export function readDme(
  station: TunedStation | null,
  ac: AircraftFix,
  world?: Pick<World, 'vorRangeNm'>,
): number | null {
  if (!station) return null;
  let antenna: DmeAntenna;
  let rangeNm: number;
  if (station.kind === 'VOR') {
    const n = station.navaid;
    if (!n.dmeChannel) return null;
    antenna = { position: n.dmePosition ?? n.position, elevationFt: n.elevationFt };
    rangeNm =
      world?.vorRangeNm[n.id] ?? vorServiceRangeNm(n.serviceVolume, ac.altitudeFt - n.elevationFt);
  } else {
    if (!station.loc.dme) return null;
    antenna = station.loc.dme;
    rangeNm = ILS_DME_RANGE_NM;
  }
  return dmeSlantRangeNm(ac, antenna, rangeNm);
}
