/** Golden GPS readings at every KALS RNAV 2 fix, against the charted courses and distances. */
import { describe, expect, it } from 'vitest';
import { NAVDATA, RNAV_PROCEDURES } from '../../src/procedures';
import { checkAgainstCifp } from '../../src/procedures/cifp-check';
import { checkAgainstNavdata } from '../../src/procedures/resolve';
import { signedAngleDiff } from '../../src/sim/geo/angles';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { gpsDatabase } from '../../src/sim/gps/flightplan';
import { buildGpsWorld, GPS_OFF, gpsReading, type GpsState } from '../../src/sim/gps/receiver';

const p = RNAV_PROCEDURES.find((x) => x.id === 'kals-rnav2')!;
const MV = NAVDATA.airports.KALS!.magVarEastDeg;
const db = gpsDatabase(p, NAVDATA, MV)!;
const world = buildGpsWorld(db, NAVDATA, true);
const f = (n: string) => db.fixes[n]!;

/** On `transition`'s plan, the leg `leg`, with the aircraft at `fix`. */
function readingAt(transition: string, leg: number, fix: string) {
  const s: GpsState = { ...GPS_OFF, loaded: { transition }, active: true, leg };
  return gpsReading(s, world, { position: f(fix), altitudeFt: 12200 }, 100, MV);
}

describe('KALS RNAV 2 encoding', () => {
  it('matches NASR and the CIFP coding', () => {
    expect(checkAgainstNavdata(p, NAVDATA)).toEqual([]);
    expect(checkAgainstCifp(p, NAVDATA)).toEqual([]);
  });

  it('plate values: hold-in-lieu at RODDS, step-down, GP, minimums, missed hold', () => {
    const hold = p.transitions.find((t) => t.id === 'rodds')!.legs[0]!;
    expect(hold).toMatchObject({ type: 'hold', inboundCourseMag: 32, turn: 'R', legNm: 7 });
    expect(hold).toMatchObject({ minAltFt: 12200, maxAltFt: 14000 });
    expect(p.transitions.filter((t) => t.noPT).map((t) => t.id)).toEqual([
      'gemky',
      'wapre',
      'vepuy',
      'zotos',
    ]);
    const final = p.approach.find((l) => l.type === 'final')!;
    expect(final).toMatchObject({
      faf: 'BREZE',
      fafAltFt: 9300,
      gp: { angleDeg: 3, tchFt: 48 },
      stepDowns: [{ fix: 'XOGSY', minAltFt: 8140, lnavOnly: true }],
    });
    expect(p.minimums.map((m) => [m.kind, m.A.altFt, m.A.visibilitySm])).toEqual([
      ['LPV', 7740, 0.5],
      ['LNAV/VNAV', 7790, 0.5],
      ['LNAV', 7880, 0.5],
    ]);
    expect(p.missed.at(-1)).toMatchObject({
      type: 'hold',
      fix: 'ICORY',
      inboundCourseMag: 317,
      turn: 'R',
      legNm: 9,
      minAltFt: 14600,
      climbInHold: true,
    });
  });
});

describe('KALS RNAV 2 golden GPS readings', () => {
  // [transition, leg, at fix, charted course °M, active waypoint]
  const cases: [string, number, string, number, string][] = [
    ['gemky', 1, 'GEMKY', 86, 'RODDS'],
    ['wapre', 1, 'WAPRE', 43, 'RODDS'],
    ['vepuy', 1, 'VEPUY', 338, 'RODDS'],
    ['zotos', 1, 'ZOTOS', 295, 'VEPUY'],
    ['zotos', 2, 'VEPUY', 338, 'RODDS'],
    ['als', 1, 'ALS', 223, 'RODDS'],
    ['gemky', 2, 'RODDS', 23, 'KROWZ'],
    ['gemky', 3, 'KROWZ', 23, 'BREZE'],
    ['gemky', 4, 'BREZE', 23, 'XOGSY'],
    ['gemky', 5, 'XOGSY', 23, 'RW02'],
  ];
  for (const [t, leg, at, crs, wpt] of cases) {
    it(`at ${at}: desired track ${crs}° to ${wpt}, on course`, () => {
      const r = readingAt(t, leg, at);
      expect(r.activeWaypoint).toBe(wpt);
      expect(Math.abs(r.xtkNm)).toBeLessThan(0.01);
      expect(Math.abs(signedAngleDiff(r.dtkMagDeg, crs))).toBeLessThan(1);
    });
  }

  it('charted distances', () => {
    // Charted to the tenth: within 0.1 NM (GEMKY–RODDS is 12.75 NM, charted 12.8).
    const d = (a: string, b: string) => distanceNm(f(a), f(b));
    const near = (x: number, y: number) => expect(Math.abs(x - y)).toBeLessThanOrEqual(0.1);
    near(d('GEMKY', 'RODDS'), 12.8);
    near(d('WAPRE', 'RODDS'), 6);
    near(d('VEPUY', 'RODDS'), 8.4);
    near(d('ZOTOS', 'VEPUY'), 8.4);
    near(d('ALS', 'RODDS'), 14);
    near(d('RODDS', 'KROWZ'), 8);
    near(d('KROWZ', 'BREZE'), 2.1);
    near(d('BREZE', 'XOGSY'), 3.6);
    near(d('XOGSY', 'RW02'), 1.7);
    near(d('APKOW', 'ICORY'), 20.5);
  });

  it('the GP crosses the threshold at the TCH (48 ft) and BREZE near the FAF altitude', () => {
    const at = (fix: string, alt: number) =>
      gpsReading(
        { ...GPS_OFF, loaded: { transition: 'gemky' }, active: true, leg: 5 },
        world,
        { position: f(fix), altitudeFt: alt },
        100,
        MV,
      ).gp!;
    const thr = NAVDATA.runwayEnds.find((r) => r.airport === 'ALS' && r.runway === '02')!;
    expect(Math.abs(at('RW02', thr.elevationFt + 48).verticalErrorFt)).toBeLessThan(2);
    // BREZE at 9300 is on or just below the GP (glidepath intercept at the FAF).
    const e = at('BREZE', 9300).verticalErrorFt;
    expect(e).toBeGreaterThan(-60);
    expect(e).toBeLessThan(60);
  });
});
