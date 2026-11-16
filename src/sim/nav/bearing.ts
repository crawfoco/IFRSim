/** Bearing-pointer data for the glass panel: bearing to a tuned VOR and the info box. */
import { normalize360 } from '../geo/angles';
import { initialBearingTrueDeg } from '../geo/geodesy';
import type { World } from '../world';
import type { AircraftFix } from './common';
import { readDme, type NavReading } from './radios';
import type { NavSourceId } from './source';
import { vorServiceRangeNm } from './vor';
import { distanceNm } from '../geo/geodesy';

/**
 * Magnetic bearing from the aircraft to the tuned VOR, as a VOR-driven bearing pointer shows it:
 * the reciprocal of the radial, using the station's declination. Null for a localizer (no
 * bearing), nothing tuned, or out of reception range.
 */
export function bearingToStationMagDeg(
  reading: NavReading,
  ac: AircraftFix,
  world: Pick<World, 'serviceRangeNm'>,
): number | null {
  const st = reading.station;
  if (st?.kind !== 'VOR') return null;
  const n = st.navaid;
  const range =
    world.serviceRangeNm[n.id] ?? vorServiceRangeNm(n.serviceVolume, ac.altitudeFt - n.elevationFt);
  if (distanceNm(n.position, ac.position) > range) return null;
  const radialMag = initialBearingTrueDeg(n.position, ac.position) - n.declinationEastDeg;
  return normalize360(radialMag + 180);
}

export interface BearingInfo {
  source: NavSourceId;
  freqMHz: number;
  /** Station ident when received, else null (the box shows the frequency). */
  ident: string | null;
  /** Null: no pointer, the box reads NO BRG. */
  bearingMagDeg: number | null;
  /** DME for this radio's station, when it has one and is in range. */
  dmeNm: number | null;
}

export function bearingInfo(
  source: NavSourceId,
  reading: NavReading,
  ac: AircraftFix,
  world: Pick<World, 'serviceRangeNm'>,
): BearingInfo {
  return {
    source,
    freqMHz: reading.freqMHz,
    ident: reading.ident,
    bearingMagDeg: bearingToStationMagDeg(reading, ac, world),
    dmeNm: reading.ident ? readDme(reading.station, ac, world) : null,
  };
}
