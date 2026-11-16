/** KCPR RNAV (GPS) RWY 3: navdata and CIFP cross-checks, starts, golden GPS readings at every fix. */
import { describe, expect, it } from 'vitest';
import { NAVDATA } from '../../src/procedures';
import { checkAgainstCifp } from '../../src/procedures/cifp-check';
import json from '../../src/procedures/kcpr-rnav3.json';
import { checkAgainstNavdata } from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import { signedAngleDiff } from '../../src/sim/geo/angles';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { gpsDatabase } from '../../src/sim/gps/flightplan';
import { buildGpsWorld, GPS_OFF, gpsReading, type GpsState } from '../../src/sim/gps/receiver';
import { buildScenario } from '../../src/sim/scenario/scenario';

const p = parseProcedure(json, 'kcpr-rnav3.json');
const MV = NAVDATA.airports.KCPR!.magVarEastDeg;
const db = gpsDatabase(p, NAVDATA, MV)!;
const world = buildGpsWorld(db, NAVDATA, true);
const f = (n: string) => db.fixes[n]!;

/** On `transition`'s plan, the leg `leg`, with the aircraft at `fix`. */
function readingAt(transition: string, leg: number, fix: string, altitudeFt = 8100) {
  const s: GpsState = { ...GPS_OFF, loaded: { transition }, active: true, leg };
  return gpsReading(s, world, { position: f(fix), altitudeFt }, 100, MV);
}

describe('KCPR RNAV 3 encoding', () => {
  it('matches the FAA navdata', () => {
    expect(checkAgainstNavdata(p, NAVDATA)).toEqual([]);
  });

  it('matches the CIFP coding', () => {
    expect(checkAgainstCifp(p, NAVDATA)).toEqual([]);
  });

  for (const s of p.starts) {
    it(`start ${s.id} builds`, () => {
      const sc = buildScenario(p, NAVDATA, {
        startId: s.id,
        ceiling: 'above',
        gsOutOfService: false,
      });
      expect(sc.initial.aircraft.altitudeFt).toBe(s.altitudeFt);
    });
  }
});

describe('KCPR RNAV 3 golden GPS readings', () => {
  // [transition, leg, at fix, charted course °M, active waypoint]
  const cases: [string, number, string, number, string][] = [
    ['chomp', 1, 'CHOMP', 12, 'IPEYE'],
    ['heity', 1, 'HEITY', 254, 'AXIBY'],
    ['heity', 2, 'AXIBY', 302, 'IPEYE'],
    ['hikox', 1, 'HIKOX', 161, 'CEYFI'],
    ['hikox', 2, 'CEYFI', 122, 'IPEYE'],
    ['chomp', 2, 'IPEYE', 32, 'YIWZE'],
    ['chomp', 3, 'YIWZE', 32, 'NOPTE'],
    ['chomp', 4, 'NOPTE', 32, 'RW03'],
    // Missed approach: KIVSE then track 022° to DDY.
    ['chomp', 7, 'KIVSE', 22, 'DDY'],
  ];
  for (const [t, leg, at, crs, wpt] of cases) {
    it(`${t}: at ${at}, desired track ${crs}° to ${wpt}, on course`, () => {
      const r = readingAt(t, leg, at);
      expect(r.activeWaypoint).toBe(wpt);
      expect(Math.abs(r.xtkNm)).toBeLessThan(0.01);
      expect(Math.abs(signedAngleDiff(r.dtkMagDeg, crs))).toBeLessThan(1);
    });
  }

  it('charted distances', () => {
    expect(distanceNm(f('CHOMP'), f('IPEYE'))).toBeCloseTo(8.6, 1);
    expect(distanceNm(f('HEITY'), f('AXIBY'))).toBeCloseTo(27.2, 1);
    expect(distanceNm(f('AXIBY'), f('IPEYE'))).toBeCloseTo(8.0, 1);
    expect(distanceNm(f('HIKOX'), f('CEYFI'))).toBeCloseTo(22.7, 1);
    expect(distanceNm(f('CEYFI'), f('IPEYE'))).toBeCloseTo(8.0, 1);
    expect(distanceNm(f('IPEYE'), f('YIWZE'))).toBeCloseTo(8.0, 1);
    expect(distanceNm(f('YIWZE'), f('NOPTE'))).toBeCloseTo(2.3, 1);
    expect(distanceNm(f('NOPTE'), f('RW03'))).toBeCloseTo(2.7, 1);
  });

  it('the GP crosses the threshold at the TCH (52 ft) and YIWZE near the FAF altitude', () => {
    const at = (fix: string, alt: number) =>
      gpsReading(
        { ...GPS_OFF, loaded: { transition: 'chomp' }, active: true, leg: 4 },
        world,
        { position: f(fix), altitudeFt: alt },
        100,
        MV,
      ).gp!;
    const thr = NAVDATA.runwayEnds.find((r) => r.airport === 'CPR' && r.runway === '03')!;
    expect(Math.abs(at('RW03', thr.elevationFt + 52).verticalErrorFt)).toBeLessThan(2);
    // YIWZE at 7000 is on or just below the GP (glidepath intercept at the FAF).
    const e = at('YIWZE', 7000).verticalErrorFt;
    expect(e).toBeGreaterThan(-60);
    expect(e).toBeLessThan(60);
    // NOPTE: the GP passes just below the LNAV-only 6240 step-down (hence LNAV only).
    const n = at('NOPTE', 6240).verticalErrorFt;
    expect(Math.abs(n)).toBeLessThan(30);
  });
});
