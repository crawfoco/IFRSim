/**
 * KSKX VOR/DME-B (circling only): every start flown headlessly.
 * - R-353 (NoPT): straight in over TAS onto the 116° final; circles to land with the airport in
 *   sight, or goes around at ZUTRI and flies the missed approach into the TAS hold.
 * - R-296 (hold-in-lieu, direct entry), direct TAS from the southwest (parallel) and from the
 *   east-northeast (teardrop).
 * Bad runs: continuing past the MAP without the airport in sight, and skipping the hold-in-lieu.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../src/procedures';
import type { Leg } from '../../src/procedures/schema';
import { normalize360, trueToMag } from '../../src/sim/geo/angles';
import { initialBearingTrueDeg } from '../../src/sim/geo/geodesy';
import { buildScenario, type ScenarioOptions } from '../../src/sim/scenario/scenario';
import type { FlightAnalysis } from '../../src/sim/scoring/analyze';
import { alongTrackBeforeFixNm, inboundTrueAtFix } from '../../src/sim/scoring/geometry';
import { correctEntries } from '../../src/sim/scoring/rules/reversal';
import { Flight } from '../sim/scripted';

const failed = (a: FlightAnalysis) => a.items.filter((x) => x.status === 'fail').map((x) => x.id);
const summary = (a: FlightAnalysis) =>
  a.items.map((x) => `${x.status.padEnd(4)} ${x.id}: ${x.measured}`).join('\n');
const measured = (a: FlightAnalysis, id: string) => a.items.find((x) => x.id === id)?.measured;
const measuredStarting = (a: FlightAnalysis, prefix: string) =>
  a.items.find((x) => x.id.startsWith(prefix))?.measured;
const legs = (a: FlightAnalysis) =>
  a.sequencer.legs.map((l) => [a.sequencer.route[l.index]!.label, l.status]);

const TAS = 115.8;

const scenario = (o: Partial<ScenarioOptions> & { startId: string }) =>
  buildScenario(procedureById('kskx-vordme-b')!, NAVDATA, {
    ceiling: 'above',
    gsOutOfService: false,
    ...o,
  });

/** R-116 (VOR declination 13°E) flown on a heading of about 120 (local variation 9°E). */
const FINAL_HDG = 120;
const OUTBOUND_HDG = 300;

/** AP on, HDG on the current heading, ALT hold at `altFt`. */
function engage(f: Flight, hdg: number, altFt: number) {
  f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
  f.send({ type: 'headingBug', deg: hdg }, { type: 'altPreselect', ft: altFt });
  f.wait(0.1);
  f.send({ type: 'button', button: 'ALT' });
}

/** "Descend and maintain": VS down to the altitude (guarded: VS at the target never captures). */
function descendTo(f: Flight, ft: number, fpm = -1000) {
  if (f.alt > ft + 50) f.descendOrClimb(ft, fpm);
}

const bearingMag = (f: Flight, fix: string) =>
  Math.round(
    normalize360(
      trueToMag(
        initialBearingTrueDeg(f.r.state.aircraft.position, f.sc.fixes[fix]!),
        f.sc.world.magVarEastDeg,
      ),
    ),
  );

/** Direct to a fix in HDG mode, the bug kept on the bearing (refreshed every 2 s), then over it. */
function flyDirect(f: Flight, fix: string, maxS = 900) {
  f.turn(bearingMag(f, fix));
  for (let t = 0; t < maxS && f.distTo(fix) > 2; t += 2) {
    f.send({ type: 'headingBug', deg: bearingMag(f, fix) });
    f.wait(2);
  }
  f.crossFix(fix, 1.0, 120);
}

type HoldLeg = Extract<Leg, { type: 'hold' }>;

/** The entries the start's arrival (straight from the start to TAS) calls for. */
function entryFor(startId: string) {
  const sc = scenario({ startId });
  const hold = sc.procedure.transitions
    .flatMap((t) => t.legs)
    .find((l): l is HoldLeg => l.type === 'hold')!;
  const arrival = initialBearingTrueDeg(sc.initial.aircraft.position, sc.fixes.TAS!);
  return correctEntries(arrival, inboundTrueAtFix(hold.course, sc.fixes.TAS!, NAVDATA), hold.turn);
}

const dev = (f: Flight) => Math.abs(f.sensors.nav1.indication?.deviationDeg ?? 10);

/**
 * Over TAS outbound on R-116 (NAV, OBS 116): down to 10000 for RESOY, then to the circling
 * MDA 8000. Ends at ZUTRI (or `goAround` just before it).
 */
