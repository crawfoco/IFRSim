/**
 * KALS RNAV (GPS) RWY 2 flown headlessly with the GPS: load, activate, CDI on GPS, NAV/APR,
 * GP capture (LPV) or step-down via XOGSY to the MDA (LNAV), the missed approach via APKOW to
 * the ICORY hold (climb in hold to 14600), the RODDS hold-in-lieu (from the ALS feeder and
 * direct) and vectors to final. The feeder starts begin off to one side at 17600, cleared to
 * descend and maintain the MSA (15600) until the IAF; the direct-RODDS start at 16000 is cleared
 * to 14000 (the hold's maximum altitude).
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA } from '../../src/procedures';
import json from '../../src/procedures/kals-rnav2.json';
import { parseProcedure } from '../../src/procedures/schema';
import { buildScenario, type ScenarioOptions } from '../../src/sim/scenario/scenario';
import { coursePosition, established } from '../../src/sim/scoring/geometry';
import { Flight } from '../sim/scripted';

const p = parseProcedure(json, 'kals-rnav2.json');

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

/** Descend (or climb) to `ft` unless already there: ALT doesn't capture a target it is already at. */
function descendTo(f: Flight, ft: number, fpm: number) {
  if (Math.abs(f.alt - ft) > 50) f.descendOrClimb(ft, fpm);
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

/** Established on the final approach course (as `assigned-altitude` judges it). */
const onFinal = (f: Flight) =>
  established(
    coursePosition(
      f.sc.final.course,
      { position: f.r.state.aircraft.position, altitudeFt: f.alt },
      NAVDATA,
    ),
    f.r.state.aircraft.headingTrueDeg,
    1.0,
  );

/**
 * With KROWZ active (past RODDS): down to 9900 for RODDS–KROWZ and APR. With LPV the GP is
 * captured near KROWZ (it crosses KROWZ at about 9940); with LNAV, 9300 once past KROWZ for the
 * KROWZ–BREZE segment.
 */
function intermediate(f: Flight) {
  descendTo(f, 9900, -800);
  f.send({ type: 'button', button: 'APR' });
  f.wait(0.5);
  expect(f.r.state.ap.lateral).toBe('APR');
  f.crossFix('KROWZ');
  if (!f.r.state.ap.gsArmed && f.r.state.ap.vertical !== 'GS') descendTo(f, 9300, -800);
}

const failedItems = (f: Flight) =>
  f
    .analyze()
    .items.filter((i) => i.status === 'fail')
    .map((i) => `${i.id}: ${i.measured}`);
const fails = (f: Flight) =>
  f
    .analyze()
    .items.filter((i) => i.status === 'fail')
    .map((i) => i.id);
const landed = (f: Flight) => f.progress.events.some((e) => e.kind === 'landed');

describe('KALS RNAV 2 on the GPS', () => {
  it('direct GEMKY from the north: the 086° NoPT route, captures the GP, lands at the LPV DA (100%)', () => {
    const f = fly({ startId: 'direct-gemky' });
    setUp(f, 'gemky');
    expect(f.r.state.ap.lateral).toBe('NAV');
    // Descend and maintain 15600 (the MSA) until GEMKY.
    descendTo(f, 15600, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'RODDS', 900)).toBe(true);
    expect(f.alt).toBeGreaterThan(15500);
    // On the NoPT feeder: down to its 12200 minimum.
    descendTo(f, 12200, -1000);
    const a = trackUntil(f, () => f.sensors.gps.activeWaypoint === 'KROWZ');
    expect(a.ok).toBe(true);
    // Fly-by: the GPS turns before RODDS; descend only once past it.
    f.crossFix('RODDS', 1.5);
    intermediate(f);
    // The GP is captured (from below, at 9900) before KROWZ.
    expect(f.r.state.ap.vertical).toBe('GS');
    const b = trackUntil(f, () => f.sensors.gps.activeWaypoint === 'RW02', 900);
    expect(b.ok).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LPV');
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => landed(f), 300)).toBe(true);
    expect(Math.max(a.maxXtk, b.maxXtk)).toBeLessThan(0.15);
    expect(failedItems(f)).toEqual([]);
  });

  it('direct VEPUY from the south, no WAAS: LNAV via the XOGSY step-down to the MDA, GA, SUSP, the ICORY hold with the climb in hold (100%)', () => {
    const f = fly({ startId: 'direct-vepuy', ceiling: 'below', waasAvailable: false });
    setUp(f, 'vepuy');
    descendTo(f, 15600, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'RODDS', 900)).toBe(true);
    descendTo(f, 12200, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'KROWZ', 900)).toBe(true);
    f.crossFix('RODDS', 1.5);
    intermediate(f);
    expect(f.r.state.ap.gsArmed).toBe(false); // LNAV: no glidepath to arm
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'XOGSY', 900)).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LNAV');
    // Past the FAF: down to the XOGSY step-down (8140), then past XOGSY to the MDA (7880).
    f.crossFix('BREZE');
    f.descendOrClimb(8140, -800);
    f.crossFix('XOGSY');
    f.descendOrClimb(7880, -800);
    expect(f.untilMinimums()).toBe(true);
    // No runway at the MDA: go around and arm the missed approach on the GPS.
    f.goAround(14600);
    f.send({ type: 'gpsSusp' });
    f.wait(1);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'APKOW', 300)).toBe(true);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'ICORY', 900)).toBe(true);
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'lapComplete'), 3000)).toBe(true);
    const items = f.analyze().items;
    expect(items.find((i) => i.id === 'climb-in-hold:ICORY')?.status).toBe('pass');
    expect(failedItems(f)).toEqual([]);
  });

  for (const [startId, transition, entry] of [
    ['direct-als', 'als', 'parallel'],
    ['direct-rodds', 'rodds', 'teardrop'],
  ] as const)
    it(`${startId}: the GPS flies a ${entry} entry into the RODDS hold-in-lieu, then the approach (100%)`, () => {
      const f = fly({ startId });
      setUp(f, transition);
      const assigned = f.sc.start.assigned.altFt;
      descendTo(f, assigned, -1000);
      if (transition === 'als') {
        // On the 223° feeder from ALS: down to its 12200 minimum (below the hold's 14000 maximum).
        expect(f.until(() => f.sensors.gps.activeWaypoint === 'RODDS', 900)).toBe(true);
        descendTo(f, 12200, -1000);
      }
      const entries = new Set<string>();
      const seen = new Set<string>();
      let descending = false;
      const a = trackUntil(
        f,
        () => {
          const h = f.r.state.gps.hold;
          if (h) {
            // In the hold-in-lieu: down to its 12200 minimum.
            if (!descending) {
              descending = true;
              descendTo(f, 12200, -1000);
            }
            entries.add(h.entry);
            seen.add(h.seg);
          }
          return f.sensors.gps.activeWaypoint === 'KROWZ';
        },
        2400,
      );
      expect(a.ok).toBe(true);
      expect([...entries]).toEqual([entry]);
      expect(seen.has('inbound')).toBe(true);
      intermediate(f);
      expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
      expect(f.untilMinimums()).toBe(true);
      expect(f.until(() => landed(f), 300)).toBe(true);
      expect(failedItems(f)).toEqual([]);
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
    // "Maintain 12200 until established": down only once on the final course.
    expect(f.until(() => onFinal(f), 180)).toBe(true);
    // Down to 9900 (the RODDS–KROWZ minimum); the GP captures near KROWZ.
    f.descendOrClimb(9900, -800);
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    expect(f.distTo('BREZE')).toBeGreaterThan(1.5);
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => landed(f), 300)).toBe(true);
    expect(failedItems(f)).toEqual([]);
  });

  it('bad run: straight in from the ALS feeder, Direct-To KROWZ at RODDS instead of the required hold-in-lieu, fails fix-order only', () => {
    const f = fly({ startId: 'direct-als' });
    setUp(f, 'als');
    descendTo(f, 15600, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'RODDS', 900)).toBe(true);
    descendTo(f, 12200, -1000);
    // Not NoPT: the hold-in-lieu is required. At RODDS the pilot skips it and turns straight in.
    expect(f.until(() => f.r.state.gps.hold !== null, 900)).toBe(true);
    f.send({ type: 'gpsDirect', fix: 'KROWZ' });
    f.wait(1);
    expect(f.sensors.gps.activeWaypoint).toBe('KROWZ');
    expect(f.r.state.gps.hold).toBeNull();
    // Back on the final course before descending below 12200.
    expect(f.until(() => onFinal(f), 600)).toBe(true);
    intermediate(f);
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => landed(f), 300)).toBe(true);
    expect(fails(f)).toEqual(['fix-order']);
  });

  it('bad run: down to the 12200 feeder altitude before GEMKY, below the assigned 15600 (the MSA), fails assigned-altitude only', () => {
    const f = fly({ startId: 'direct-gemky' });
    setUp(f, 'gemky');
    // Cleared to 15600 until GEMKY, the learner takes the 12200 printed on the feeder instead.
    f.descendOrClimb(12200, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'KROWZ', 1800)).toBe(true);
    f.crossFix('RODDS', 1.5);
    intermediate(f);
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => landed(f), 300)).toBe(true);
    const failed = failedItems(f);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatch(
      /^assigned-altitude: .*below the assigned 15,600 ft, before reaching GEMKY/,
    );
  });

  it('bad run (LNAV): straight to the MDA after the FAF, below XOGSY, fails segment-minimums only', () => {
    const f = fly({ startId: 'direct-vepuy', waasAvailable: false });
    setUp(f, 'vepuy');
    descendTo(f, 15600, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'RODDS', 900)).toBe(true);
    descendTo(f, 12200, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'KROWZ', 900)).toBe(true);
    f.crossFix('RODDS', 1.5);
    intermediate(f);
    f.crossFix('BREZE');
    f.descendOrClimb(7880, -1000);
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => landed(f), 300)).toBe(true);
    const failed = failedItems(f);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatch(/^segment-minimums: .*minimum 8,140 ft/);
  });
});
