/** Resolve chart-style fix definitions to lat/lon using the navdata, and cross-check them. */
import { magToTrue, normalize360 } from '../sim/geo/angles';
import { destination, distanceNm, type LatLon } from '../sim/geo/geodesy';
import type { Localizer, NavData, Navaid, RunwayEnd } from '../sim/navdata/types';
import type { CourseRef, FixDef, Procedure } from './schema';

export interface ProcedureContext {
  navdata: NavData;
  procedure: Pick<Procedure, 'airport' | 'runway'>;
}

function navaid(nav: NavData, id: string): Navaid {
  const n = nav.navaids[id];
  if (!n) throw new Error(`unknown navaid ${id}`);
  return n;
}
function localizer(nav: NavData, id: string): Localizer {
  const l = nav.localizers[id];
  if (!l) throw new Error(`unknown localizer ${id}`);
  return l;
}

export function runwayEndFor(nav: NavData, airportId: string, runway: string): RunwayEnd {
  const faa = nav.airports[airportId]?.faaId ?? airportId;
  const r = nav.runwayEnds.find((e) => e.airport === faa && e.runway === runway);
  if (!r) throw new Error(`unknown runway ${airportId} ${runway}`);
  return r;
}

/** True bearing of a localizer's front course, outbound from the antenna toward the approach. */
export const locOutboundTrueDeg = (l: Localizer) =>
  magToTrue(normalize360(l.courseMagDeg + 180), l.magVarEastDeg);

/** Ground position of the DME antenna `dmeFrom` (a VOR) or the ILS's own DME. */
function dmeAntenna(nav: NavData, loc: Localizer, dmeFrom?: string): LatLon {
  if (dmeFrom) {
    const v = navaid(nav, dmeFrom);
    if (!v.dmeChannel) throw new Error(`${dmeFrom} has no DME`);
    return v.dmePosition ?? v.position;
  }
  if (!loc.dme) throw new Error(`${loc.id} has no DME`);
  return loc.dme.position;
}

/**
 * The point on the localizer course (approach side) at a given ground distance from a
 * DME antenna. The antenna is usually near the localizer, so the distance grows
 * monotonically along the course; bisection is plenty.
 */
function onLocAtDme(loc: Localizer, antenna: LatLon, dmeNm: number): LatLon {
  const brg = locOutboundTrueDeg(loc);
  const at = (d: number) => destination(loc.position, brg, d);
  let lo = 0;
  let hi = 60;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (distanceNm(at(mid), antenna) < dmeNm) lo = mid;
    else hi = mid;
  }
  return at((lo + hi) / 2);
}

export function resolveFixDef(def: FixDef, ctx: ProcedureContext): LatLon {
  const nav = ctx.navdata;
  switch (def.kind) {
    case 'navaid':
      return (nav.navaids[def.navaid] ?? localizer(nav, def.navaid)).position;
    case 'radialDme': {
      const v = nav.navaids[def.navaid];
      if (v)
        return destination(v.position, magToTrue(def.radialMag, v.declinationEastDeg), def.dmeNm);
      const l = localizer(nav, def.navaid);
      return destination(l.position, magToTrue(def.radialMag, l.magVarEastDeg), def.dmeNm);
    }
    case 'locDme': {
      const l = localizer(nav, def.loc);
      return onLocAtDme(l, dmeAntenna(nav, l, def.dmeFrom), def.dmeNm);
    }
    case 'threshold': {
      const r = runwayEndFor(nav, ctx.procedure.airport, ctx.procedure.runway);
      return r.displacedThreshold?.position ?? r.threshold;
    }
  }
}

/** Every fix of a procedure, resolved. */
export function resolveFixes(p: Procedure, navdata: NavData): Record<string, LatLon> {
  const ctx = { navdata, procedure: p };
  return Object.fromEntries(
    Object.entries(p.fixes).map(([name, f]) => [name, resolveFixDef(f.def, ctx)]),
  );
}

/** Course reference as a true course at its station plus the station it is flown on. */
export function courseTrueDeg(ref: CourseRef, navdata: NavData): number {
  if ('loc' in ref) {
    const l = localizer(navdata, ref.loc);
    return magToTrue(l.courseMagDeg, l.magVarEastDeg);
  }
  return magToTrue(ref.courseMag, navaid(navdata, ref.navaid).declinationEastDeg);
}

export interface NavdataIssue {
  path: string;
  message: string;
}

/**
 * Check a parsed procedure against the navdata: every navaid exists, every fix resolves,
 * and named fixes are within 0.1 NM of the FAA coordinate.
 */
export function checkAgainstNavdata(
  p: Procedure,
  navdata: NavData,
  toleranceNm = 0.1,
): NavdataIssue[] {
  const issues: NavdataIssue[] = [];
  const known = (id: string) => id in navdata.navaids || id in navdata.localizers;
  p.navaids.forEach((id, i) => {
    if (!known(id)) issues.push({ path: `navaids[${i}]`, message: `unknown navaid ${id}` });
  });
  const ctx = { navdata, procedure: p };
  for (const [name, f] of Object.entries(p.fixes)) {
    let pos: LatLon;
    try {
      pos = resolveFixDef(f.def, ctx);
    } catch (e) {
      issues.push({ path: `fixes.${name}`, message: (e as Error).message });
      continue;
    }
    if (f.faaId) {
      const faa = navdata.fixes[f.faaId] ?? navdata.navaids[f.faaId];
      if (!faa) {
        issues.push({ path: `fixes.${name}`, message: `FAA fix ${f.faaId} not in navdata` });
        continue;
      }
      const d = distanceNm(pos, faa.position);
      if (d > toleranceNm)
        issues.push({
          path: `fixes.${name}`,
          message: `resolves ${d.toFixed(2)} NM from FAA ${f.faaId} (limit ${toleranceNm})`,
        });
    }
  }
  return issues;
}
