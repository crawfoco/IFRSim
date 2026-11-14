/** Shared test helpers: real V1 navdata plus points placed the way a chart describes them. */
import navdataJson from '../../src/procedures/navdata.json';
import { magToTrue, normalize360 } from '../../src/sim/geo/angles';
import { destination, type LatLon } from '../../src/sim/geo/geodesy';
import type { Localizer, NavData, Navaid, RunwayEnd } from '../../src/sim/navdata/types';

export const nav = navdataJson as NavData;

export function navaid(id: string): Navaid {
  const n = nav.navaids[id];
  if (!n) throw new Error(`navaid ${id} missing`);
  return n;
}

export function localizer(id: string): Localizer {
  const l = nav.localizers[id];
  if (!l) throw new Error(`localizer ${id} missing`);
  return l;
}

export function runwayEnd(airport: string, runway: string): RunwayEnd {
  const e = nav.runwayEnds.find((r) => r.airport === airport && r.runway === runway);
  if (!e) throw new Error(`runway ${airport} ${runway} missing`);
  return e;
}

/** A point on a VOR radial (magnetic, station declination) at a ground distance. */
export function onRadial(stationId: string, radialMag: number, distNm: number): LatLon {
  const s = navaid(stationId);
  return destination(s.position, magToTrue(radialMag, s.declinationEastDeg), distNm);
}

/** True bearing of a localizer's front course extended outbound (antenna → approach side). */
export function locOutboundTrue(locId: string): number {
  const l = localizer(locId);
  return magToTrue(normalize360(l.courseMagDeg + 180), l.magVarEastDeg);
}

/**
 * A point on the approach side of a localizer: `offsetDeg` positive puts the aircraft
 * left of course as seen by a pilot flying inbound (so the needle deflects right).
 */
export function onLocalizer(locId: string, distNm: number, offsetDeg = 0): LatLon {
  return destination(localizer(locId).position, locOutboundTrue(locId) + offsetDeg, distNm);
}
