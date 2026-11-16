/** KBFF RNAV (GPS) RWY 12: navdata and CIFP cross-checks, starts, golden GPS readings at every fix. */
import { describe, expect, it } from 'vitest';
import { NAVDATA } from '../../src/procedures';
import { checkAgainstCifp } from '../../src/procedures/cifp-check';
import { checkAgainstNavdata } from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import json from '../../src/procedures/kbff-rnav12.json';
import { signedAngleDiff } from '../../src/sim/geo/angles';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { gpsDatabase } from '../../src/sim/gps/flightplan';
import { buildGpsWorld, GPS_OFF, gpsReading, type GpsState } from '../../src/sim/gps/receiver';
import { buildScenario } from '../../src/sim/scenario/scenario';

const p = parseProcedure(json, 'kbff-rnav12.json');
const MV = NAVDATA.airports.KBFF!.magVarEastDeg;
const db = gpsDatabase(p, NAVDATA, MV)!;
const world = buildGpsWorld(db, NAVDATA, true);
const f = (n: string) => db.fixes[n]!;

/** On `transition`'s plan, the leg `leg`, with the aircraft at `fix`. */
function readingAt(transition: string, leg: number, fix: string, altitudeFt = 7000) {
  const s: GpsState = { ...GPS_OFF, loaded: { transition }, active: true, leg };
  return gpsReading(s, world, { position: f(fix), altitudeFt }, 100, MV);
}

describe('KBFF RNAV 12 encoding', () => {
  it('matches the navdata', () => {
    expect(checkAgainstNavdata(p, NAVDATA)).toEqual([]);
  });

  it('matches the CIFP coding', () => {
    expect(checkAgainstCifp(p, NAVDATA)).toEqual([]);
  });

  for (const s of p.starts)
    it(`start ${s.id} builds`, () => {
      expect(() =>
        buildScenario(p, NAVDATA, { startId: s.id, ceiling: 'above', gsOutOfService: false }),
      ).not.toThrow();
    });
});

describe('KBFF RNAV 12 golden GPS readings', () => {
  // [transition, leg, at fix, charted course °M, active waypoint]
  const cases: [string, number, string, number, string][] = [
    ['albin', 1, 'ALBIN', 23, 'SACOP'],
    ['albin', 2, 'SACOP', 35, 'LEDSE'],
    ['spons', 1, 'SPONS', 237, 'AYAYI'],
    ['spons', 2, 'AYAYI', 216, 'LEDSE'],
    ['spons', 3, 'LEDSE', 125, 'CAPGA'],
    ['spons', 4, 'CAPGA', 126, 'RW12'],
  ];
  for (const [t, leg, at, crs, wpt] of cases) {
    it(`at ${at}: desired track ${crs}° to ${wpt}, on course`, () => {
      const r = readingAt(t, leg, at);
      expect(r.activeWaypoint).toBe(wpt);
      expect(Math.abs(r.xtkNm)).toBeLessThan(0.01);
      expect(Math.abs(signedAngleDiff(r.dtkMagDeg, crs))).toBeLessThan(1);
    });
  }

  it('charted distances: ALBIN-SACOP 35.3, SPONS-AYAYI 14, IAFs 5, LEDSE-CAPGA 6.1, CAPGA-RW12 5.2 NM', () => {
    expect(distanceNm(f('ALBIN'), f('SACOP'))).toBeCloseTo(35.3, 1);
    expect(distanceNm(f('SPONS'), f('AYAYI'))).toBeCloseTo(14, 1);
    expect(distanceNm(f('SACOP'), f('LEDSE'))).toBeCloseTo(5, 1);
    expect(distanceNm(f('AYAYI'), f('LEDSE'))).toBeCloseTo(5, 1);
    expect(distanceNm(f('LEDSE'), f('CAPGA'))).toBeCloseTo(6.1, 1);
    expect(distanceNm(f('CAPGA'), f('RW12'))).toBeCloseTo(5.2, 1);
  });

  it('the GP crosses the threshold at the TCH (57 ft) and CAPGA near the FAF altitude', () => {
    const at = (fix: string, alt: number) => readingAt('spons', 4, fix, alt).gp!;
    const thr = NAVDATA.runwayEnds.find((r) => r.airport === 'BFF' && r.runway === '12')!;
    expect(Math.abs(at('RW12', thr.elevationFt + 57).verticalErrorFt)).toBeLessThan(2);
    // CAPGA at 5700 is on or just below the GP (glidepath intercept at the FAF).
    const e = at('CAPGA', 5700).verticalErrorFt;
    expect(e).toBeGreaterThan(-60);
    expect(e).toBeLessThan(60);
  });
});
