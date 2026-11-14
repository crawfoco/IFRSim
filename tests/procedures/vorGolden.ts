/**
 * Golden receiver checks for VOR procedures: at each charted fix, the NAV receiver tuned to
 * the procedure's VOR shows the charted radial centred with the right TO/FROM, and the
 * DME reads the charted distance.
 */
import { expect } from 'vitest';
import { resolveFixDef } from '../../src/procedures/resolve';
import type { Procedure } from '../../src/procedures/schema';
import type { LatLon } from '../../src/sim/geo/geodesy';
import { readDme, readNav } from '../../src/sim/nav/radios';
import type { VorIndication } from '../../src/sim/nav/vor';
import { buildWorld } from '../../src/sim/world';
import { nav } from '../sim/helpers';

export interface GoldenFix {
  fix: string;
  /** OBS as the pilot sets it (the charted course or radial). */
  obs: number;
  toFrom: 'TO' | 'FROM';
  /** Charted DME. */
  dme: number;
  /** Altitude to read the instruments at (the charted crossing altitude). */
  altFt: number;
  /** Needle tolerance in degrees (default 0.1). */
  tolDeg?: number;
}

/**
 * Where a fix is: the FAA coordinate when the fix is a NASR waypoint (independent of our
 * chart-style definition), else the resolved definition.
 */
export function fixPosition(p: Procedure, name: string): LatLon {
  const f = p.fixes[name];
  if (!f) throw new Error(`no fix ${name}`);
  const faa = f.faaId ? (nav.fixes[f.faaId] ?? nav.navaids[f.faaId]) : undefined;
  return faa ? faa.position : resolveFixDef(f.def, { navdata: nav, procedure: p });
}

export function expectGolden(p: Procedure, freqMHz: number, g: GoldenFix) {
  const world = buildWorld(nav, { magVarEastDeg: nav.airports[p.airport]?.magVarEastDeg ?? 0 });
  const ac = { position: fixPosition(p, g.fix), altitudeFt: g.altFt };
  const r = readNav(world, freqMHz, g.obs, ac);
  expect(r.ident).toBe(p.navaids[0]);
  const ind = r.indication as VorIndication;
  expect(ind.kind).toBe('VOR');
  expect(ind.flag).toBe(false);
  expect(ind.toFrom).toBe(g.toFrom);
  expect(Math.abs(ind.deviationDeg)).toBeLessThan(g.tolDeg ?? 0.1);
  const dme = readDme(r.station, ac);
  expect(dme).not.toBeNull();
  expect(Math.abs(dme! - g.dme)).toBeLessThan(0.1);
}
