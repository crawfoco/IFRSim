/**
 * KCNY RNAV (GPS) RWY 3 flown headlessly with the GPS: LP and LNAV only (advisory 3.50° path,
 * never coupled), two step-downs inside the FAF, and an offset final whose MAP (FOGUG) is a
 * waypoint 0.5 NM before the threshold, 14.52° off the runway heading. The "direct" starts begin
 * off to one side at 10000, cleared to maintain 10000 until the fix: KIDNE and PIGSE
 * are NoPT; the ARCHH route and direct HANOG need the HANOG hold-in-lieu.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA } from '../../src/procedures';
import json from '../../src/procedures/kcny-rnav3.json';
import { parseProcedure } from '../../src/procedures/schema';
import { buildScenario, type ScenarioOptions } from '../../src/sim/scenario/scenario';
import { Flight } from '../sim/scripted';

const p = parseProcedure(json, 'kcny-rnav3.json');

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

/** Descend (or climb) to `ft` unless already there: ALT doesn't capture a target it is already at. */
function descendTo(f: Flight, ft: number, fpm: number) {
  if (Math.abs(f.alt - ft) > 50) f.descendOrClimb(ft, fpm);
}

const failed = (f: Flight) =>
  f
    .analyze()
    .items.filter((i) => i.status === 'fail')
    .map((i) => `${i.id}: ${i.measured}`);
const failedIds = (f: Flight) =>
  f
    .analyze()
    .items.filter((i) => i.status === 'fail')
    .map((i) => i.id);

const landed = (f: Flight) => f.progress.events.some((e) => e.kind === 'landed');

const MDA = 5340;

/** From HANOG: 7200 to NERRI, APR, then the step-downs FELTA 5980 and FATPU 5660 and the MDA. */
function finalToMda(f: Flight) {
  f.crossFix('HANOG');
  descendTo(f, 7200, -700);
  f.send({ type: 'button', button: 'APR' });
  f.wait(0.5);
  expect(f.r.state.ap.lateral).toBe('APR');
  expect(f.r.state.ap.gsArmed).toBe(false); // advisory path only: nothing to couple
  const b = trackUntil(f, () => f.sensors.gps.activeWaypoint === 'FELTA');
  expect(b.ok).toBe(true);
  f.crossFix('NERRI');
  f.descendOrClimb(5980, -700);
  f.crossFix('FELTA');
  f.descendOrClimb(5660, -700);
  f.crossFix('FATPU');
  f.descendOrClimb(MDA, -600);
  expect(f.untilMinimums()).toBe(true);
  return b;
}

/** At the MDA with the runway in sight: on down (on the offset final course) to a landing. */
function land(f: Flight) {
  expect(f.until(() => f.progress.events.some((e) => e.kind === 'runwayInSight'), 120)).toBe(true);
  f.descendOrClimb(4900, -600);
  expect(f.until(() => landed(f), 300)).toBe(true);
}

