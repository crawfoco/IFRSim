/**
 * Scripted perfect runs for start conditions with no other integration test:
 * KCFO ILS 26 `join-feeder`, KGXY ILS 35 `over-gll` and `vectors-final` (landing, and a
 * missed approach flown to CEDUK and one full hold circuit), and the offset "direct to the
 * hold-in-lieu fix" starts (KCFO SKIPI north-west / east, KGXY WELDS north-west / south-east):
 * each calls for a particular hold entry, and skipping the hold-in-lieu or flying the wrong
 * entry fails exactly the expected rule.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../src/procedures';
import { buildScenario, type ScenarioOptions } from '../../src/sim/scenario/scenario';
import type { FlightAnalysis } from '../../src/sim/scoring/analyze';
import { alongTrackBeforeFixNm, inboundTrueAtFix } from '../../src/sim/scoring/geometry';
import { correctEntries } from '../../src/sim/scoring/rules/reversal';
import type { Leg } from '../../src/procedures/schema';
import { normalize360, trueToMag } from '../../src/sim/geo/angles';
import { initialBearingTrueDeg } from '../../src/sim/geo/geodesy';
import { Flight } from '../sim/scripted';

const failed = (a: FlightAnalysis) => a.items.filter((x) => x.status === 'fail').map((x) => x.id);
const summary = (a: FlightAnalysis) =>
  a.items.map((x) => `${x.status.padEnd(4)} ${x.id}: ${x.measured}`).join('\n');
const measured = (a: FlightAnalysis, id: string) => a.items.find((x) => x.id === id)?.measured;
const legs = (a: FlightAnalysis) =>
  a.sequencer.legs.map((l) => [a.sequencer.route[l.index]!.label, l.status]);

const scenario = (id: string, o: Partial<ScenarioOptions> & { startId: string }) =>
  buildScenario(procedureById(id)!, NAVDATA, { ceiling: 'above', gsOutOfService: false, ...o });

/** AP on, HDG on the current heading, ALT hold at `altFt`. */
function engage(f: Flight, hdg: number, altFt: number) {
  f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
  f.send({ type: 'headingBug', deg: hdg }, { type: 'altPreselect', ft: altFt });
  f.wait(0.1);
  f.send({ type: 'button', button: 'ALT' });
}

/**
 * "Descend and maintain": VS down to the assigned altitude, where ALT captures it. Guarded,
 * since a VS descent started at the target altitude would not capture.
 */
function descendTo(f: Flight, ft: number, fpm = -1000) {
  if (f.alt > ft + 50) f.descendOrClimb(ft, fpm);
}

/**
 * Cleared direct to a fix from an offset start: turn toward it in HDG mode and keep the bug on
 * the bearing to the fix (refreshed every 2 s, as a pilot correcting with the needle), then fly
 * over it on that heading.
 */
function flyDirect(f: Flight, fix: string, maxS = 900) {
  const mv = f.sc.world.magVarEastDeg;
  const bearingMag = () =>
    Math.round(
      normalize360(
        trueToMag(initialBearingTrueDeg(f.r.state.aircraft.position, f.sc.fixes[fix]!), mv),
      ),
    );
  f.turn(bearingMag());
  for (let t = 0; t < maxS && f.distTo(fix) > 2; t += 2) {
    f.send({ type: 'headingBug', deg: bearingMag() });
    f.wait(2);
  }
  f.crossFix(fix, 1.0, 120);
}

type HoldLeg = Extract<Leg, { type: 'hold' }>;

/** The entries the start's arrival (straight from the start to the fix) calls for. */
function entryFor(procId: string, startId: string, fix: string) {
  const sc = scenario(procId, { startId });
  const hold = sc.procedure.transitions
    .flatMap((t) => t.legs)
    .find((l): l is HoldLeg => l.type === 'hold' && l.fix === fix)!;
  const arrival = initialBearingTrueDeg(sc.initial.aircraft.position, sc.fixes[fix]!);
  return correctEntries(arrival, inboundTrueAtFix(hold.course, sc.fixes[fix]!, NAVDATA), hold.turn);
}

