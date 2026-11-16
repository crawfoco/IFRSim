/**
 * KCNY RNAV (GPS) RWY 3: navdata and CIFP cross-checks, starts, golden GPS readings. The final is
 * offset 14.52° from the runway: the MAP (FOGUG) is a waypoint 0.5 NM before the threshold, and
 * the CIFP FAS data use a fictitious threshold point (FTP) on the extended final course abeam
 * the threshold, where the advisory 3.50° path crosses at the TCH (40 ft).
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA } from '../../src/procedures';
import { checkAgainstCifp } from '../../src/procedures/cifp-check';
import json from '../../src/procedures/kcny-rnav3.json';
import { checkAgainstNavdata } from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import { signedAngleDiff } from '../../src/sim/geo/angles';
import { distanceNm, initialBearingTrueDeg, type LatLon } from '../../src/sim/geo/geodesy';
import { gpsDatabase } from '../../src/sim/gps/flightplan';
import { buildGpsWorld, GPS_OFF, gpsReading, type GpsState } from '../../src/sim/gps/receiver';
import { buildScenario } from '../../src/sim/scenario/scenario';

const p = parseProcedure(json, 'kcny-rnav3.json');
const MV = NAVDATA.airports.KCNY!.magVarEastDeg;
const db = gpsDatabase(p, NAVDATA, MV)!;
const world = buildGpsWorld(db, NAVDATA, true);
const noWaas = buildGpsWorld(db, NAVDATA, false);
const f = (n: string) => db.fixes[n]!;
const thr = NAVDATA.runwayEnds.find((r) => r.airport === 'CNY' && r.runway === '03')!;
const fas = NAVDATA.cifp!.approaches['KCNY R03']!.pathPoint!;

/** On `transition`'s plan, the leg `leg`, with the aircraft at `pos`. */
function readingAt(
  transition: string,
  leg: number,
  at: string | LatLon,
  altitudeFt = 8100,
  w = world,
) {
  const s: GpsState = { ...GPS_OFF, loaded: { transition }, active: true, leg };
  const position = typeof at === 'string' ? f(at) : at;
  return gpsReading(s, w, { position, altitudeFt }, 100, MV);
}

describe('KCNY RNAV 3 encoding', () => {
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

describe('KCNY RNAV 3 golden GPS readings', () => {
  // [transition, leg (0 is direct to the first fix), at fix, charted course °M, active waypoint]
  const cases: [string, number, string, number, string][] = [
    ['kidne', 1, 'KIDNE', 72, 'HANOG'],
    ['pigse', 1, 'PIGSE', 348, 'HANOG'],
    ['archh', 1, 'ARCHH', 231, 'HANOG'],
    ['kidne', 2, 'HANOG', 46, 'NERRI'],
    ['kidne', 3, 'NERRI', 44, 'FELTA'],
    ['kidne', 4, 'FELTA', 44, 'FATPU'],
    ['kidne', 5, 'FATPU', 44, 'FOGUG'],
  ];
  for (const [t, leg, at, crs, wpt] of cases) {
    it(`${t}: at ${at}, desired track ${crs}° to ${wpt}, on course`, () => {
      const r = readingAt(t, leg, at);
      expect(r.activeWaypoint).toBe(wpt);
      expect(Math.abs(r.xtkNm)).toBeLessThan(0.01);
      expect(Math.abs(signedAngleDiff(r.dtkMagDeg, crs))).toBeLessThan(1);
    });
  }

  it('the ARCHH route holds at HANOG (hold-in-lieu, 046° inbound, right turns, 7 NM)', () => {
    const t = db.transitions.find((x) => x.id === 'archh')!;
    expect(t.offersHold).toBe(true);
    expect(t.holdFix).toBe('HANOG');
    expect(db.transitions.find((x) => x.id === 'kidne')!.offersHold).toBe(false);
    expect(db.transitions.find((x) => x.id === 'pigse')!.offersHold).toBe(false);
  });

  it('charted distances', () => {
    expect(distanceNm(f('KIDNE'), f('HANOG'))).toBeCloseTo(8.4, 1);
    expect(distanceNm(f('PIGSE'), f('HANOG'))).toBeCloseTo(10.5, 1);
    expect(distanceNm(f('ARCHH'), f('HANOG'))).toBeCloseTo(22, 1);
    expect(distanceNm(f('HANOG'), f('NERRI'))).toBeCloseTo(6, 1);
    // Profile: FELTA 3.2 NM and FATPU 2.4 NM to FOGUG; NERRI–FELTA 3.3 NM.
    expect(distanceNm(f('FELTA'), f('FOGUG'))).toBeCloseTo(3.2, 1);
    expect(distanceNm(f('FATPU'), f('FOGUG'))).toBeCloseTo(2.4, 1);
    expect(distanceNm(f('NERRI'), f('FELTA'))).toBeCloseTo(3.3, 1);
  });

  it('offset final: FOGUG is 0.5 NM before the threshold, the final course 14.5° right of the runway', () => {
    expect(distanceNm(f('FOGUG'), thr.threshold)).toBeCloseTo(0.5, 1);
    const finalMag = initialBearingTrueDeg(f('NERRI'), f('FOGUG')) - MV;
    const offset = signedAngleDiff(finalMag, thr.trueAlignmentDeg - MV);
    expect(offset).toBeGreaterThan(13);
    expect(offset).toBeLessThan(16);
    // The FTP lies on the extended final course, abeam the threshold (0.12 NM off it).
    const r = readingAt('kidne', 5, fas.ltp);
    expect(Math.abs(r.xtkNm)).toBeLessThan(0.01);
    expect(distanceNm(fas.ltp, thr.threshold)).toBeLessThan(0.15);
  });

  it('with WAAS: LP+V on final, the advisory path (3.50°) not coupled', () => {
    const r = readingAt('kidne', 3, 'NERRI', 7200);
    expect(r.line).toBe('LP');
    expect(r.annunciation).toBe('LP+V');
    expect(r.gpAdvisory).toBe(true);
    expect(r.vnavAvailable).toBe(false);
    expect(r.gp).not.toBeNull();
  });

  it('the advisory path crosses the FTP at the TCH (40 ft) and FOGUG at the CIFP 4775 ft', () => {
    const atFtp = readingAt('kidne', 5, fas.ltp, thr.elevationFt + 40);
    expect(Math.abs(atFtp.gp!.verticalErrorFt)).toBeLessThan(2);
    const atMap = readingAt('kidne', 5, 'FOGUG', 4775);
    expect(Math.abs(atMap.gp!.verticalErrorFt)).toBeLessThan(10);
    // FELTA (5980) and FATPU (5660) sit on the path (CIFP "V" step-downs).
    expect(Math.abs(readingAt('kidne', 4, 'FELTA', 5980).gp!.verticalErrorFt)).toBeLessThan(25);
    expect(Math.abs(readingAt('kidne', 5, 'FATPU', 5660).gp!.verticalErrorFt)).toBeLessThan(25);
  });

  it('without WAAS: LNAV, no vertical guidance', () => {
    const r = readingAt('kidne', 3, 'NERRI', 7200, noWaas);
    expect(r.annunciation).toBe('LNAV');
    expect(r.gpAdvisory).toBe(false);
    expect(r.gp).toBeNull();
  });
});
