/** Static world the sim flies in: navdata plus scenario settings. Never changes during a run. */
import type { NavData } from './navdata/types';
import { glidePathFor, type GlidePath } from './nav/gs';

export interface World {
  navdata: NavData;
  /** Variation used for headings (the airport's), east-positive. */
  magVarEastDeg: number;
  /** Glide paths keyed by localizer id ("I-FTG"). */
  glidePaths: Record<string, GlidePath>;
  /** Scripted glideslope outage ("LOC only" scenarios). */
  gsOutOfService: boolean;
  /** Expanded service volumes by VOR or localizer id, NM. */
  serviceRangeNm: Record<string, number>;
}

export interface WorldOptions {
  magVarEastDeg: number;
  /** Plate TCH by localizer id; defaults to NASR's VGSI TCH, then 50 ft. */
  tchFt?: Record<string, number>;
  gsOutOfService?: boolean;
  expandedServiceVolumeNm?: Record<string, number>;
}

export function buildWorld(navdata: NavData, opts: WorldOptions): World {
  const glidePaths: Record<string, GlidePath> = {};
  for (const loc of Object.values(navdata.localizers)) {
    if (!loc.glideslope) continue;
    const rwy = navdata.runwayEnds.find(
      (r) => r.airport === loc.airport && r.runway === loc.runway,
    );
    if (!rwy) continue;
    glidePaths[loc.id] = glidePathFor(loc, rwy, opts.tchFt?.[loc.id] ?? rwy.vgsiTchFt ?? 50);
  }
  return {
    navdata,
    magVarEastDeg: opts.magVarEastDeg,
    glidePaths,
    gsOutOfService: opts.gsOutOfService ?? false,
    serviceRangeNm: opts.expandedServiceVolumeNm ?? {},
  };
}
