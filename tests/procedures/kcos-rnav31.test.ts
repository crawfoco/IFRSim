/** KCOS RNAV (GPS) RWY 31: navdata and CIFP cross-checks, starts, golden GPS readings. */
import { describe, expect, it } from 'vitest';
import { NAVDATA } from '../../src/procedures';
import { checkAgainstCifp } from '../../src/procedures/cifp-check';
import json from '../../src/procedures/kcos-rnav31.json';
import { checkAgainstNavdata } from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import { signedAngleDiff } from '../../src/sim/geo/angles';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { gpsDatabase } from '../../src/sim/gps/flightplan';
import { buildGpsWorld, GPS_OFF, gpsReading, type GpsState } from '../../src/sim/gps/receiver';
import { buildScenario } from '../../src/sim/scenario/scenario';

const p = parseProcedure(json, 'kcos-rnav31.json');
const MV = NAVDATA.airports.KCOS!.magVarEastDeg;
const db = gpsDatabase(p, NAVDATA, MV)!;
const world = buildGpsWorld(db, NAVDATA, true);
const noWaas = buildGpsWorld(db, NAVDATA, false);
const f = (n: string) => db.fixes[n]!;

/** On `transition`'s plan, the leg `leg`, with the aircraft at `fix`. */
function readingAt(transition: string, leg: number, fix: string, altitudeFt = 8600, w = world) {
  const s: GpsState = { ...GPS_OFF, loaded: { transition }, active: true, leg };
  return gpsReading(s, w, { position: f(fix), altitudeFt }, 100, MV);
}

describe('KCOS RNAV 31 encoding', () => {
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

describe('KCOS RNAV 31 golden GPS readings', () => {
  // [transition, leg (0 is direct to the first fix), at fix, charted course °M, active waypoint]
  const cases: [string, number, string, number, string][] = [
    ['adane', 1, 'ADANE', 174, 'ZENER'],
    ['adane', 2, 'ZENER', 238, 'NUTVE'],
    ['zener', 1, 'ZENER', 238, 'NUTVE'],
    ['pub', 1, 'PUB', 340, 'ONKIE'],
    ['pub', 2, 'ONKIE', 340, 'NUTVE'],
    ['onkie', 1, 'ONKIE', 340, 'NUTVE'],
    ['zener', 2, 'NUTVE', 307, 'JATOL'],
    ['zener', 3, 'JATOL', 307, 'RW31'],
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
    expect(distanceNm(f('ADANE'), f('ZENER'))).toBeCloseTo(11.9, 1);
    expect(distanceNm(f('ZENER'), f('NUTVE'))).toBeCloseTo(6.2, 1);
    expect(distanceNm(f('PUB'), f('ONKIE'))).toBeCloseTo(18.4, 1);
    expect(distanceNm(f('ONKIE'), f('NUTVE'))).toBeCloseTo(5, 1);
    expect(distanceNm(f('NUTVE'), f('JATOL'))).toBeCloseTo(6.1, 1);
    // Profile: JATOL 4.2 NM to the VDP, 0.8 NM to RW31.
    expect(distanceNm(f('JATOL'), f('RW31'))).toBeCloseTo(5, 1);
  });

  it('with WAAS: LP+V on final, the advisory path (3.04°) not coupled', () => {
    const r = readingAt('zener', 3, 'JATOL', 7800);
    expect(r.line).toBe('LP');
    expect(r.annunciation).toBe('LP+V');
    expect(r.gpAdvisory).toBe(true);
    expect(r.vnavAvailable).toBe(false);
    // JATOL at 7800 is close to the advisory path.
    expect(r.gp).not.toBeNull();
  });

  it('the advisory path crosses the threshold at the TCH (52 ft)', () => {
    const thr = NAVDATA.runwayEnds.find((r) => r.airport === 'COS' && r.runway === '31')!;
    const elev = thr.displacedThreshold?.elevationFt ?? thr.elevationFt;
    const r = readingAt('zener', 3, 'RW31', elev + 52);
    expect(Math.abs(r.gp!.verticalErrorFt)).toBeLessThan(2);
  });

  it('without WAAS: LNAV, no vertical guidance', () => {
    const r = readingAt('zener', 3, 'JATOL', 7800, noWaas);
    expect(r.annunciation).toBe('LNAV');
    expect(r.gpAdvisory).toBe(false);
    expect(r.gp).toBeNull();
  });
});