describe('KCFO ILS 26 offset starts direct to SKIPI', () => {
  it('north-west calls for a teardrop, east (near the final course) for a direct entry', () => {
    expect(entryFor('kcfo-ils26', 'direct-skipi-northwest', 'SKIPI')).toEqual(['teardrop']);
    expect(entryFor('kcfo-ils26', 'direct-skipi-east', 'SKIPI')).toEqual(['direct']);
  });

  /**
   * AP on, descending from 10000 to the assigned 8000; NAV2 → I-FTG (DME 7 for SKIPI),
   * localizer preselected on NAV1 standby.
   */
  function setUp(f: Flight) {
    engage(f, f.sc.start.headingMag, f.sc.start.altitudeFt);
    descendTo(f, 8000);
    f.tune(2, 109.3, 263);
    f.send({ type: 'dmeSource', radio: 2 }, { type: 'standby', radio: 1, mhz: 109.3 });
  }

  it('perfect run from the north-west: direct SKIPI, teardrop entry, ILS, landing', () => {
    const f = new Flight(scenario('kcfo-ils26', { startId: 'direct-skipi-northwest' }));
    setUp(f);
    flyDirect(f, 'SKIPI');

    // Hold-in-lieu (inbound 263, left turns, holding side south). Arriving on ~120: teardrop,
    // outbound 30° toward the holding side of 083, then a left turn back to the localizer.
    f.send({ type: 'swap', radio: 1 }, { type: 'course', radio: 1, deg: 263 });
    f.turn(113);
    f.descendOrClimb(7200, -500);
    f.wait(60);
    f.send({ type: 'button', button: 'APR' });
    f.turn(23, 293); // left, all the way round; 30° intercept from the south
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 300)).toBe(true);
    expect(f.until(() => f.progress.phase === 'ended', 1200)).toBe(true);
    expect(f.progress.outcome).toBe('landed');

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(a.items.some((x) => x.id === 'ident:FQF')).toBe(false); // joins at SKIPI
    const entry = a.items.find((x) => x.id.startsWith('hold-entry:SKIPI'));
    expect(entry?.measured, summary(a)).toMatch(/^Flew teardrop; arriving on heading 1[12]\d°/);
    expect(a.items.map((x) => x.id)).toEqual(
      expect.arrayContaining(['ident:I-FTG', 'final-course', 'glideslope', 'decision']),
    );
    expect(legs(a)).toEqual([
      ['Hold at SKIPI', 'flown'],
      ['Final approach from SKIPI', 'active'],
    ]);
  });

  it('perfect run from the east: direct SKIPI, direct entry although nearly straight in', () => {
    const f = new Flight(scenario('kcfo-ils26', { startId: 'direct-skipi-east' }));
    setUp(f);
    flyDirect(f, 'SKIPI');

    // Arriving on ~250, within 15° of the inbound course: still a hold-in-lieu (not NoPT).
    // Direct entry: left (the holding direction) round to the outbound heading.
    f.send({ type: 'swap', radio: 1 }, { type: 'course', radio: 1, deg: 263 });
    f.turn(170, 83);
    f.descendOrClimb(7200, -500);
    f.wait(60);
    f.send({ type: 'button', button: 'APR' });
    f.turn(353);
    f.send({ type: 'headingBug', deg: 263 });
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 120)).toBe(true);
    expect(f.until(() => f.progress.phase === 'ended', 1200)).toBe(true);
    expect(f.progress.outcome).toBe('landed');

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    const entry = a.items.find((x) => x.id.startsWith('hold-entry:SKIPI'));
    expect(entry?.measured, summary(a)).toMatch(/^Flew direct; arriving on heading 2[45]\d°/);
    expect(legs(a)).toEqual([
      ['Hold at SKIPI', 'flown'],
      ['Final approach from SKIPI', 'active'],
    ]);
  });

  it('bad run from the east: straight in over SKIPI without the hold-in-lieu', () => {
    const f = new Flight(
      scenario('kcfo-ils26', { startId: 'direct-skipi-east', gsOutOfService: true }),
    );
    setUp(f);
    f.send({ type: 'swap', radio: 1 }, { type: 'course', radio: 1, deg: 263 });
    f.wait(0.1);
    f.send({ type: 'ident', radio: 1 });
    f.turn(240); // toward SKIPI, joining the localizer outside it
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 600)).toBe(true);
    f.crossFix('SKIPI', 1.0, 900); // straight in: no course reversal
    f.descendOrClimb(5900, -1000); // from 8000 (assigned) down to the MDA before the MAP
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['fix-order']);
    expect(measured(a, 'fix-order')).toMatch(/Skipped: Hold at SKIPI/);
    expect(a.items.map((x) => x.id)).toContain('final-course');
  });
});