describe('KCNY RNAV 3 on the GPS', () => {
  it('direct KIDNE from the northwest: NoPT 072° to HANOG, LP+V, step-downs, LP MDA, lands on the offset final (100%)', () => {
    const f = fly({ startId: 'direct-kidne' });
    setUp(f, 'kidne');
    expect(f.r.state.ap.lateral).toBe('NAV');
    descendTo(f, 10000, -800);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'HANOG', 900)).toBe(true);
    expect(f.alt).toBeGreaterThan(9900);
    // On the NoPT feeder: down to its 8100 minimum.
    descendTo(f, 8100, -800);
    const a = trackUntil(f, () => f.sensors.gps.activeWaypoint === 'NERRI');
    expect(a.ok).toBe(true);
    const b = finalToMda(f);
    expect(f.sensors.gps.annunciation).toBe('LP+V');
    expect(f.sensors.gps.gpAdvisory).toBe(true);
    land(f);
    expect(f.r.state.ap.vertical).not.toBe('GS');
    expect(Math.max(a.maxXtk, b.maxXtk)).toBeLessThan(0.15);
    expect(failed(f)).toEqual([]);
  });

  it('direct PIGSE from the southwest, no WAAS: NoPT 348° to HANOG, LNAV to the MDA, go around, SUSP into the HANOG hold (100%)', () => {
    const f = fly({ startId: 'direct-pigse', ceiling: 'below', waasAvailable: false });
    setUp(f, 'pigse');
    descendTo(f, 10000, -800);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'HANOG', 900)).toBe(true);
    descendTo(f, 8100, -800);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'NERRI', 900)).toBe(true);
    finalToMda(f);
    expect(f.sensors.gps.annunciation).toBe('LNAV');
    expect(f.sensors.gps.gpAdvisory).toBe(false);
    // No runway at the MDA: go around and arm the missed approach on the GPS.
    f.goAround(8100);
    f.send({ type: 'gpsSusp' });
    f.wait(1);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'HANOG', 300)).toBe(true);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'lapComplete'), 3000)).toBe(true);
    expect(failed(f)).toEqual([]);
  });

  for (const [startId, transition] of [
    ['direct-archh', 'archh'],
    ['direct-hanog', 'hanog'],
  ] as const)
    it(`${startId}: the GPS flies the HANOG hold-in-lieu, then the approach to the LP MDA and a landing (100%)`, () => {
      const f = fly({ startId });
      setUp(f, transition);
      descendTo(f, 10000, -800);
      const entries = new Set<string>();
      const seen = new Set<string>();
      let descending = false;
      const a = trackUntil(
        f,
        () => {
          // On the ARCHH feeder (or in the hold): down to 8100.
          if (!descending && (f.sensors.gps.activeWaypoint === 'HANOG' || f.r.state.gps.hold)) {
            if (transition === 'archh' || f.r.state.gps.hold) {
              descending = true;
              descendTo(f, 8100, -800);
            }
          }
          const h = f.r.state.gps.hold;
          if (h) {
            entries.add(h.entry);
            seen.add(h.seg);
          }
          return f.sensors.gps.activeWaypoint === 'NERRI';
        },
        2400,
      );
      expect(a.ok).toBe(true);
      expect(seen.has('inbound')).toBe(true);
      expect(entries.size).toBe(1);
      finalToMda(f);
      land(f);
      expect(failed(f)).toEqual([]);
    });

  it('vectors to final: VTF, intercept on a heading in APR, LP to the MDA, lands (100%)', () => {
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
    f.descendOrClimb(7200, -500);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'FELTA', 900)).toBe(true);
    f.crossFix('NERRI');
    f.descendOrClimb(5980, -700);
    f.crossFix('FELTA');
    f.descendOrClimb(5660, -700);
    f.crossFix('FATPU');
    f.descendOrClimb(MDA, -600);
    expect(f.untilMinimums()).toBe(true);
    land(f);
    expect(failed(f)).toEqual([]);
  });

  it('bad run: direct ARCHH, Direct-To NERRI at HANOG instead of the hold-in-lieu, fails fix-order only', () => {
    const f = fly({ startId: 'direct-archh' });
    setUp(f, 'archh');
    descendTo(f, 10000, -800);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'HANOG', 900)).toBe(true);
    descendTo(f, 8100, -800);
    // Not NoPT: the hold-in-lieu is required. At HANOG the pilot cuts it short, straight in.
    expect(f.until(() => f.r.state.gps.hold !== null, 900)).toBe(true);
    f.send({ type: 'gpsDirect', fix: 'NERRI' });
    f.wait(1);
    expect(f.sensors.gps.activeWaypoint).toBe('NERRI');
    expect(f.until(() => f.distTo('HANOG') > 2.2, 300)).toBe(true);
    f.descendOrClimb(7200, -700);
    f.send({ type: 'button', button: 'APR' });
    f.crossFix('NERRI', 1.5);
    f.descendOrClimb(5980, -700);
    f.crossFix('FELTA');
    f.descendOrClimb(5660, -700);
    f.crossFix('FATPU');
    f.descendOrClimb(MDA, -600);
    expect(f.untilMinimums()).toBe(true);
    land(f);
    expect(failedIds(f)).toEqual(['fix-order']);
  });

  it('bad run: straight from the FAF to the MDA, below the FELTA (5980) step-down, fails segment-minimums only', () => {
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
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 600)).toBe(true);
    f.descendOrClimb(7200, -500);
    f.crossFix('NERRI', 1.5);
    // Dive for the MDA at 1000 fpm, ignoring the step-downs.
    f.descendOrClimb(MDA, -1000);
    expect(f.untilMinimums()).toBe(true);
    land(f);
    const fails = failed(f);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toMatch(/^segment-minimums: .*5,980 ft/);
  });

  it('bad run: down to the 8100 feeder altitude while still heading for KIDNE, below the assigned 10000, fails assigned-altitude only', () => {
    const f = fly({ startId: 'direct-kidne' });
    setUp(f, 'kidne');
    // Cleared to 10000 until KIDNE, the learner goes straight down to 8100.
    f.descendOrClimb(8100, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'NERRI', 1200)).toBe(true);
    finalToMda(f);
    land(f);
    const fails = failed(f);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toMatch(
      /^assigned-altitude: .*below the assigned 10,000 ft, before reaching KIDNE/,
    );
  });
});
