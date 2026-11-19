/**
 * KOGA RNAV (GPS) RWY 8: a TAA with one IF/IAF (AHUFU). From the west (straight-in area) the
 * approach is flown without the hold; from the east (course-reversal area) the GPS flies the
 * hold-in-lieu at AHUFU first. Bad runs for the TAA rules.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, RNAV_PROCEDURES } from '../../src/procedures';
import { buildScenario, type ScenarioOptions } from '../../src/sim/scenario/scenario';
import { Flight } from '../sim/scripted';

const p = RNAV_PROCEDURES.find((x) => x.id === 'koga-rnav8')!;

function fly(opts: Partial<ScenarioOptions> & { startId: string }) {
  return new Flight(
    buildScenario(p, NAVDATA, { ceiling: 'above', gsOutOfService: false, ...opts }),
  );
}

/**
 * Load AHUFU (with or without the hold), activate, CDI GPS, AP NAV, and the descent from the
 * 10000 ft start to the 6000 ATC assigns (above both outer TAA rings, the hold maximum).
 */
function setUp(f: Flight, hold: boolean) {
  f.send(
    { type: 'gpsLoad', transition: 'ahufu', hold },
    { type: 'gpsActivate' },
    { type: 'cdiSet', source: 'GPS' },
    { type: 'button', button: 'AP' },
  );
  f.wait(0.1);
  f.send({ type: 'button', button: 'NAV' });
  f.wait(1);
  f.descendOrClimb(6000, -1000);
}

/** On to EZIFU at 5200 after AHUFU, APR, GP down to the LPV DA and the landing. */
function finishLpv(f: Flight) {
  expect(f.until(() => f.sensors.gps.activeWaypoint === 'EZIFU', 2400)).toBe(true);
  f.crossFix('AHUFU');
  f.descendOrClimb(5200, -500);
  f.send({ type: 'button', button: 'APR' });
  expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
  expect(f.untilMinimums()).toBe(true);
  expect(f.until(() => f.progress.events.some((e) => e.kind === 'landed'), 300)).toBe(true);
}

const items = (f: Flight) => f.analyze().items;
const fails = (f: Flight) =>
  items(f)
    .filter((i) => i.status === 'fail')
    .map((i) => i.id);

describe('KOGA RNAV 8 through the TAA', () => {
  it('northwest, straight-in area: turns toward AHUFU, no hold, TAA altitudes kept, 100%', () => {
    const f = fly({ startId: 'taa-west' });
    // Off to the northwest on a vector heading (200), not pointed at AHUFU.
    expect(f.r.state.aircraft.position.latDeg).toBeGreaterThan(f.sc.fixes.AHUFU!.latDeg);
    expect(f.r.state.aircraft.position.lonDeg).toBeLessThan(f.sc.fixes.AHUFU!.lonDeg);
    setUp(f, false);
    // 6000 (assigned) through the 5700 outer ring, 5300 within 6 NM of AHUFU.
    expect(f.until(() => (f.sensors.gps.distanceNm ?? 99) < 5.8, 900)).toBe(true);
    f.descendOrClimb(5300, -500);
    finishLpv(f);
    expect(f.r.state.gps.hold).toBeNull();
    expect(items(f).find((i) => i.id === 'taa-altitude')?.status).toBe('pass');
    expect(items(f).some((i) => i.id === 'taa-reversal')).toBe(false);
    expect(fails(f)).toEqual([]);
  });

  it('southeast, course-reversal area: the GPS flies a parallel entry into the hold at AHUFU, 100%', () => {
    const f = fly({ startId: 'taa-east' });
    expect(f.r.state.aircraft.position.latDeg).toBeLessThan(f.sc.fixes.AHUFU!.latDeg);
    expect(f.r.state.aircraft.position.lonDeg).toBeGreaterThan(f.sc.fixes.AHUFU!.lonDeg);
    setUp(f, true);
    let held = false;
    const entries = new Set<string>();
    expect(
      f.until(() => {
        if (f.r.state.gps.hold) {
          // At the assigned 6000 (the hold maximum) by AHUFU.
          if (!held) expect(Math.abs(f.r.state.aircraft.altitudeFt - 6000)).toBeLessThan(50);
          held = true;
          entries.add(f.r.state.gps.hold.entry);
        }
        return held && f.sensors.gps.activeWaypoint === 'EZIFU';
      }, 2400),
    ).toBe(true);
    expect([...entries]).toEqual(['parallel']);
    f.descendOrClimb(5200, -500);
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'landed'), 300)).toBe(true);
    expect(items(f).find((i) => i.id === 'taa-reversal')?.status).toBe('pass');
    expect(fails(f)).toEqual([]);
  });

  it('bad run: from the southeast without the hold fails taa-reversal', () => {
    const f = fly({ startId: 'taa-east' });
    setUp(f, false);
    // Straight in from the southeast means turning ~135° at AHUFU onto final.
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'EZIFU', 2400)).toBe(true);
    f.crossFix('AHUFU', 3);
    f.descendOrClimb(5200, -500);
    f.send({ type: 'button', button: 'APR' });
    expect(f.untilMinimums()).toBe(true);
    f.wait(60);
    // The hold is never flown (fix-order, taa-reversal). The skip is judged once the aircraft
    // heads down the final past AHUFU, so the descent to 5200 is not held to the hold's 5300.
    expect(fails(f)).toEqual(['fix-order', 'taa-reversal']);
  });

  it('bad run: down to 5300 in the outer ring of the straight-in area fails taa-altitude only', () => {
    const f = fly({ startId: 'taa-west' });
    setUp(f, false);
    // Already descending in VS: the pilot sets 5300 instead of the assigned 6000, and steepens
    // the descent so it is below 5700 while still in the outer ring.
    f.send({ type: 'altPreselect', ft: 5300 }, { type: 'vsTarget', fpm: -1500 });
    finishLpv(f);
    expect(fails(f)).toEqual(['taa-altitude']);
  });
});