describe('KGXY ILS 35 offset starts direct to WELDS', () => {
  it('north-west calls for a teardrop, south-east for a direct entry', () => {
    expect(entryFor('kgxy-ils35', 'direct-welds-northwest', 'WELDS')).toEqual(['teardrop']);
    expect(entryFor('kgxy-ils35', 'direct-welds-southeast', 'WELDS')).toEqual(['direct']);
  });

  /**
   * AP on, descending to the assigned altitude (9000 north-west of WELDS, above the 8100 MSA;
   * 7000 south-east); NAV1 → I-DCI (WELDS is I-DCI 14.5 DME).
   */
  function setUp(f: Flight, assignedFt: number) {
    engage(f, f.sc.start.headingMag, f.sc.start.altitudeFt);
    descendTo(f, assignedFt);
    f.tune(1, 110.3, 350);
  }

  /** WELDS hold-in-lieu (inbound 350, right turns, holding side east), then the ILS. */
  function holdAndLand(f: Flight, entry: 'teardrop' | 'direct' | 'wrong-direct') {
    // Teardrop: 30° off the outbound 170, toward the holding (east) side. Wrong-direct: straight
    // to the outbound heading, which this arrival does not call for. Direct: right (the holding
    // direction) round to the outbound heading.
    if (entry === 'teardrop') f.turn(140);
    else if (entry === 'wrong-direct') f.turn(170);
    else f.turn(80, 170);
    if (f.alt > 7050) f.descendOrClimb(7000, -800); // down to the hold-in-lieu minimum
    f.wait(60);
    f.send({ type: 'button', button: 'APR' });
    f.turn(260, 320); // right, back to the localizer; 30° intercept from the east
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 300)).toBe(true);
    f.crossFix('WELDS', 1.5, 600);
    f.descendOrClimb(6600, -500); // glideslope intercept altitude at BUFFS
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
    expect(f.progress.outcome).toBe('landed');
  }

  it('perfect run from the north-west: down to 9000, direct WELDS, teardrop entry, ILS, landing', () => {
    const f = new Flight(scenario('kgxy-ils35', { startId: 'direct-welds-northwest' }));
    setUp(f, 9000);
    flyDirect(f, 'WELDS');
    holdAndLand(f, 'teardrop');

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(a.items.some((x) => x.id === 'ident:GLL')).toBe(false); // joins at WELDS
    const entry = a.items.find((x) => x.id.startsWith('hold-entry:WELDS'));
    expect(entry?.measured, summary(a)).toMatch(/^Flew teardrop; arriving on heading 1[234]\d°/);
    expect(a.items.map((x) => x.id)).toEqual(
      expect.arrayContaining(['ident:I-DCI', 'final-course', 'glideslope', 'decision']),
    );
    expect(legs(a)).toEqual([
      ['Hold at WELDS', 'flown'],
      ['Track to BUFFS', 'flown'],
      ['Final approach from BUFFS', 'active'],
    ]);
  });

  it('bad run from the north-west: straight outbound where the arrival calls for teardrop', () => {
    const f = new Flight(scenario('kgxy-ils35', { startId: 'direct-welds-northwest' }));
    setUp(f, 9000);
    flyDirect(f, 'WELDS');
    holdAndLand(f, 'wrong-direct');
    const a = f.analyze();
    const entry = a.items.find((x) => x.id.startsWith('hold-entry:WELDS'))!;
    expect(failed(a), summary(a)).toEqual([entry.id]);
  });

  it('perfect run from the south-east: direct WELDS, direct entry, ILS, landing', () => {
    const f = new Flight(scenario('kgxy-ils35', { startId: 'direct-welds-southeast' }));
    setUp(f, 7000);
    flyDirect(f, 'WELDS');
    holdAndLand(f, 'direct');

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    const entry = a.items.find((x) => x.id.startsWith('hold-entry:WELDS'));
    expect(entry?.measured, summary(a)).toMatch(/^Flew direct; arriving on heading (29|30)\d°/);
    expect(legs(a)).toEqual([
      ['Hold at WELDS', 'flown'],
      ['Track to BUFFS', 'flown'],
      ['Final approach from BUFFS', 'active'],
    ]);
  });

  it('bad run from the south-east: turning onto the localizer at WELDS without the hold', () => {
    const f = new Flight(
      scenario('kgxy-ils35', { startId: 'direct-welds-southeast', gsOutOfService: true }),
    );
    setUp(f, 7000);
    flyDirect(f, 'WELDS');
    f.send({ type: 'button', button: 'APR' });
    f.turn(350); // right onto the localizer over WELDS: no course reversal
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 300)).toBe(true);
    f.crossFix('BUFFS', 1.0, 900);
    f.descendOrClimb(5400, -700); // the ARTSS step-down, then the MDA
    f.crossFix('ARTSS', 1.0, 600);
    f.descendOrClimb(5100, -600);
    expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['fix-order']);
    expect(measured(a, 'fix-order')).toMatch(/Skipped: Hold at WELDS/);
  });
});

