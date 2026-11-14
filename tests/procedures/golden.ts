/**
 * Golden receiver checks for an encoded procedure: put the aircraft on a charted fix and
 * read the radios the way the cockpit would (src/sim/nav).
 */
import { resolveFixes } from '../../src/procedures/resolve';
import type { Procedure } from '../../src/procedures/schema';
import type { LatLon } from '../../src/sim/geo/geodesy';
import type { AircraftFix } from '../../src/sim/nav/common';
import type { GsIndication } from '../../src/sim/nav/gs';
import type { LocIndication } from '../../src/sim/nav/loc';
import { readDme, readNav, tuneStation } from '../../src/sim/nav/radios';
import type { VorIndication } from '../../src/sim/nav/vor';
import type { World } from '../../src/sim/world';
import { nav } from '../sim/helpers';

/**
 * Where each fix is: the FAA (NASR) coordinate for named waypoints, so the receivers are
 * checked against the published point rather than our own chart-style resolution; the
 * resolved chart definition for unnamed DME points and the threshold.
 */
export function fixPositions(p: Procedure): Record<string, LatLon> {
  const resolved = resolveFixes(p, nav);
  return Object.fromEntries(
    Object.entries(p.fixes).map(([name, f]) => {
      const faa = f.faaId ? (nav.fixes[f.faaId] ?? nav.navaids[f.faaId]) : undefined;
      return [name, faa?.position ?? resolved[name]!];
    }),
  );
}

export function vorAt(world: World, freqMHz: number, obsDegMag: number, ac: AircraftFix) {
  const r = readNav(world, freqMHz, obsDegMag, ac);
  if (r.station?.kind !== 'VOR') throw new Error(`${freqMHz} did not tune a VOR`);
  return r.indication as VorIndication;
}

export function locAt(world: World, freqMHz: number, ac: AircraftFix) {
  const r = readNav(world, freqMHz, 0, ac);
  if (r.station?.kind !== 'LOC') throw new Error(`${freqMHz} did not tune a localizer`);
  return { loc: r.indication as LocIndication, gs: r.gs as GsIndication | null };
}

/** DME readout with the DME source set to a receiver tuned to `freqMHz`. */
export const dmeAt = (world: World, freqMHz: number, ac: AircraftFix) =>
  readDme(tuneStation(world, freqMHz, ac), ac);
