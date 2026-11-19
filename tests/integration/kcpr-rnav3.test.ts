/**
 * KCPR RNAV (GPS) RWY 3 flown headlessly with the GPS: load, activate, CDI on GPS, NAV/APR,
 * GP capture (LPV) or step-down via NOPTE to the MDA (LNAV), and the missed approach to the
 * DDY hold. The starts begin off to one side of their IAF, on a heading away from it (as after
 * radar vectors): the GPS goes direct to the IAF and turns onto the transition there.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA } from '../../src/procedures';
import json from '../../src/procedures/kcpr-rnav3.json';
import { parseProcedure } from '../../src/procedures/schema';
import { buildScenario, type ScenarioOptions } from '../../src/sim/scenario/scenario';
import { Flight } from '../sim/scripted';

const p = parseProcedure(json, 'kcpr-rnav3.json');

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
    if (!g.flag && f.r.state.ap.lateral !== 'HDG') maxXtk = Math.max(maxXtk, Math.abs(g.xtkNm));
    return done();
  }, maxS);
  return { ok, maxXtk };
}

/** Over the IAF (fly-by), down to the next leg's minimum, and settled on the new course. */
function overIaf(f: Flight, iaf: string, toFt: number) {
  f.crossFix(iaf, 1.5);
  f.descendOrClimb(toFt, -500);
  f.wait(60);
}

const failed = (f: Flight) =>
  f
    .analyze()
    .items.filter((i) => i.status === 'fail')
    .map((i) => `${i.id}: ${i.measured}`);

describe('KCPR RNAV 3 on the GPS', () => {
  it('direct CHOMP from the west, at 10000: turns onto 012° at CHOMP, down to 8100, captures the GP, lands at the LPV DA (100%)', () => {
    const f = fly({ startId: 'direct-chomp' });
    setUp(f, 'chomp');
    expect(f.r.state.ap.lateral).toBe('NAV');
    // Maintain 10000 (the MSA) to CHOMP, then 8100 on the CHOMP–IPEYE leg.
    overIaf(f, 'CHOMP', 8100);
    const a = trackUntil(f, () => f.sensors.gps.activeWaypoint === 'YIWZE');
    expect(a.ok).toBe(true);
    // Fly-by: the GPS turns before IPEYE; descend to 7000 only once past it.
    f.crossFix('IPEYE');
    f.descendOrClimb(7000, -500);
    f.send({ type: 'button', button: 'APR' });
    f.wait(0.5);
    expect(f.r.state.ap.lateral).toBe('APR');
    expect(f.r.state.ap.gsArmed).toBe(true);
    const b = trackUntil(f, () => f.r.state.ap.vertical === 'GS', 900);
    expect(b.ok).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LPV');
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'landed'), 300)).toBe(true);
    expect(Math.max(a.maxXtk, b.maxXtk)).toBeLessThan(0.15);
    expect(failed(f)).toEqual([]);
  });

  it('direct HIKOX from the west via CEYFI: LPV to a landing (100%)', () => {
    const f = fly({ startId: 'direct-hikox' });
    setUp(f, 'hikox');
    // Descend and maintain 9000 from 10000; HIKOX → CEYFI at 9000; 8100 only once past CEYFI.
    f.descendOrClimb(9000, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'IPEYE', 1800)).toBe(true);
    overIaf(f, 'CEYFI', 8100);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'YIWZE', 900)).toBe(true);
    f.crossFix('IPEYE');
    f.descendOrClimb(7000, -500);
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'landed'), 300)).toBe(true);
    expect(failed(f)).toEqual([]);
  });

  it('no WAAS from HEITY: LNAV via the NOPTE step-down to the MDA, GA, SUSP, NAV into the DDY hold (100%)', () => {
    const f = fly({ startId: 'direct-heity', ceiling: 'below', waasAvailable: false });
    setUp(f, 'heity');
    // Descend and maintain 10800 from 13000; HEITY → AXIBY at 10800; 8100 only once past AXIBY.
    f.descendOrClimb(10800, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'IPEYE', 1800)).toBe(true);
    f.crossFix('AXIBY');
    f.descendOrClimb(8100, -500);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'YIWZE', 900)).toBe(true);
    f.crossFix('IPEYE');
    f.descendOrClimb(7000, -500);
    f.send({ type: 'button', button: 'APR' });
    f.wait(0.5);
    // Before the annunciation the GPS does not know WAAS is out: APR arms the glidepath as usual.
    expect(f.r.state.ap.gsArmed).toBe(true);
    expect(f.until(() => f.sensors.gps.annunciation !== null, 900)).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LNAV');
    f.wait(1);
    expect(f.r.state.ap.gsArmed).toBe(false); // LNAV: the glidepath arm is dropped
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'NOPTE', 900)).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LNAV');
    // Past the FAF: down to the NOPTE step-down (6240), then past NOPTE to the MDA (5780).
    f.crossFix('YIWZE');
    f.descendOrClimb(6240, -700);
    f.crossFix('NOPTE');
    f.descendOrClimb(5780, -700);
    expect(f.untilMinimums()).toBe(true);
    // No runway at the MDA: go around and arm the missed approach on the GPS.
    f.goAround(7500);
    f.send({ type: 'gpsSusp' });
    f.wait(1);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'KIVSE', 300)).toBe(true);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'DDY', 600)).toBe(true);
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'lapComplete'), 3000)).toBe(true);
    expect(failed(f)).toEqual([]);
  });

  it('bad run (LNAV): straight to the MDA after the FAF, below NOPTE, fails segment-minimums only', () => {
    const f = fly({ startId: 'direct-heity', ceiling: 'above', waasAvailable: false });
    setUp(f, 'heity');
    f.descendOrClimb(10800, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'IPEYE', 1800)).toBe(true);
    f.crossFix('AXIBY');
    f.descendOrClimb(8100, -500);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'YIWZE', 900)).toBe(true);
    f.crossFix('IPEYE');
    f.descendOrClimb(7000, -500);
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'NOPTE', 900)).toBe(true);
    f.crossFix('YIWZE');
    f.descendOrClimb(5780, -1000);
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'landed'), 300)).toBe(true);
    const fails = failed(f);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toMatch(/^segment-minimums: .*minimum 6,240 ft/);
  });

  it('bad run: down to 8100 while turning in toward HEITY, below the assigned 10800 (the feeder minimum), fails assigned-altitude and segment-minimums', () => {
    const f = fly({ startId: 'direct-heity' });
    setUp(f, 'heity');
    // Cleared to 10800, the learner takes 8100 (the IAF altitude at AXIBY) instead.
    f.descendOrClimb(8100, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'IPEYE', 1800)).toBe(true);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'YIWZE', 900)).toBe(true);
    f.crossFix('IPEYE');
    f.descendOrClimb(7000, -500);
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'landed'), 300)).toBe(true);
    const fails = failed(f);
    expect(fails).toHaveLength(2);
    expect(fails[0]).toMatch(
      /^assigned-altitude: .*below the assigned 10,800 ft, before reaching HEITY/,
    );
    expect(fails[1]).toMatch(/^segment-minimums: .*minimum 10,800 ft/);
  });

  it('vectors to final: VTF, intercept on a heading in APR, LPV to the DA (100%)', () => {
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
    f.descendOrClimb(7000, -500);
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'landed'), 300)).toBe(true);
    expect(failed(f)).toEqual([]);
  });
});