describe('KCFO ILS 26 from join-feeder', () => {
  it('perfect run: heading 360 to join R-045, SKIPI parallel entry, ILS, landing', () => {
    const f = new Flight(scenario('kcfo-ils26', { startId: 'join-feeder' }));
    engage(f, 360, 10000);
    descendTo(f, 8000); // descend and maintain 8000, the feeder minimum
    // NAV1 → FQF: identify, set R-045 and arm NAV (45° intercept on heading 360).
    f.tune(1, 116.3, 45);
    f.send({ type: 'button', button: 'NAV' });
    // NAV2 → I-FTG for the DME (SKIPI is I-FTG 7 DME); localizer preselected on NAV1 standby.
    f.tune(2, 109.3, 263);
    f.send({ type: 'dmeSource', radio: 2 }, { type: 'standby', radio: 1, mhz: 109.3 });
    expect(f.until(() => f.r.state.ap.lateral === 'NAV', 600)).toBe(true);
    f.crossFix('SKIPI', 1.0, 900);

    // Hold-in-lieu at SKIPI (inbound 263, left turns): arriving on ~045 calls for parallel.
    f.send({ type: 'swap', radio: 1 }, { type: 'course', radio: 1, deg: 263 });
    f.turn(83);
    f.descendOrClimb(7200, -500);
    f.wait(60);
    f.turn(173, 263, 303);
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.progress.phase === 'ended', 1200)).toBe(true);
    expect(f.progress.outcome).toBe('landed');

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(a.items.map((x) => x.id)).toEqual(
      expect.arrayContaining([
        'ident:FQF',
        'ident:I-FTG',
        'fix-order',
        'segment-minimums',
        'hold-entry:SKIPI:1',
        'hold-timing:SKIPI:1',
        'hold-max-altitude:SKIPI:1',
        'final-course',
        'glideslope',
        'decision',
      ]),
    );
    expect(measured(a, 'hold-entry:SKIPI:1')).toMatch(
      /^Flew parallel; arriving on heading 0[34]\d° calls for parallel/,
    );
    expect(measured(a, 'hold-timing:SKIPI:1')).toMatch(/^Outbound leg (0:5\d|1:0\d)$/);
    expect(measured(a, 'decision')).toMatch(/^Runway in sight: landing\./);
    expect(legs(a)).toEqual([
      ['Track to SKIPI', 'flown'],
      ['Hold at SKIPI', 'flown'],
      ['Final approach from SKIPI', 'active'],
    ]);
  });
});

describe('KGXY ILS 35 from over-gll', () => {
  it('perfect run: R-177 feeder, WELDS parallel entry, ILS, landing', () => {
    const f = new Flight(scenario('kgxy-ils35', { startId: 'over-gll' }));
    engage(f, 180, 11000);
    descendTo(f, 9000); // descend and maintain 9000 (MSA 8100 north-west of GLL)
    f.tune(1, 114.2, 177); // GLL, R-177
    f.tune(2, 110.3, 350); // I-DCI: WELDS is I-DCI 14.5 DME
    f.crossFix('GLL', 1.0, 600);
    f.send({ type: 'button', button: 'NAV' });
    f.descendOrClimb(7000, -500); // feeder minimum 7000
    f.crossFix('WELDS', 1.0, 900);

    // Hold-in-lieu at WELDS (inbound 350, right turns): arriving on ~177 calls for parallel.
    f.tune(1, 110.3, 350);
    f.turn(170); // outbound on the non-holding (west) side
    f.wait(60);
    f.turn(80, 350, 310); // left, back toward the holding side; intercept from the east
    f.send({ type: 'button', button: 'APR' });
    f.crossFix('WELDS', 1.5, 600);
    f.descendOrClimb(6600, -500); // glideslope intercept altitude at BUFFS
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
    expect(f.progress.outcome).toBe('landed');

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(legs(a)).toEqual([
      ['Track to WELDS', 'flown'],
      ['Hold at WELDS', 'flown'],
      ['Track to BUFFS', 'flown'],
      ['Final approach from BUFFS', 'active'],
    ]);
    expect(a.items.map((x) => x.id)).toEqual(
      expect.arrayContaining([
        'ident:GLL',
        'ident:I-DCI',
        'segment-minimums',
        'hold-entry:WELDS:1',
        'hold-timing:WELDS:1',
        'final-course',
        'glideslope',
        'decision',
      ]),
    );
    expect(measured(a, 'hold-entry:WELDS:1')).toMatch(
      /^Flew parallel; arriving on heading 1[78]\d° calls for parallel/,
    );
    expect(measured(a, 'decision')).toMatch(/^Runway in sight: landing\./);
  });
});

