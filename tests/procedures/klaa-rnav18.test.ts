/** Golden GPS readings at every KLAA RNAV 18 fix, against the charted courses and distances. */
import { describe, expect, it } from 'vitest';
import { NAVDATA, RNAV_PROCEDURES } from '../../src/procedures';
import { signedAngleDiff } from '../../src/sim/geo/angles';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { gpsDatabase } from '../../src/sim/gps/flightplan';
import { buildGpsWorld, GPS_OFF, gpsReading, type GpsState } from '../../src/sim/gps/receiver';

const p = RNAV_PROCEDURES.find((x) => x.id === 'klaa-rnav18')!;
const MV = NAVDATA.airports.KLAA!.magVarEastDeg;
const db = gpsDatabase(p, NAVDATA, MV)!;
const world = buildGpsWorld(db, NAVDATA, true);
const f = (n: string) => db.fixes[n]!;

/** On `transition`'s plan, the leg `leg`, with the aircraft at `fix`. */
function readingAt(transition: string, leg: number, fix: string) {
  const s: GpsState = { ...GPS_OFF, loaded: { transition }, active: true, leg };
  return gpsReading(s, world, { position: f(fix), altitudeFt: 6000 }, 100, MV);
}

describe('KLAA RNAV 18 golden GPS readings', () => {
  // [transition, leg, at fix, charted course °M, active waypoint]
  const cases: [string, number, string, number, string][] = [
    ['weyyi', 1, 'WEYYI', 92, 'OBOZU'],
    ['wizge', 1, 'WIZGE', 274, 'OBOZU'],
    ['weyyi', 2, 'OBOZU', 183, 'LOLME'],
    ['weyyi', 3, 'LOLME', 183, 'RW18'],
  ];
  for (const [t, leg, at, crs, wpt] of cases) {
    it(`at ${at}: desired track ${crs}° to ${wpt}, on course`, () => {
      const r = readingAt(t, leg, at);
      expect(r.activeWaypoint).toBe(wpt);
      expect(Math.abs(r.xtkNm)).toBeLessThan(0.01);
      expect(Math.abs(signedAngleDiff(r.dtkMagDeg, crs))).toBeLessThan(1);
    });
  }

  it('charted distances: WEYYI and WIZGE 8.3, OBOZU-LOLME 6.1, LOLME-RW18 5.5 NM', () => {
    expect(distanceNm(f('WEYYI'), f('OBOZU'))).toBeCloseTo(8.3, 1);
    expect(distanceNm(f('WIZGE'), f('OBOZU'))).toBeCloseTo(8.3, 1);
    expect(distanceNm(f('OBOZU'), f('LOLME'))).toBeCloseTo(6.1, 1);
    expect(distanceNm(f('LOLME'), f('RW18'))).toBeCloseTo(5.5, 1);
  });

  it('the GP crosses the threshold at the TCH (41 ft) and LOLME near the FAF altitude', () => {
    const at = (fix: string, alt: number) =>
      gpsReading(
        { ...GPS_OFF, loaded: { transition: 'weyyi' }, active: true, leg: 3 },
        world,
        { position: f(fix), altitudeFt: alt },
        100,
        MV,
      ).gp!;
    const thr = NAVDATA.runwayEnds.find((r) => r.airport === 'LAA' && r.runway === '18')!;
    expect(Math.abs(at('RW18', thr.elevationFt + 41).verticalErrorFt)).toBeLessThan(2);
    // LOLME at 5500 is on or just below the GP (glidepath intercept at the FAF).
    const e = at('LOLME', 5500).verticalErrorFt;
    expect(e).toBeGreaterThan(-60);
    expect(e).toBeLessThan(60);
  });
});
