/** KPUB RNAV (GPS) RWY 26L: navdata and CIFP cross-checks, starts, golden GPS readings. */
import { describe, expect, it } from 'vitest';
import { NAVDATA } from '../../src/procedures';
import { checkAgainstCifp } from '../../src/procedures/cifp-check';
import json from '../../src/procedures/kpub-rnav26l.json';
import { checkAgainstNavdata } from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import { signedAngleDiff } from '../../src/sim/geo/angles';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { gpsDatabase } from '../../src/sim/gps/flightplan';
import { buildGpsWorld, GPS_OFF, gpsReading, type GpsState } from '../../src/sim/gps/receiver';
import { buildScenario } from '../../src/sim/scenario/scenario';

const p = parseProcedure(json, 'kpub-rnav26l.json');
const MV = NAVDATA.airports.KPUB!.magVarEastDeg;
const db = gpsDatabase(p, NAVDATA, MV)!;
const world = buildGpsWorld(db, NAVDATA, true);
const f = (n: string) => db.fixes[n]!;

/** On `transition`'s plan, the leg `leg`, with the aircraft at `fix`. */
function readingAt(transition: string, leg: number, fix: string, altitudeFt = 7000) {
  const s: GpsState = { ...GPS_OFF, loaded: { transition }, active: true, leg };
  return gpsReading(s, world, { position: f(fix), altitudeFt }, 100, MV);
}

describe('KPUB RNAV 26L encoding', () => {
  it('matches the FAA navdata (NASR) positions', () => {
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

describe('KPUB RNAV 26L golden GPS readings', () => {
  // [transition, leg (0 is direct to the first fix), at fix, charted course °M, active waypoint]
  const cases: [string, number, string, number, string][] = [
    ['drake', 1, 'DRAKE', 136, 'BONUH'],
    ['drake', 2, 'BONUH', 170, 'HELER'],
    ['bonuh', 1, 'BONUH', 170, 'HELER'],
    ['vigil', 1, 'VIGIL', 36, 'REDHI'],
    ['staxx', 1, 'STAXX', 346, 'REDHI'],
    ['staxx', 2, 'REDHI', 346, 'HELER'],
    ['redhi', 1, 'REDHI', 346, 'HELER'],
    ['orway', 1, 'ORWAY', 270, 'HELER'],
    ['pub', 1, 'PUB', 82, 'HELER'],
    ['orway', 2, 'HELER', 260, 'JIKTA'],
    ['orway', 3, 'JIKTA', 260, 'RW26L'],
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
    expect(distanceNm(f('DRAKE'), f('BONUH'))).toBeCloseTo(15.7, 1);
    expect(distanceNm(f('BONUH'), f('HELER'))).toBeCloseTo(6, 1);
    expect(distanceNm(f('VIGIL'), f('REDHI'))).toBeCloseTo(21.6, 1);
    expect(distanceNm(f('STAXX'), f('REDHI'))).toBeCloseTo(12.9, 1);
    expect(distanceNm(f('REDHI'), f('HELER'))).toBeCloseTo(6, 1);
    expect(distanceNm(f('ORWAY'), f('HELER'))).toBeCloseTo(7.7, 1);
    expect(distanceNm(f('PUB'), f('HELER'))).toBeCloseTo(10, 1);
    // Charted 6.2; the CIFP waypoints are 6.15 NM apart (the chart rounds up).
    expect(Math.abs(distanceNm(f('HELER'), f('JIKTA')) - 6.2)).toBeLessThan(0.1);
    // Profile: JIKTA 4.5 NM to the VDP, 1.4 NM to RW26L.
    expect(distanceNm(f('JIKTA'), f('RW26L'))).toBeCloseTo(5.9, 1);
  });

  it('the GP crosses the threshold at the TCH (60 ft) and JIKTA near the FAF altitude', () => {
    const at = (fix: string, alt: number) => readingAt('orway', 3, fix, alt).gp!;
    const thr = NAVDATA.runwayEnds.find((r) => r.airport === 'PUB' && r.runway === '26L')!;
    expect(Math.abs(at('RW26L', thr.elevationFt + 60).verticalErrorFt)).toBeLessThan(2);
    // JIKTA at 6600 is on or just below the GP (glidepath intercept at the FAF).
    const e = at('JIKTA', 6600).verticalErrorFt;
    expect(e).toBeGreaterThan(-60);
    expect(e).toBeLessThan(60);
  });
});
