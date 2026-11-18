/** KAPA RNAV (GPS) RWY 28: navdata and CIFP cross-checks, starts, golden GPS readings at every fix. */
import { describe, expect, it } from 'vitest';
import { NAVDATA } from '../../src/procedures';
import { checkAgainstCifp } from '../../src/procedures/cifp-check';
import { checkAgainstNavdata } from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import json from '../../src/procedures/kapa-rnav28.json';
import { signedAngleDiff } from '../../src/sim/geo/angles';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { gpsDatabase } from '../../src/sim/gps/flightplan';
import { buildGpsWorld, GPS_OFF, gpsReading, type GpsState } from '../../src/sim/gps/receiver';
import { buildScenario } from '../../src/sim/scenario/scenario';

const p = parseProcedure(json, 'kapa-rnav28.json');
const MV = NAVDATA.airports.KAPA!.magVarEastDeg;
const db = gpsDatabase(p, NAVDATA, MV)!;
const world = buildGpsWorld(db, NAVDATA, true);
const f = (n: string) => db.fixes[n]!;

/** On `transition`'s plan, the leg `leg`, with the aircraft at `fix`. */
function readingAt(transition: string, leg: number, fix: string, altitudeFt = 8100) {
  const s: GpsState = { ...GPS_OFF, loaded: { transition }, active: true, leg };
  return gpsReading(s, world, { position: f(fix), altitudeFt }, 100, MV);
}

describe('KAPA RNAV 28 encoding', () => {
  it('matches the navdata', () => {
    expect(checkAgainstNavdata(p, NAVDATA)).toEqual([]);
  });

  it('matches the CIFP coding', () => {
    expect(checkAgainstCifp(p, NAVDATA)).toEqual([]);
  });

  for (const s of p.starts)
    it(`start ${s.id} builds`, () => {
      const sc = buildScenario(p, NAVDATA, {
        startId: s.id,
        ceiling: 'above',
        gsOutOfService: false,
      });
      expect(sc.initial.aircraft.altitudeFt).toBe(s.altitudeFt);
    });
});

describe('KAPA RNAV 28 golden GPS readings', () => {
  // [transition, leg, at fix, charted course °M, active waypoint]
  const cases: [string, number, string, number, string][] = [
    ['dilve', 1, 'DILVE', 283, 'DOCKY'],
    ['ezbel', 1, 'EZBEL', 238, 'DOCKY'],
    ['dilve', 2, 'DOCKY', 283, 'MESME'],
    ['dilve', 3, 'MESME', 283, 'NIDLY'],
    ['dilve', 4, 'NIDLY', 283, 'FEGIB'],
    ['ezbel', 5, 'FEGIB', 283, 'RW28'],
  ];
  for (const [t, leg, at, crs, wpt] of cases) {
    it(`${t}: at ${at}, desired track ${crs}° to ${wpt}, on course`, () => {
      const r = readingAt(t, leg, at);
      expect(r.activeWaypoint).toBe(wpt);
      expect(Math.abs(r.xtkNm)).toBeLessThan(0.01);
      expect(Math.abs(signedAngleDiff(r.dtkMagDeg, crs))).toBeLessThan(1);
    });
  }

  it('charted distances: IAFs 5, DOCKY-MESME 3.2, MESME-NIDLY 3, NIDLY-FEGIB 1.7, FEGIB-RW28 3.5 NM', () => {
    expect(distanceNm(f('DILVE'), f('DOCKY'))).toBeCloseTo(5, 1);
    expect(distanceNm(f('EZBEL'), f('DOCKY'))).toBeCloseTo(5, 1);
    expect(distanceNm(f('DOCKY'), f('MESME'))).toBeCloseTo(3.2, 1);
    expect(distanceNm(f('MESME'), f('NIDLY'))).toBeCloseTo(3, 1);
    expect(distanceNm(f('NIDLY'), f('FEGIB'))).toBeCloseTo(1.7, 1);
    expect(distanceNm(f('FEGIB'), f('RW28'))).toBeCloseTo(3.5, 1);
  });

  it('the GP crosses the threshold at the TCH (41 ft), NIDLY near the FAF altitude', () => {
    const at = (fix: string, alt: number) => readingAt('dilve', 5, fix, alt).gp!;
    const thr = NAVDATA.runwayEnds.find((r) => r.airport === 'APA' && r.runway === '28')!;
    expect(Math.abs(at('RW28', thr.elevationFt + 41).verticalErrorFt)).toBeLessThan(2);
    // NIDLY at 7500 is on or just below the GP (glidepath intercept at the FAF).
    const e = at('NIDLY', 7500).verticalErrorFt;
    expect(e).toBeGreaterThan(-60);
    expect(e).toBeLessThan(60);
    // FEGIB: the GP passes just above the LNAV-only 6940 step-down (hence LNAV only).
    expect(Math.abs(at('FEGIB', 6940).verticalErrorFt)).toBeLessThan(30);
  });
});