function finalFromTas(f: Flight, opts: { goAround?: boolean } = {}) {
  descendTo(f, 10000, -1000);
  expect(f.until(() => f.r.state.ap.lateral === 'NAV' && dev(f) < 2, 600)).toBe(true);
  expect(f.until(() => f.alt < 10050, 600)).toBe(true); // ALT captures 10000
  f.crossFix('RESOY', 1.0, 900);
  f.descendOrClimb(8000, -1000); // the circling MDA
  if (opts.goAround) {
    expect(f.untilMinimums(900)).toBe(true);
    expect(f.until(() => f.distTo('ZUTRI') < 0.3, 600)).toBe(true);
    return;
  }
  expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
}

/**
 * The TAS hold (inbound 116, right turns) after an entry that ends heading roughly inbound:
 * NAV on OBS 116 captures the inbound course.
 */
function interceptInbound(f: Flight, ...bugs: number[]) {
  f.send({ type: 'course', radio: 1, deg: 116 });
  f.turn(...bugs);
  f.send({ type: 'button', button: 'NAV' });
}

describe('KSKX VOR/DME-B start geometry', () => {
  it('the hold-in-lieu starts call for direct, parallel and teardrop entries', () => {
    expect(entryFor('r296')).toEqual(['direct']);
    expect(entryFor('direct-tas-southwest')).toEqual(['parallel']);
    expect(entryFor('direct-tas-east')).toEqual(['teardrop']);
  });
});

describe('KSKX VOR/DME-B from the TAS R-353 (NoPT)', () => {
  function flyIn(f: Flight) {
    engage(f, 177, 15000);
    descendTo(f, 13000); // descend and maintain 13000 (MSA 12700 west of TAS)
    f.tune(1, TAS, 173);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.r.state.ap.lateral === 'NAV', 300)).toBe(true);
    f.crossFix('TAS', 1.0, 900);
    // Straight in: left onto R-116 outbound.
    f.send({ type: 'course', radio: 1, deg: 116 });
    f.turn(FINAL_HDG);
    f.send({ type: 'button', button: 'NAV' });
  }

  it('perfect run, ceiling above: circles to land on runway 13', () => {
    const f = new Flight(scenario({ startId: 'r353' }));
    flyIn(f);
    finalFromTas(f);
    expect(f.progress.outcome).toBe('landed');
    expect(f.progress.callout).toMatch(/^Airport in sight: circling to land on runway 13\./);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(a.items.map((x) => x.id)).toEqual(
      expect.arrayContaining(['ident:TAS', 'fix-order', 'final-course', 'decision']),
    );
    expect(measured(a, 'decision')).toMatch(/^Airport in sight: circling to land on runway 13/);
    expect(legs(a)).toEqual([
      ['Track to TAS', 'flown'],
      ['Track to RESOY', 'flown'],
      ['Final approach from RESOY', 'active'],
    ]);
  });

  it('perfect run, ceiling below: GA at ZUTRI, missed approach to TAS, parallel, one circuit', () => {
    const f = new Flight(scenario({ startId: 'r353', ceiling: 'below' }));
    flyIn(f);
    finalFromTas(f, { goAround: true });
    f.goAround(12000);
    expect(f.progress.phase).toBe('missed');
    // Climbing right turn to 12000 direct TAS.
    f.send({ type: 'button', button: 'HDG' }, { type: 'headingBug', deg: FINAL_HDG });
    f.turn(210);
    flyDirect(f, 'TAS');
    expect(f.progress.holdArrivalTick).not.toBeNull();

    // Arriving on ~306 (just past the teardrop/parallel boundary): parallel, outbound on the
    // non-holding side, then left round to intercept the inbound course from the holding side.
    const tas = f.sc.fixes.TAS!;
    const inboundTrue = inboundTrueAtFix(f.sc.missedHold.course, tas, NAVDATA);
    f.turn(OUTBOUND_HDG);
    f.wait(60);
    interceptInbound(f, 210, 120, 80);
    expect(f.until(() => f.progress.inboundCrossings === 1, 600)).toBe(true);
    if (f.r.state.ap.lateralArmed === 'NAV') f.send({ type: 'button', button: 'NAV' });
    // Racetrack: right turn outbound, 1 minute from abeam the fix, right turn inbound.
    f.turn(210, OUTBOUND_HDG);
    expect(
      f.until(() => alongTrackBeforeFixNm(tas, inboundTrue, f.r.state.aircraft.position) >= 0),
    ).toBe(true);
    f.wait(60);
    interceptInbound(f, 30, 90);
    expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
    expect(f.progress.outcome).toBe('missedComplete');

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(measured(a, 'decision')).toMatch(/^Go-around \(GA\) at (79|80)\d\d ft$/);
    expect(measured(a, 'missed-approach')).toBe(f.sc.procedure.missedText);
    expect(measuredStarting(a, 'hold-entry:TAS:'), summary(a)).toMatch(/^Flew parallel/);
  });

  it('bad run: past ZUTRI at the MDA without the airport in sight', () => {
    const f = new Flight(scenario({ startId: 'r353', ceiling: 'below' }));
    flyIn(f);
    finalFromTas(f);
    expect(f.progress.outcome).toBe('belowMinimums');
    expect(f.progress.callout).toMatch(/without the airport in sight/);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['decision']);
  });
});

