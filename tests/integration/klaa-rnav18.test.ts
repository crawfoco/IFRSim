/**
 * KLAA RNAV (GPS) RWY 18 flown headlessly with the GPS: load, activate, CDI on GPS, NAV/APR,
 * GP capture (LPV) or step-down to the MDA (LNAV), and the missed approach into the hold.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, RNAV_PROCEDURES } from '../../src/procedures';
import { buildScenario, type ScenarioOptions } from '../../src/sim/scenario/scenario';
import { coursePosition, established } from '../../src/sim/scoring/geometry';
import { Flight } from '../sim/scripted';

const p = RNAV_PROCEDURES.find((x) => x.id === 'klaa-rnav18')!;

function fly(opts: Partial<ScenarioOptions> & { startId: string }) {
  const sc = buildScenario(p, NAVDATA, { ceiling: 'above', gsOutOfService: false, ...opts });
  return new Flight(sc);
}

/**
 * Load and activate, CDI on GPS, AP with NAV, and the descent from the 9000 ft start to the
 * 7000 ATC assigns (above the 6200 MSA until on the feeder or at OBOZU).
 */
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
  f.descendOrClimb(7000, -1000);
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

/** Max |cross-track| while `cond` holds, sampled every step until `done`. */
function trackUntil(f: Flight, done: () => boolean, maxS = 1500) {
  let maxXtk = 0;
  const ok = f.until(() => {
    const g = f.sensors.gps;
    if (!g.flag && f.r.state.ap.lateral === 'NAV') maxXtk = Math.max(maxXtk, Math.abs(g.xtkNm));
    return done();
  }, maxS);
  return { ok, maxXtk };
}

