/**
 * KCOS RNAV (GPS) RWY 31 flown headlessly with the GPS: LP and LNAV only, with an advisory
 * descent angle (LP+V / LNAV+V, never coupled). Load, activate, CDI on GPS, NAV/APR, VS down to
 * the MDA after the FAF; the missed approach into the ADANE hold; vectors to final. The IAF starts
 * begin off to one side of their IAF at 9400, on a heading away from it (as after radar vectors):
 * the GPS goes direct to the IAF, turns onto the transition there, and the learner descends to
 * 8600 once on it.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA } from '../../src/procedures';
import json from '../../src/procedures/kcos-rnav31.json';
import { parseProcedure } from '../../src/procedures/schema';
import { buildScenario, type ScenarioOptions } from '../../src/sim/scenario/scenario';
import { Flight } from '../sim/scripted';

const p = parseProcedure(json, 'kcos-rnav31.json');

function fly(opts: Partial<ScenarioOptions> & { startId: string }) {
  const sc = buildScenario(p, NAVDATA, { ceiling: 'above', gsOutOfService: false, ...opts });
  return new Flight(sc);
}

/** Load and activate, CDI on GPS, AP with NAV. */
function setUp(f: Flight, transition: string) {
  f.send(
    { type: 'gpsLoad', transition },
    { type: 'gpsActivate' },
    { type: 'cdiSet', source: 'GPS' },
    { type: 'button', button: 'AP' },
  );
  f.wait(0.1);
  f.send({ type: 'button', button: 'NAV' });
  f.wait(1);
}

/** Max |cross-track| in NAV/APR, sampled every step until `done`. */
function trackUntil(f: Flight, done: () => boolean, maxS = 1500) {
  let maxXtk = 0;
  const ok = f.until(() => {
    const g = f.sensors.gps;
    if (!g.flag && (f.r.state.ap.lateral === 'NAV' || f.r.state.ap.lateral === 'APR'))
      maxXtk = Math.max(maxXtk, Math.abs(g.xtkNm));
    return done();
  }, maxS);
  return { ok, maxXtk };
}

const failed = (f: Flight) =>
  f
    .analyze()
    .items.filter((i) => i.status === 'fail')
    .map((i) => `${i.id}: ${i.measured}`);

const landed = (f: Flight) => f.progress.events.some((e) => e.kind === 'landed');

/** Over the IAF (fly-by), down to 8600 on the transition, and settled on the new course. */
function overIaf(f: Flight, iaf: string) {
  f.crossFix(iaf, 1.5);
  f.descendOrClimb(8600, -500);
  f.wait(60);
}

/** Descend in VS from the FAF to the MDA, then on to the runway once it is in sight. */
function vsToMdaAndLand(f: Flight, mdaFt: number) {
  f.crossFix('JATOL');
  f.descendOrClimb(mdaFt, -600);
  expect(f.untilMinimums()).toBe(true);
  expect(f.until(() => f.progress.events.some((e) => e.kind === 'runwayInSight'), 300)).toBe(true);
  f.descendOrClimb(6100, -600);
  expect(f.until(() => landed(f), 300)).toBe(true);
}

describe('KCOS RNAV 31 on the GPS', () => {
  it('direct ZENER from the southeast, WAAS: turns onto 238° at ZENER, LP+V advisory only (APR arms no GP), VS to the LP MDA, lands (100%)', () => {
    const f = fly({ startId: 'direct-zener' });
    setUp(f, 'zener');
    expect(f.r.state.ap.lateral).toBe('NAV');
    // Descend and maintain 9400 from 11500 to ZENER.
    f.descendOrClimb(9400, -1000);
    overIaf(f, 'ZENER');
    const a = trackUntil(f, () => f.sensors.gps.activeWaypoint === 'JATOL');
    expect(a.ok).toBe(true);
    // Fly-by: the GPS turns before NUTVE; descend to 7800 only once past it.
    f.crossFix('NUTVE');
    f.descendOrClimb(7800, -500);
    f.send({ type: 'button', button: 'APR' });
    f.wait(0.5);
    expect(f.r.state.ap.lateral).toBe('APR');
    expect(f.r.state.ap.gsArmed).toBe(false); // advisory path: nothing to couple
    const b = trackUntil(f, () => f.sensors.gps.activeWaypoint === 'RW31');
    expect(b.ok).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LP+V');
    expect(f.sensors.gps.gpAdvisory).toBe(true);
    vsToMdaAndLand(f, 6440);
    expect(f.r.state.ap.vertical).not.toBe('GS');
    expect(Math.max(a.maxXtk, b.maxXtk)).toBeLessThan(0.15);
    expect(failed(f)).toEqual([]);
  });

  it('direct ONKIE from the east, no WAAS: turns onto 340° at ONKIE, LNAV to the MDA, go around, SUSP into the ADANE hold (100%)', () => {
    const f = fly({ startId: 'direct-onkie', ceiling: 'below', waasAvailable: false });
    setUp(f, 'onkie');
    f.descendOrClimb(9400, -1000);
    overIaf(f, 'ONKIE');
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'JATOL')).toBe(true);
    f.crossFix('NUTVE');
    f.descendOrClimb(7800, -500);
    f.send({ type: 'button', button: 'APR' });
    f.wait(0.5);
    expect(f.r.state.ap.gsArmed).toBe(false);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'RW31')).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LNAV');
    expect(f.sensors.gps.gpAdvisory).toBe(false);
    f.crossFix('JATOL');
    f.descendOrClimb(6560, -600);
    expect(f.untilMinimums()).toBe(true);
    // No runway at the MDA: go around and arm the missed approach on the GPS.
    f.goAround(9000);
    f.send({ type: 'gpsSusp' });
    f.wait(1);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'ADANE', 300)).toBe(true);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'lapComplete'), 3000)).toBe(true);
    expect(failed(f)).toEqual([]);
  });

  it('bad run: down to the FAF altitude (7800) while turning in toward ZENER, below the assigned 9400 and the 8600 transition minimum, fails assigned-altitude and segment-minimums', () => {
    const f = fly({ startId: 'direct-zener' });
    setUp(f, 'zener');
    // Cleared to 9400, the learner keeps going down to 7800.
    f.descendOrClimb(7800, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'JATOL')).toBe(true);
    f.crossFix('NUTVE');
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'RW31')).toBe(true);
    vsToMdaAndLand(f, 6440);
    const fails = failed(f);
    expect(fails).toHaveLength(2);
    expect(fails[0]).toMatch(
      /^assigned-altitude: .*below the assigned 9,400 ft, before reaching ZENER/,
    );
    expect(fails[1]).toMatch(/^segment-minimums: .*minimum 8,600 ft/);
  });

  it('vectors to final: VTF, intercept on a heading in APR, LP to the MDA (100%)', () => {
    const f = fly({ startId: 'vectors-final' });
    f.send(
      { type: 'gpsLoad', transition: 'VTF' },
      { type: 'gpsActivate' },
      { type: 'cdiSet', source: 'GPS' },
      { type: 'button', button: 'AP' },
    );
    f.wait(0.1);
    f.send({ type: 'button', button: 'HDG' }, { type: 'button', button: 'APR' });
    f.wait(0.5);
    expect(f.r.state.ap.lateralArmed).toBe('APR');
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 600)).toBe(true);
    expect(f.r.state.ap.gsArmed).toBe(false);
    f.descendOrClimb(7800, -500);
    vsToMdaAndLand(f, 6440);
    expect(failed(f)).toEqual([]);
  });
});