describe('KSKX VOR/DME-B from the TAS R-296 (hold-in-lieu, direct entry)', () => {
  function flyToTas(f: Flight) {
    engage(f, FINAL_HDG, 15000);
    descendTo(f, 13000);
    f.tune(1, TAS, 116);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.r.state.ap.lateral === 'NAV', 300)).toBe(true);
    f.crossFix('TAS', 1.0, 900);
  }

  it('perfect run: direct entry, one minute outbound, final, circles to land', () => {
    const f = new Flight(scenario({ startId: 'r296' }));
    flyToTas(f);
    // Direct entry: right round to the outbound heading, down to the hold altitude 12000.
    f.turn(210, OUTBOUND_HDG);
    descendTo(f, 12000, -700);
    f.wait(60);
    interceptInbound(f, 30, 90);
    f.crossFix('TAS', 1.0, 600);
    finalFromTas(f);
    expect(f.progress.outcome).toBe('landed');

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(measuredStarting(a, 'hold-entry:TAS'), summary(a)).toMatch(/^Flew direct/);
    expect(legs(a)).toEqual([
      ['Track to TAS', 'flown'],
      ['Hold at TAS', 'flown'],
      ['Track to RESOY', 'flown'],
      ['Final approach from RESOY', 'active'],
    ]);
  });

  it('bad run: straight on over TAS without the hold-in-lieu', () => {
    const f = new Flight(scenario({ startId: 'r296' }));
    flyToTas(f);
    finalFromTas(f);
    expect(f.progress.outcome).toBe('landed');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['fix-order']);
    expect(measured(a, 'fix-order')).toMatch(/Skipped: Hold at TAS/);
  });
});

describe('KSKX VOR/DME-B direct TAS (offset starts)', () => {
  function setUp(f: Flight, assignedFt: number) {
    engage(f, f.sc.start.headingMag, f.sc.start.altitudeFt);
    descendTo(f, assignedFt);
    f.tune(1, TAS);
  }

  it('perfect run from the southwest: parallel entry, final, circles to land', () => {
    const f = new Flight(scenario({ startId: 'direct-tas-southwest' }));
    setUp(f, 13000);
    flyDirect(f, 'TAS');
    // Parallel: left to the outbound heading on the non-holding side, a minute, then left round
    // past the inbound course to intercept it from the holding side.
    f.turn(OUTBOUND_HDG);
    descendTo(f, 12000, -700);
    f.wait(60);
    interceptInbound(f, 210, 120, 80);
    f.crossFix('TAS', 1.0, 600);
    finalFromTas(f);
    expect(f.progress.outcome).toBe('landed');

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(measuredStarting(a, 'hold-entry:TAS'), summary(a)).toMatch(/^Flew parallel/);
    expect(legs(a)).toEqual([
      ['Hold at TAS', 'flown'],
      ['Track to RESOY', 'flown'],
      ['Final approach from RESOY', 'active'],
    ]);
  });

  it('perfect run from the east-northeast: teardrop entry, final, circles to land', () => {
    const f = new Flight(scenario({ startId: 'direct-tas-east' }));
    setUp(f, 15000); // MSA 14400 east of TAS
    flyDirect(f, 'TAS');
    // Teardrop: 30° off the outbound heading toward the holding (southwest) side.
    f.turn(OUTBOUND_HDG - 30);
    descendTo(f, 12000, -1000);
    f.wait(60);
    interceptInbound(f, 0, 90);
    f.crossFix('TAS', 1.0, 600);
    finalFromTas(f);
    expect(f.progress.outcome).toBe('landed');

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(measuredStarting(a, 'hold-entry:TAS'), summary(a)).toMatch(/^Flew teardrop/);
  });
});
