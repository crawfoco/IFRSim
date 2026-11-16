/**
 * KBFF RNAV (GPS) RWY 12 flown headlessly with the GPS: load, activate, CDI on GPS, NAV/APR,
 * GP capture (LPV) or step-down to the MDA (LNAV), the missed approach into the HAKAB hold, and the
 * LEDSE hold-in-lieu (direct, teardrop and parallel entries). The "direct" starts begin off to one
 * side and 1700-2000 ft high, cleared to descend and maintain the first segment's altitude (7800 at
 * ALBIN, 7000 at SPONS and LEDSE), so the learner descends, turns toward the fix, then onto the NoPT
 * route or into the hold-in-lieu.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA } from '../../src/procedures';
import json from '../../src/procedures/kbff-rnav12.json';
import { parseProcedure } from '../../src/procedures/schema';
import { signedAngleDiff } from '../../src/sim/geo/angles';
import { buildScenario, type ScenarioOptions } from '../../src/sim/scenario/scenario';
import { Flight } from '../sim/scripted';

const p = parseProcedure(json, 'kbff-rnav12.json');

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

const landed = (f: Flight) => f.progress.events.some((e) => e.kind === 'landed');

describe('KBFF RNAV 12 on the GPS', () => {
  it('direct SPONS from the north, via AYAYI: turns onto the feeder, captures the GP, lands at the LPV DA (100%)', () => {
    const f = fly({ startId: 'direct-spons' });
    setUp(f, 'spons');
    expect(f.r.state.ap.lateral).toBe('NAV');
    // Descend and maintain 7000 (the SPONS feeder altitude).
    descendTo(f, 7000, -700);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'AYAYI', 900)).toBe(true);
    // Arriving from the north: a real turn (right, about 75°) onto the 237° feeder.
    expect(Math.abs(signedAngleDiff(f.hdgMag, 237))).toBeGreaterThanOrEqual(60);
    const a = trackUntil(f, () => f.sensors.gps.activeWaypoint === 'LEDSE');
    expect(a.ok).toBe(true);
    // Fly-by: the GPS turns before AYAYI; descend only once past it.
    f.crossFix('AYAYI');
    f.descendOrClimb(6900, -500);
    const b = trackUntil(f, () => f.sensors.gps.activeWaypoint === 'CAPGA');
    expect(b.ok).toBe(true);
    f.crossFix('LEDSE');
    f.descendOrClimb(5700, -500);
    f.send({ type: 'button', button: 'APR' });
    f.wait(0.5);
    expect(f.r.state.ap.lateral).toBe('APR');
    expect(f.r.state.ap.gsArmed).toBe(true);
    const c = trackUntil(f, () => f.r.state.ap.vertical === 'GS', 900);
    expect(c.ok).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LPV');
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => landed(f), 300)).toBe(true);
    expect(Math.max(a.maxXtk, b.maxXtk, c.maxXtk)).toBeLessThan(0.15);
    expect(failed(f)).toEqual([]);
  });

  it('direct ALBIN from the southeast, no WAAS: LNAV to the MDA, go around, SUSP into the HAKAB hold (100%)', () => {
    const f = fly({ startId: 'direct-albin', ceiling: 'below', waasAvailable: false });
    setUp(f, 'albin');
    // Descend and maintain 7800 (the ALBIN feeder altitude).
    descendTo(f, 7800, -700);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'SACOP', 900)).toBe(true);
    // Arriving from the southeast: a real turn (right, about 85°) onto the 025° feeder.
    expect(Math.abs(signedAngleDiff(f.hdgMag, 25))).toBeGreaterThanOrEqual(60);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'LEDSE', 2400)).toBe(true);
    f.crossFix('SACOP');
    f.descendOrClimb(6900, -500);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'CAPGA')).toBe(true);
    f.crossFix('LEDSE');
    f.descendOrClimb(5700, -500);
    f.send({ type: 'button', button: 'APR' });
    f.wait(0.5);
    // Before the annunciation the GPS does not know WAAS is out: APR arms the glidepath as usual.
    expect(f.r.state.ap.gsArmed).toBe(true);
    expect(f.until(() => f.sensors.gps.annunciation !== null, 900)).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LNAV');
    f.wait(1);
    expect(f.r.state.ap.gsArmed).toBe(false); // LNAV: the glidepath arm is dropped
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'RW12')).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LNAV');
    // Step down to the LNAV MDA (4700) once past the FAF.
    f.crossFix('CAPGA');
    f.descendOrClimb(4700, -700);
    expect(f.untilMinimums()).toBe(true);
    // No runway at the MDA: go around and arm the missed approach on the GPS.
    f.goAround(6700);
    f.send({ type: 'gpsSusp' });
    f.wait(1);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'HAKAB', 300)).toBe(true);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'lapComplete'), 3000)).toBe(true);
    expect(failed(f)).toEqual([]);
  });

  for (const [startId, entry] of [
    ['direct-ledse', 'direct'],
    ['direct-ledse-east', 'teardrop'],
    ['direct-ledse-south', 'parallel'],
  ] as const)
    it(`${startId}: the GPS flies a ${entry} entry into the hold-in-lieu, then the approach (100%)`, () => {
      const f = fly({ startId });
      setUp(f, 'ledse');
      // Descend and maintain 7000, above the 6900 hold-in-lieu minimum.
      descendTo(f, 7000, -700);
      const entries = new Set<string>();
      const seen = new Set<string>();
      const a = trackUntil(
        f,
        () => {
          const h = f.r.state.gps.hold;
          if (h) {
            entries.add(h.entry);
            seen.add(h.seg);
          }
          return f.sensors.gps.activeWaypoint === 'CAPGA';
        },
        1500,
      );
      expect(a.ok).toBe(true);
      expect([...entries]).toEqual([entry]);
      expect(seen.has('inbound')).toBe(true);
      f.descendOrClimb(5700, -500);
      f.send({ type: 'button', button: 'APR' });
      expect(f.untilMinimums()).toBe(true);
      expect(f.until(() => landed(f), 300)).toBe(true);
      expect(failed(f)).toEqual([]);
    });

  it('bad run: direct LEDSE from the north (40° off the inbound course), Direct-To CAPGA at LEDSE instead of the hold fails fix-order only', () => {
    const f = fly({ startId: 'direct-ledse' });
    setUp(f, 'ledse');
    descendTo(f, 7000, -700);
    // Not NoPT: the hold-in-lieu is required. At LEDSE the pilot cuts the entry short, straight in.
    expect(f.until(() => f.r.state.gps.hold !== null, 900)).toBe(true);
    f.send({ type: 'gpsDirect', fix: 'CAPGA' });
    f.wait(1);
    expect(f.sensors.gps.activeWaypoint).toBe('CAPGA');
    expect(f.r.state.gps.hold).toBeNull();
    // Down to the FAF altitude once established inbound, 2 NM past LEDSE.
    expect(f.until(() => f.distTo('LEDSE') > 2.2, 300)).toBe(true);
    f.descendOrClimb(5700, -500);
    f.send({ type: 'button', button: 'APR' });
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => landed(f), 300)).toBe(true);
    expect(
      f
        .analyze()
        .items.filter((i) => i.status === 'fail')
        .map((i) => i.id),
    ).toEqual(['fix-order']);
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
    f.descendOrClimb(5700, -500);
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => landed(f), 300)).toBe(true);
    expect(failed(f)).toEqual([]);
  });
});