describe('KGXY ILS 35 from vectors-final', () => {
  /** Heading 320, LOC intercept at 30°, down to 6600 for the glideslope from below. */
  function flyVectors(f: Flight) {
    engage(f, 320, 7000);
    f.tune(1, 110.3, 350);
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 900)).toBe(true);
    f.descendOrClimb(6600, -500);
  }

  it('perfect run: vectors, ILS, landing', () => {
    const f = new Flight(scenario('kgxy-ils35', { startId: 'vectors-final' }));
    flyVectors(f);
    expect(f.until(() => f.progress.phase === 'ended', 1200)).toBe(true);
    expect(f.progress.outcome).toBe('landed');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(a.items.map((x) => x.id)).toEqual(
      expect.arrayContaining(['ident:I-DCI', 'final-course', 'glideslope', 'decision']),
    );
    expect(measured(a, 'decision')).toMatch(/^Runway in sight: landing\. Descended below the DA/);
  });

  it('perfect run: GA at DA, missed approach to CEDUK, teardrop entry, one hold circuit', () => {
    const f = new Flight(scenario('kgxy-ils35', { startId: 'vectors-final', ceiling: 'below' }));
    flyVectors(f);
    expect(f.untilMinimums(1200)).toBe(true);

    // Climb to 5300, then climbing right turn to 7000 on heading 120 to join GLL R-136.
    f.goAround(7000);
    expect(f.progress.phase).toBe('missed');
    f.send({ type: 'button', button: 'HDG' }, { type: 'headingBug', deg: 350 });
    expect(f.until(() => f.alt >= 5300, 120)).toBe(true);
    f.tune(1, 114.2, 136); // GLL, R-136 outbound
    f.turn(60, 120);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.r.state.ap.lateral === 'NAV', 600)).toBe(true);
    expect(f.until(() => f.progress.holdArrivalTick !== null, 900)).toBe(true);

    // CEDUK hold: inbound 316 (to GLL), right turns. GLL's declination is 13°E (1970) vs 8°E
    // local variation, so R-136 tracks on a heading of ~141 (inbound ~321). Arriving on ~141:
    // teardrop, 30° left of the outbound heading.
    const ceduk = f.sc.fixes.CEDUK!;
    const inboundTrue = inboundTrueAtFix(f.sc.missedHold.course, ceduk, NAVDATA);
    const inbound = () => {
      f.send({ type: 'course', radio: 1, deg: 316 });
      f.turn(231, 321);
      // 20° intercept onto the inbound course, from whichever side the turn ended on (radials
      // above 136 are south-west of the course).
      f.turn(f.radialFrom('GLL').radial > 136 ? 341 : 301);
      f.send({ type: 'button', button: 'NAV' });
    };
    f.turn(111);
    f.wait(60);
    inbound();
    expect(f.until(() => f.progress.inboundCrossings === 1, 600)).toBe(true);
    if (f.r.state.ap.lateralArmed === 'NAV') f.send({ type: 'button', button: 'NAV' }); // disarm
    // Racetrack: right turn outbound, 1 minute from abeam the fix, right turn inbound.
    f.turn(51, 141);
    expect(
      f.until(() => alongTrackBeforeFixNm(ceduk, inboundTrue, f.r.state.aircraft.position) >= 0),
    ).toBe(true);
    f.wait(60);
    inbound();
    expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
    expect(f.progress.outcome).toBe('missedComplete');

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(measured(a, 'decision')).toMatch(/^Go-around \(GA\) at 48\d\d ft$/);
    expect(measured(a, 'missed-approach')).toBe(f.sc.procedure.missedText);
    const entry = a.items.find((x) => x.id.startsWith('hold-entry:CEDUK:'));
    expect(entry?.measured, summary(a)).toMatch(/^Flew teardrop; arriving on heading 14\d°/);
    const timing = a.items.find((x) => x.id.startsWith('hold-timing:CEDUK:'));
    // Teardrop outbound leg, then the racetrack outbound leg.
    expect(timing?.measured, summary(a)).toMatch(/^Outbound legs (0:5\d|1:0\d), (0:5\d|1:0\d)$/);
    expect(a.items.map((x) => x.id)).toEqual(
      expect.arrayContaining(['ident:I-DCI', 'ident:GLL', 'final-course', 'glideslope']),
    );
  });
});
