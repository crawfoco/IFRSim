/**
 * KPUB RNAV (GPS) RWY 26L flown headlessly with the GPS: load, activate, CDI on GPS, NAV/APR,
 * GP capture (LPV) or step-down to the MDA (LNAV), the missed approach into the MERTZ hold, the
 * HELER hold-in-lieu (direct, teardrop and parallel entries) and vectors to final. The "direct"
 * starts begin off to one side at 11000, cleared to descend and maintain the MSA (9300) until the
 * IAF, so the learner descends, turns toward the fix, then descends on the NoPT route to 7000 or
 * flies the hold-in-lieu at HELER.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA } from '../../src/procedures';
import json from '../../src/procedures/kpub-rnav26l.json';
import { parseProcedure } from '../../src/procedures/schema';
import { signedAngleDiff } from '../../src/sim/geo/angles';
import { buildScenario, type ScenarioOptions } from '../../src/sim/scenario/scenario';
import { Flight } from '../sim/scripted';

const p = parseProcedure(json, 'kpub-rnav26l.json');

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
    if (!g.flag && f.r.state.ap.lateral === 'NAV') maxXtk = Math.max(maxXtk, Math.abs(g.xtkNm));
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

describe('KPUB RNAV 26L on the GPS', () => {
  it('direct ORWAY from the north: turns onto the NoPT route, captures the GP, lands at the LPV DA (100%)', () => {
    const f = fly({ startId: 'direct-orway' });
    setUp(f, 'orway');
    expect(f.r.state.ap.lateral).toBe('NAV');
    // Descend and maintain 9300 (the MSA) until ORWAY.
    descendTo(f, 9300, -700);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'HELER', 900)).toBe(true);
    expect(f.alt).toBeGreaterThan(9200);
    // Arriving from the north: a real turn (right, about 80°) onto the 270° NoPT route.
    expect(Math.abs(signedAngleDiff(f.hdgMag, 270))).toBeGreaterThanOrEqual(60);
    // On the published segment: down to its 7000 minimum.
    descendTo(f, 7000, -1000);
    const a = trackUntil(f, () => f.sensors.gps.activeWaypoint === 'JIKTA');
    expect(f.alt).toBeLessThan(7100);
    expect(a.ok).toBe(true);
    // Fly-by: the GPS turns before HELER; descend to 6600 only once past it.
    f.crossFix('HELER');
    f.descendOrClimb(6600, -500);
    f.send({ type: 'button', button: 'APR' });
    f.wait(0.5);
    expect(f.r.state.ap.lateral).toBe('APR');
    expect(f.r.state.ap.gsArmed).toBe(true);
    const b = trackUntil(f, () => f.r.state.ap.vertical === 'GS', 900);
    expect(b.ok).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LPV');
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => landed(f), 300)).toBe(true);
    expect(Math.max(a.maxXtk, b.maxXtk)).toBeLessThan(0.15);
    expect(failed(f)).toEqual([]);
  });

  it('no WAAS: LNAV to the MDA, go around, SUSP into the missed approach and the MERTZ hold (100%)', () => {
    const f = fly({ startId: 'direct-redhi', ceiling: 'below', waasAvailable: false });
    setUp(f, 'redhi');
    descendTo(f, 9300, -700);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'HELER', 900)).toBe(true);
    descendTo(f, 7000, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'JIKTA')).toBe(true);
    f.crossFix('HELER');
    f.descendOrClimb(6600, -500);
    f.send({ type: 'button', button: 'APR' });
    f.wait(0.5);
    expect(f.r.state.ap.gsArmed).toBe(false); // LNAV: no glidepath to arm
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'RW26L')).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LNAV');
    // Step down to the LNAV MDA (5100) once past the FAF.
    f.crossFix('JIKTA');
    f.descendOrClimb(5100, -700);
    expect(f.untilMinimums()).toBe(true);
    // No runway at the MDA: go around and arm the missed approach on the GPS.
    f.goAround(7000);
    f.send({ type: 'gpsSusp' });
    f.wait(1);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'MERTZ', 300)).toBe(true);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'lapComplete'), 3000)).toBe(true);
    expect(failed(f)).toEqual([]);
  });

  for (const [startId, entry] of [
    ['direct-heler', 'direct'],
    ['direct-heler-southwest', 'teardrop'],
    ['direct-heler-northwest', 'parallel'],
  ] as const)
    it(`${startId}: the GPS flies a ${entry} entry into the hold-in-lieu, then the approach (100%)`, () => {
      const f = fly({ startId });
      setUp(f, 'heler');
      descendTo(f, 9300, -700);
      const entries = new Set<string>();
      const seen = new Set<string>();
      let descending = false;
      const a = trackUntil(f, () => {
        const h = f.r.state.gps.hold;
        if (h) {
          // In the hold-in-lieu: down to its 7000 minimum.
          if (!descending) {
            descending = true;
            descendTo(f, 7000, -1000);
          }
          entries.add(h.entry);
          seen.add(h.seg);
        }
        return f.sensors.gps.activeWaypoint === 'JIKTA';
      });
      expect(a.ok).toBe(true);
      expect([...entries]).toEqual([entry]);
      expect(seen.has('inbound')).toBe(true);
      f.descendOrClimb(6600, -500);
      f.send({ type: 'button', button: 'APR' });
      expect(f.untilMinimums()).toBe(true);
      expect(f.until(() => landed(f), 300)).toBe(true);
      expect(failed(f)).toEqual([]);
    });

  it('bad run: direct HELER from the southeast (40° off the inbound course), Direct-To JIKTA at HELER instead of the hold fails fix-order only', () => {
    const f = fly({ startId: 'direct-heler' });
    setUp(f, 'heler');
    descendTo(f, 9300, -700);
    // Not NoPT: the hold-in-lieu is required. At HELER the pilot cuts the entry short, straight in.
    expect(f.until(() => f.r.state.gps.hold !== null, 900)).toBe(true);
    f.send({ type: 'gpsDirect', fix: 'JIKTA' });
    f.wait(1);
    expect(f.sensors.gps.activeWaypoint).toBe('JIKTA');
    expect(f.r.state.gps.hold).toBeNull();
    // Down from the MSA to 7000 at HELER, then to the FAF altitude 2 NM past it.
    descendTo(f, 7000, -1000);
    expect(f.until(() => f.distTo('HELER') > 2.2, 300)).toBe(true);
    f.descendOrClimb(6600, -700);
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

  it('direct PUB from the north: the 082° feeder to HELER, the hold-in-lieu, then the approach (100%)', () => {
    const f = fly({ startId: 'direct-pub' });
    setUp(f, 'pub');
    descendTo(f, 9300, -700);
    // On the 082° feeder from PUB: down to its 7200 minimum.
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'HELER', 900)).toBe(true);
    descendTo(f, 7200, -1000);
    const seen = new Set<string>();
    const a = trackUntil(
      f,
      () => {
        if (f.r.state.gps.hold) seen.add(`${f.r.state.gps.hold.entry}:${f.r.state.gps.hold.seg}`);
        return f.sensors.gps.activeWaypoint === 'JIKTA';
      },
      2000,
    );
    expect(a.ok).toBe(true);
    expect([...seen].some((x) => x.endsWith(':inbound'))).toBe(true);
    f.descendOrClimb(6600, -500);
    f.send({ type: 'button', button: 'APR' });
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => landed(f), 300)).toBe(true);
    expect(failed(f)).toEqual([]);
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
    f.descendOrClimb(6600, -500);
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => landed(f), 300)).toBe(true);
    expect(failed(f)).toEqual([]);
  });
});
