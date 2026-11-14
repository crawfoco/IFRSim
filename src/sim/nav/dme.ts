/** DME: slant range from the DME antenna, as the cockpit readout shows it. */
import { distanceNm } from '../geo/geodesy';
import type { LatLon } from '../geo/geodesy';
import { FT_PER_NM, heightAboveTangentFt, type AircraftFix } from './common';

export interface DmeAntenna {
  position: LatLon;
  elevationFt: number;
}

/** Slant range in NM, or null when beyond `rangeNm` (ground distance). */
export function dmeSlantRangeNm(
  ac: AircraftFix,
  antenna: DmeAntenna,
  rangeNm: number,
): number | null {
  const ground = distanceNm(antenna.position, ac.position);
  if (ground > rangeNm) return null;
  const dh = heightAboveTangentFt(ac.altitudeFt, antenna.elevationFt, ground) / FT_PER_NM;
  return Math.hypot(ground, dh);
}