describe('KLAA RNAV 18 on the GPS', () => {
  it('direct WEYYI from the north: turns onto the feeder, tracks the legs, captures the GP, lands at the LPV DA (100%)', () => {
    const f = fly({ startId: 'direct-weyyi' });
    // Heading 230, north of WEYYI: the GPS goes direct from here, the AP turns left toward it.
    expect(f.r.state.aircraft.position.latDeg).toBeGreaterThan(f.sc.fixes.WEYYI!.latDeg);
    setUp(f, 'weyyi');
    expect(f.r.state.ap.lateral).toBe('NAV');
    // At WEYYI the GPS turns ~85° left onto the 092° feeder (NoPT: no reversal).
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'OBOZU', 900)).toBe(true);
    // Down from 9000 to the assigned 7000 well before WEYYI.
    expect(Math.abs(f.r.state.aircraft.altitudeFt - 7000)).toBeLessThan(50);
    f.descendOrClimb(6000, -500);
    f.wait(60); // settle after the turn onto the feeder
    // On to OBOZU at 6000, then 5500 for the intermediate segment.
    const a = trackUntil(f, () => f.sensors.gps.activeWaypoint === 'LOLME');
    expect(a.ok).toBe(true);
    // Fly-by: the GPS turns before OBOZU; descend only once past it.
    f.crossFix('OBOZU');
    f.descendOrClimb(5500, -500);
    f.send({ type: 'button', button: 'APR' });
    f.wait(0.5);
    expect(f.r.state.ap.lateral).toBe('APR');
    expect(f.r.state.ap.gsArmed).toBe(true);
    const b = trackUntil(f, () => f.r.state.ap.vertical === 'GS', 900);
    expect(b.ok).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LPV');
    expect(f.untilMinimums()).toBe(true);
    // Fly on to the landing (the runway is in sight at the DA).
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'landed'), 300)).toBe(true);
    expect(Math.max(a.maxXtk, b.maxXtk)).toBeLessThan(0.15);
    const result = f.analyze();
    const failed = result.items
      .filter((i) => i.status === 'fail')
      .map((i) => `${i.id}: ${i.measured}`);
    expect(failed).toEqual([]);
  });

  it('no WAAS: LNAV to the MDA, go around, SUSP into the missed approach and the IHIYO hold (100%)', () => {
    const f = fly({ startId: 'direct-wizge', ceiling: 'below', waasAvailable: false });
    setUp(f, 'wizge');
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'LOLME')).toBe(true);
    f.crossFix('OBOZU');
    f.descendOrClimb(5500, -500);
    f.send({ type: 'button', button: 'APR' });
    f.wait(0.5);
    expect(f.r.state.ap.gsArmed).toBe(false); // LNAV: no glidepath to arm
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'RW18')).toBe(true);
    expect(f.sensors.gps.annunciation).toBe('LNAV');
    // Step down to the LNAV MDA (4260) once past the FAF.
    f.crossFix('LOLME');
    f.descendOrClimb(4260, -700);
    expect(f.untilMinimums()).toBe(true);
    // No runway at the MDA: go around and arm the missed approach on the GPS.
    f.goAround(6200);
    f.send({ type: 'gpsSusp' });
    f.wait(1);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'IHIYO', 300)).toBe(true);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'lapComplete'), 3000)).toBe(true);
    const result = f.analyze();
    const failed = result.items
      .filter((i) => i.status === 'fail')
      .map((i) => `${i.id}: ${i.measured}`);
    expect(failed).toEqual([]);
  });

  for (const [startId, entry] of [
    ['direct-obozu', 'teardrop'],
    ['direct-obozu-west', 'parallel'],
    ['direct-obozu-northwest', 'direct'],
  ] as const)
    it(`${startId}: the GPS flies a ${entry} entry into the hold-in-lieu, then the approach (100%)`, () => {
      const f = fly({ startId });
      setUp(f, 'obozu');
      const entries = new Set<string>();
      const a = trackUntil(
        f,
        () => {
          if (f.r.state.gps.hold) entries.add(f.r.state.gps.hold.entry);
          return f.sensors.gps.activeWaypoint === 'LOLME';
        },
        1800,
      );
      expect(a.ok).toBe(true);
      expect([...entries]).toEqual([entry]);
      f.descendOrClimb(5500, -500);
      f.send({ type: 'button', button: 'APR' });
      expect(f.untilMinimums()).toBe(true);
      expect(f.until(() => f.progress.events.some((e) => e.kind === 'landed'), 300)).toBe(true);
      const failed = f
        .analyze()
        .items.filter((i) => i.status === 'fail')
        .map((i) => `${i.id}: ${i.measured}`);
      expect(failed).toEqual([]);
    });

  it('bad run: direct OBOZU from the northwest (nearly straight in), Direct-To LOLME at OBOZU instead of the hold fails fix-order only', () => {
    const f = fly({ startId: 'direct-obozu-northwest' });
    setUp(f, 'obozu');
    // Arriving 40° off the inbound course looks like a straight-in, but OBOZU is not NoPT: the
    // hold-in-lieu is required. At OBOZU the pilot cuts the direct entry short, straight in.
    expect(f.until(() => f.r.state.gps.hold !== null, 900)).toBe(true);
    f.send({ type: 'gpsDirect', fix: 'LOLME' });
    f.wait(1);
    expect(f.sensors.gps.activeWaypoint).toBe('LOLME');
    expect(f.r.state.gps.hold).toBeNull();
    f.descendOrClimb(5500, -500);
    f.send({ type: 'button', button: 'APR' });
    expect(f.untilMinimums()).toBe(true);
    f.wait(30);
    expect(
      f
        .analyze()
        .items.filter((i) => i.status === 'fail')
        .map((i) => i.id),
    ).toEqual(['fix-order']);
  });

  it('direct OBOZU from the southeast: the GPS flies the hold-in-lieu, then the approach', () => {
    const f = fly({ startId: 'direct-obozu' });
    setUp(f, 'obozu');
    const seen = new Set<string>();
    const a = trackUntil(
      f,
      () => {
        if (f.r.state.gps.hold) seen.add(`${f.r.state.gps.hold.entry}:${f.r.state.gps.hold.seg}`);
        return f.sensors.gps.activeWaypoint === 'LOLME';
      },
      1500,
    );
    expect(a.ok).toBe(true);
    expect([...seen].some((x) => x.endsWith(':inbound'))).toBe(true);
    f.descendOrClimb(5500, -500);
    f.send({ type: 'button', button: 'APR' });
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'landed'), 300)).toBe(true);
    const failed = f
      .analyze()
      .items.filter((i) => i.status === 'fail')
      .map((i) => `${i.id}: ${i.measured}`);
    expect(failed).toEqual([]);
  });

  it('vectors to final: VTF, intercept on a heading in APR, LPV to the DA', () => {
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
    // "Maintain 6000 until established": down only once on the final course.
    expect(f.until(() => onFinal(f), 180)).toBe(true);
    f.descendOrClimb(5500, -500);
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'landed'), 300)).toBe(true);
    const failed = f
      .analyze()
      .items.filter((i) => i.status === 'fail')
      .map((i) => `${i.id}: ${i.measured}`);
    expect(failed).toEqual([]);
  });

  const fails = (f: Flight) =>
    f
      .analyze()
      .items.filter((i) => i.status === 'fail')
      .map((i) => i.id);
  const ids = (f: Flight) => f.analyze().items.map((i) => i.id);

  /** Vectors-to-final, coupled down the GP (as the VTF run above); `hook` runs before the FAF. */
  function vectorsRun(load: string, opts: Partial<ScenarioOptions> = {}) {
    const f = fly({ startId: 'vectors-final', ...opts });
    f.send(
      { type: 'gpsLoad', transition: load },
      { type: 'gpsActivate' },
      { type: 'cdiSet', source: 'GPS' },
      { type: 'button', button: 'AP' },
    );
    f.wait(0.1);
    if (load !== 'VTF') f.send({ type: 'gpsDirect', fix: 'LOLME' });
    f.send({ type: 'button', button: 'HDG' }, { type: 'button', button: 'APR' });
    f.wait(0.5);
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 600)).toBe(true);
    // "Maintain 6000 until established": down only once on the final course.
    expect(f.until(() => onFinal(f), 180)).toBe(true);
    f.descendOrClimb(5500, -500);
    return f;
  }

  it('the perfect runs score the new GPS rules', () => {
    const f = vectorsRun('VTF');
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    f.wait(30);
    expect(ids(f)).toEqual(
      expect.arrayContaining([
        'gps-approach-active',
        'gps-approach-mode',
        'glidepath',
        'final-course',
      ]),
    );
    expect(fails(f)).toEqual([]);
  });

  it('bad run: the approach loaded via the wrong transition fails gps-approach-active only', () => {
    const f = vectorsRun('weyyi');
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    f.wait(30);
    expect(fails(f)).toEqual(['gps-approach-active']);
  });

  it('bad run: the CDI off the GPS at the FAF fails gps-approach-mode only', () => {
    const f = vectorsRun('VTF');
    expect(
      f.until(
        () => (f.sensors.gps.distanceNm ?? 9) < 1.5 && f.sensors.gps.activeWaypoint === 'LOLME',
        900,
      ),
    ).toBe(true);
    // Steer the course on a heading and switch the CDI to NAV1 across the FAF.
    f.send(
      { type: 'syncHeadingBug' },
      { type: 'button', button: 'HDG' },
      { type: 'cdiSet', source: 'NAV1' },
    );
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'RW18', 300)).toBe(true);
    f.send({ type: 'cdiSet', source: 'GPS' }, { type: 'button', button: 'APR' });
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 300)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    f.wait(30);
    expect(fails(f)).toEqual(['gps-approach-mode']);
  });

  it('bad run: below the GPS glidepath inside the FAF fails glidepath only', () => {
    const f = vectorsRun('VTF');
    expect(f.until(() => f.r.state.ap.vertical === 'GS', 900)).toBe(true);
    f.wait(20);
    // Dive below the path, then parallel it down to the DA.
    f.send({ type: 'altPreselect', ft: 3900 }, { type: 'button', button: 'VS' });
    f.wait(0.1);
    f.send({ type: 'vsTarget', fpm: -1000 });
    f.wait(30);
    f.send({ type: 'vsTarget', fpm: -500 });
    expect(f.untilMinimums()).toBe(true);
    f.wait(30);
    expect(fails(f)).toEqual(['glidepath']);
  });

  it('glass: GA at the MDA arms the missed approach on the GPS by itself, no SUSP (100%)', () => {
    const f = fly({
      startId: 'direct-wizge',
      ceiling: 'below',
      waasAvailable: false,
      panel: 'glass',
    });
    setUp(f, 'wizge');
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'LOLME')).toBe(true);
    f.crossFix('OBOZU');
    f.descendOrClimb(5500, -500);
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'RW18')).toBe(true);
    f.crossFix('LOLME');
    f.descendOrClimb(4260, -700);
    expect(f.untilMinimums()).toBe(true);
    f.goAround(6200);
    expect(f.r.state.gps.missedArmed).toBe(true);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'IHIYO', 300)).toBe(true);
    expect(f.r.state.gps.suspended).toBe(false);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'lapComplete'), 3000)).toBe(true);
    const result = f.analyze();
    // GA did the sequencing: the SUSP rule is not scored on glass.
    expect(result.items.some((i) => i.id === 'missed-sequencing')).toBe(false);
    expect(result.items.find((i) => i.id === 'missed-hold')?.status).toBe('pass');
    expect(fails(f)).toEqual([]);
  });

  /** Glass, LNAV to the MDA, GA (arms the GPS missed approach), NAV: up to the IHIYO hold. */
  function missedToIhiyo() {
    const f = fly({
      startId: 'direct-wizge',
      ceiling: 'below',
      waasAvailable: false,
      panel: 'glass',
    });
    setUp(f, 'wizge');
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'LOLME')).toBe(true);
    f.crossFix('OBOZU');
    f.descendOrClimb(5500, -500);
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'RW18')).toBe(true);
    f.crossFix('LOLME');
    f.descendOrClimb(4260, -700);
    expect(f.untilMinimums()).toBe(true);
    f.goAround(6200);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'IHIYO', 300)).toBe(true);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'holdFixCrossed'), 900)).toBe(
      true,
    );
    return f;
  }

  it('bad run: flying on past IHIYO on a heading, never entering the hold, fails missed-hold only', () => {
    const f = missedToIhiyo();
    f.send({ type: 'syncHeadingBug' }, { type: 'button', button: 'HDG' });
    f.wait(300);
    expect(f.progress.phase).toBe('missed');
    expect(fails(f)).toEqual(['missed-hold']);
  });

  it('bad run: ending the flight right after crossing IHIYO fails missed-hold only', () => {
    const f = missedToIhiyo();
    f.wait(20);
    expect(fails(f)).toEqual(['missed-hold']);
  });

  it('steam: GA alone leaves the GPS suspended at the MAP', () => {
    const f = fly({ startId: 'direct-wizge', ceiling: 'below', waasAvailable: false });
    setUp(f, 'wizge');
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'LOLME')).toBe(true);
    f.crossFix('OBOZU');
    f.descendOrClimb(5500, -500);
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'RW18')).toBe(true);
    f.crossFix('LOLME');
    f.descendOrClimb(4260, -700);
    expect(f.untilMinimums()).toBe(true);
    f.goAround(6200);
    expect(f.r.state.gps.missedArmed).toBe(false);
    expect(f.until(() => f.r.state.gps.suspended, 120)).toBe(true);
    f.wait(30);
    expect(f.r.state.gps.suspended).toBe(true);
  });

  it('bad run: SUSP pressed a minute after GA fails missed-sequencing only', () => {
    const f = fly({ startId: 'direct-wizge', ceiling: 'below', waasAvailable: false });
    setUp(f, 'wizge');
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'LOLME')).toBe(true);
    f.crossFix('OBOZU');
    f.descendOrClimb(5500, -500);
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'RW18')).toBe(true);
    f.crossFix('LOLME');
    f.descendOrClimb(4260, -700);
    expect(f.untilMinimums()).toBe(true);
    f.goAround(6200);
    f.wait(60);
    expect(f.sensors.gps.suspended).toBe(true);
    f.send({ type: 'gpsSusp' });
    f.wait(1);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'lapComplete'), 3000)).toBe(true);
    expect(fails(f)).toEqual(['missed-sequencing']);
  });
});
