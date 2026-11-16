/**
 * KAPA RNAV (GPS) RWY 28 flown headlessly with the GPS: load, activate, CDI on GPS, NAV/APR,
 * the MESME step-down before the FAF, GP capture (LPV) or step-down via FEGIB to the MDA (LNAV),
 * and the missed approach into the EZBEL hold. The IAF starts begin off to one side of their IAF
 * at 9000, on a heading away from it (as after radar vectors): the GPS goes direct to the IAF,
 * turns onto the transition there, and the learner descends to 8100 once on it.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA } from '../../src/procedures';
import json from '../../src/procedures/kapa-rnav28.json';
import { parseProcedure } from '../../src/procedures/schema';
import { buildScenario, type ScenarioOptions } from '../../src/sim/scenario/scenario';
import { Flight } from '../sim/scripted';

const p = parseProcedure(json, 'kapa-rnav28.json');

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

const failed = (f: Flight) =>
  f
    .analyze()
    .items.filter((i) => i.status === 'fail')
    .map((i) => `${i.id}: ${i.measured}`);

const landed = (f: Flight) => f.progress.events.some((e) => e.kind === 'landed');

/** Over the IAF (fly-by), down to 8100 on the transition, and settled on the new course. */
function overIaf(f: Flight, iaf: string) {
  f.crossFix(iaf, 1.5);
  f.descendOrClimb(8100, -500);
  f.wait(60);
}

/** DOCKY at 8100, then 7600 to MESME, then 7500 to the FAF (NIDLY). */
function intermediate(f: Flight) {
  const a = trackUntil(f, () => f.sensors.gps.activeWaypoint === 'MESME');
  expect(a.ok).toBe(true);
  f.crossFix('DOCKY');
  f.descendOrClimb(7600, -500);
  const b = trackUntil(f, () => f.sensors.gps.activeWaypoint === 'NIDLY', 900);
  expect(b.ok).toBe(true);
  f.crossFix('MESME');
  f.descendOrClimb(7500, -500);
  return Math.max(a.maxXtk, b.maxXtk);
}

describe('KAPA RNAV 28 on the GPS', () => {
  it('direct DILVE from the south: turns onto 283° at DILVE, MESME step-down, captures the GP, lands at the LPV DA (100%)', () => {
    const f = fly({ startId: 'from-dilve' });
    setUp(f, 'dilve');
    // Descend and maintain 9000 from 11000 to DILVE.
    f.descendOrClimb(9000, -1000);
    expect(f.r.state.ap.lateral).toBe('NAV');
    overIaf(f, 'DILVE');
    const xtk = intermediate(f);
    f.send({ type: 'button', button: 'APR' });
    f.wait(0.5);
    expect(f.r.state.ap.lateral).toBe('APR');
    expect(f.r.state.ap.gsArmed).toBe(true);
    const c = trackUntil(f, () => f.r.state.ap.vertical === 'GS', 900);
    expect(c.ok).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LPV');
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => landed(f), 300)).toBe(true);
    expect(Math.max(xtk, c.maxXtk)).toBeLessThan(0.15);
    expect(failed(f)).toEqual([]);
  });

  it('no WAAS from EZBEL: LNAV via the FEGIB step-down to the MDA, GA, SUSP, NAV into the EZBEL hold (100%)', () => {
    const f = fly({ startId: 'from-ezbel', ceiling: 'below', waasAvailable: false });
    setUp(f, 'ezbel');
    f.descendOrClimb(9000, -1000);
    overIaf(f, 'EZBEL');
    intermediate(f);
    f.send({ type: 'button', button: 'APR' });
    f.wait(0.5);
    // Before the annunciation the GPS does not know WAAS is out: APR arms the glidepath as usual.
    expect(f.r.state.ap.gsArmed).toBe(true);
    expect(f.until(() => f.sensors.gps.annunciation !== null, 900)).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LNAV');
    f.wait(1);
    expect(f.r.state.ap.gsArmed).toBe(false); // LNAV: the glidepath arm is dropped
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'FEGIB', 900)).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LNAV');
    // Past the FAF: down to the FEGIB step-down (6940), then past FEGIB to the MDA (6260).
    f.crossFix('NIDLY');
    f.descendOrClimb(6940, -700);
    f.crossFix('FEGIB');
    f.descendOrClimb(6260, -700);
    expect(f.untilMinimums()).toBe(true);
    // No runway at the MDA: go around and arm the missed approach on the GPS.
    f.goAround(9000);
    f.send({ type: 'gpsSusp' });
    f.wait(1);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'EZBEL', 300)).toBe(true);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'lapComplete'), 3000)).toBe(true);
    expect(failed(f)).toEqual([]);
  });

  it('bad run: cleared via EZBEL from the north but loads DILVE (the other IAF), fails gps-approach-active only', () => {
    const f = fly({ startId: 'from-ezbel' });
    setUp(f, 'dilve');
    f.descendOrClimb(9000, -1000);
    overIaf(f, 'DILVE');
    intermediate(f);
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => landed(f), 300)).toBe(true);
    expect(failed(f)).toEqual([
      'gps-approach-active: Loaded via DILVE (IAF), cleared via EZBEL (IAF)',
    ]);
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
    // Established inside DOCKY: 7600 to MESME, then 7500 to the FAF.
    expect(f.until(() => f.distTo('NIDLY') < 6, 600)).toBe(true);
    f.descendOrClimb(7600, -500);
    f.crossFix('MESME');
    f.descendOrClimb(7500, -500);
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => landed(f), 300)).toBe(true);
    expect(failed(f)).toEqual([]);
  });
});
