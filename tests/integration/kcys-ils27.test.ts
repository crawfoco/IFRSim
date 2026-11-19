/**
 * KCYS ILS or LOC RWY 27: every start flown headlessly. Over CYS (R-098 feeder, parallel entry
 * at the COLLA hold-in-lieu), direct COLLA from the south-west (teardrop), EGBER (NoPT, heading
 * 220° to the localizer), direct HAMER (NoPT on GLL R-350) and vectors to final (landing, and
 * a missed approach to the CYS hold). Perfect runs score 100%; skipping the hold-in-lieu and
 * leaving the assigned altitude early fail exactly the expected rule.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../src/procedures';
import { buildScenario, type ScenarioOptions } from '../../src/sim/scenario/scenario';
import type { FlightAnalysis } from '../../src/sim/scoring/analyze';
import { alongTrackBeforeFixNm, inboundTrueAtFix } from '../../src/sim/scoring/geometry';
import { correctEntries } from '../../src/sim/scoring/rules/reversal';
import type { Leg } from '../../src/procedures/schema';
import { normalize360, signedAngleDiff, trueToMag } from '../../src/sim/geo/angles';
import { initialBearingTrueDeg } from '../../src/sim/geo/geodesy';
import { Flight } from '../sim/scripted';

const ICYS = 110.1;
const CYS = 113.1;
const GLL = 114.2;

const failed = (a: FlightAnalysis) => a.items.filter((x) => x.status === 'fail').map((x) => x.id);
const summary = (a: FlightAnalysis) =>
  a.items.map((x) => `${x.status.padEnd(4)} ${x.id}: ${x.measured}`).join('\n');
const measured = (a: FlightAnalysis, id: string) => a.items.find((x) => x.id === id)?.measured;
const holdEntry = (a: FlightAnalysis, fix: string) =>
  a.items.find((x) => x.id.startsWith(`hold-entry:${fix}:`))?.measured;
const legs = (a: FlightAnalysis) =>
  a.sequencer.legs.map((l) => [a.sequencer.route[l.index]!.label, l.status]);

const scenario = (o: Partial<ScenarioOptions> & { startId: string }) =>
  buildScenario(procedureById('kcys-ils27')!, NAVDATA, {
    ceiling: 'above',
    gsOutOfService: false,
    ...o,
  });

/** AP on, HDG on `hdg`, ALT hold at `altFt`. */
function engage(f: Flight, hdg: number, altFt: number) {
  f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
  f.send({ type: 'headingBug', deg: hdg }, { type: 'altPreselect', ft: altFt });
  f.wait(0.1);
  f.send({ type: 'button', button: 'ALT' });
}

/** "Descend and maintain": VS down to `ft` (guarded: a VS at the target would not capture). */
function descendTo(f: Flight, ft: number, fpm = -1000) {
  if (f.alt > ft + 50) f.descendOrClimb(ft, fpm);
}

/** Cleared direct: keep the heading bug on the bearing to the fix, then fly over it. */
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

/** On the localizer in APR: glideslope from below at 7800 (HORSE), down to a landing. */
function land(f: Flight) {
  expect(f.until(() => f.r.state.ap.lateral === 'APR', 600)).toBe(true);
  expect(f.until(() => f.progress.phase === 'ended', 1500)).toBe(true);
  expect(f.progress.outcome).toBe('landed');
}

function expectPerfect(a: FlightAnalysis) {
  expect(failed(a), summary(a)).toEqual([]);
  expect(a.scorePct).toBe(100);
  expect(a.items.map((x) => x.id)).toEqual(
    expect.arrayContaining(['ident:I-CYS', 'final-course', 'glideslope', 'decision']),
  );
  expect(measured(a, 'decision')).toMatch(/^Runway in sight: landing\./);
}

type HoldLeg = Extract<Leg, { type: 'hold' }>;

/** The entries the start's arrival (straight from the start to the fix) calls for. */
function entryFor(startId: string, from?: 'CYS') {
  const sc = scenario({ startId });
  const hold = sc.procedure.transitions[0]!.legs[1] as HoldLeg;
  const origin = from ? NAVDATA.navaids[from]!.position : sc.initial.aircraft.position;
  const arrival = initialBearingTrueDeg(origin, sc.fixes.COLLA!);
  return correctEntries(arrival, inboundTrueAtFix(hold.course, sc.fixes.COLLA!, NAVDATA), 'R');
}

describe('KCYS ILS 27: hold entries at COLLA', () => {
  it('the R-098 feeder calls for parallel, direct from the south-west for teardrop', () => {
    expect(entryFor('over-cys', 'CYS')).toEqual(['parallel']);
    expect(entryFor('direct-colla-southwest')).toEqual(['teardrop']);
  });
});

describe('KCYS ILS 27 from over-cys', () => {
  /** Down to 8500 to CYS, then R-098 outbound in NAV to COLLA (NAV2 on I-CYS for its DME). */
  function toColla(f: Flight) {
    engage(f, 180, 10500);
    descendTo(f, 8500);
    f.tune(1, CYS);
    f.tune(2, ICYS, 265);
    f.crossFix('CYS', 1.0, 600);
    f.send({ type: 'course', radio: 1, deg: 98 });
    f.turn(130, 70); // left; south of R-098 after CYS, so a 30° intercept from the south
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.r.state.ap.lateral === 'NAV', 300)).toBe(true);
  }

  it('perfect run: R-098 feeder, parallel entry at COLLA, ILS, landing', () => {
    const f = new Flight(scenario({ startId: 'over-cys' }));
    toColla(f);
    f.crossFix('COLLA', 1.0, 900);
    // Hold-in-lieu (inbound 265, right turns, holding side north). Arriving on ~101: parallel,
    // outbound 085 on the south side, then left round to intercept from the north.
    f.tune(1, ICYS, 265);
    f.turn(85);
    f.descendOrClimb(7800, -500);
    f.wait(60);
    f.turn(355, 265, 225);
    f.send({ type: 'button', button: 'APR' });
    land(f);

    const a = f.analyze();
    expectPerfect(a);
    expect(a.items.map((x) => x.id)).toEqual(
      expect.arrayContaining(['ident:CYS', 'segment-minimums']),
    );
    expect(holdEntry(a, 'COLLA')).toMatch(/^Flew parallel; arriving on heading 1[01]\d°/);
    expect(legs(a)).toEqual([
      ['Track to COLLA', 'flown'],
      ['Hold at COLLA', 'flown'],
      ['Track to HORSE', 'flown'],
      ['Final approach from HORSE', 'active'],
    ]);
  });

  it('bad run: straight in at COLLA without the hold-in-lieu (the feeder is not NoPT)', () => {
    const f = new Flight(scenario({ startId: 'over-cys' }));
    toColla(f);
    f.until(() => f.distTo('COLLA') < 1.5, 900);
    f.tune(1, ICYS, 265);
    // Right round onto the localizer at COLLA (no course reversal), 30° intercept from the
    // side the turn ended on (positive deviation: south of the course); 7800 once inbound.
    f.turn(180);
    const dev = (f.sensors.nav1.indication as { deviationDeg: number }).deviationDeg;
    f.send({ type: 'button', button: 'APR' });
    f.turn(dev > 0 ? 295 : 235);
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 600)).toBe(true);
    f.descendOrClimb(7800, -500);
    land(f);

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['fix-order']);
    expect(measured(a, 'fix-order')).toMatch(/Skipped: Hold at COLLA/);
  });
});

describe('KCYS ILS 27 from direct-colla-southwest', () => {
  it('perfect run: down to 8500, direct COLLA, teardrop entry, ILS, landing', () => {
    const f = new Flight(scenario({ startId: 'direct-colla-southwest' }));
    engage(f, 80, 10500);
    descendTo(f, 8500);
    f.tune(1, ICYS, 265); // COLLA is I-CYS 14.5 DME
    flyDirect(f, 'COLLA');
    // Arriving on ~045: teardrop, 30° off the outbound 085 toward the holding (north) side.
    f.turn(55);
    f.descendOrClimb(7800, -500);
    f.wait(60);
    f.send({ type: 'button', button: 'APR' });
    f.turn(145, 235); // right, back to the localizer; 30° intercept from the north
    land(f);

    const a = f.analyze();
    expectPerfect(a);
    expect(a.items.some((x) => x.id === 'ident:CYS')).toBe(false); // joins at COLLA
    expect(holdEntry(a, 'COLLA')).toMatch(/^Flew teardrop; arriving on heading 0[3-6]\d°/);
    expect(legs(a)).toEqual([
      ['Hold at COLLA', 'flown'],
      ['Track to HORSE', 'flown'],
      ['Final approach from HORSE', 'active'],
    ]);
  });
});

describe('KCYS ILS 27 from egber', () => {
  it('perfect run: direct EGBER, heading 220 to the localizer (NoPT), ILS, landing', () => {
    const f = new Flight(scenario({ startId: 'egber' }));
    engage(f, 235, 9800);
    descendTo(f, 7800); // descend and maintain 7800 (the route altitude) before EGBER
    f.tune(1, CYS); // EGBER is CYS 23.2 DME
    f.tune(2, ICYS, 265); // the localizer, flown from EGBER on
    flyDirect(f, 'EGBER');
    f.turn(220);
    f.tune(1, ICYS, 265);
    f.send({ type: 'button', button: 'APR' });
    land(f);

    const a = f.analyze();
    expectPerfect(a);
    expect(a.items.some((x) => x.id.startsWith('hold-entry'))).toBe(false);
    expect(legs(a)).toEqual([
      ['Heading 220°', 'flown'],
      ['Track to COLLA', 'flown'],
      ['Track to HORSE', 'flown'],
      ['Final approach from HORSE', 'active'],
    ]);
  });
});

describe('KCYS ILS 27 from direct-hamer-south', () => {
  /** Direct HAMER at `holdFt` until there, then GLL R-350 (NoPT) and the localizer at COLLA. */
  function fly(f: Flight, early: boolean) {
    engage(f, 50, 10500);
    descendTo(f, early ? 7800 : 8500);
    f.tune(1, GLL, 350);
    f.tune(2, ICYS, 265);
    flyDirect(f, 'HAMER');
    f.send({ type: 'button', button: 'NAV' });
    descendTo(f, 7800, -500); // NoPT route altitude after HAMER
    expect(f.until(() => f.r.state.ap.lateral === 'NAV', 300)).toBe(true);
    f.until(() => f.distTo('COLLA') < 1.5, 900); // about the lead radial, CYS R-106
    f.tune(1, ICYS, 265);
    f.turn(300); // left onto the localizer (50° intercept)
    f.send({ type: 'button', button: 'APR' });
    land(f);
  }

  it('perfect run: down to 8500, direct HAMER, GLL R-350 NoPT, ILS, landing', () => {
    const f = new Flight(scenario({ startId: 'direct-hamer-south' }));
    fly(f, false);
    const a = f.analyze();
    expectPerfect(a);
    expect(a.items.map((x) => x.id)).toEqual(
      expect.arrayContaining(['ident:GLL', 'assigned-altitude']),
    );
    expect(a.items.some((x) => x.id.startsWith('hold-entry'))).toBe(false);
    expect(legs(a)).toEqual([
      ['Track to COLLA', 'flown'],
      ['Track to HORSE', 'flown'],
      ['Final approach from HORSE', 'active'],
    ]);
  });

  it('bad run: down to 7800 before HAMER (assigned 8500 until HAMER)', () => {
    const f = new Flight(scenario({ startId: 'direct-hamer-south' }));
    fly(f, true);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['assigned-altitude']);
  });
});

describe('KCYS ILS 27 from vectors-final', () => {
  function flyVectors(f: Flight) {
    engage(f, 235, 7800);
    f.tune(1, ICYS, 265);
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 900)).toBe(true);
  }

  it('perfect run: vectors, ILS, landing', () => {
    const f = new Flight(scenario({ startId: 'vectors-final' }));
    flyVectors(f);
    land(f);
    const a = f.analyze();
    expectPerfect(a);
    expect(legs(a)).toEqual([
      ['Track to HORSE', 'flown'],
      ['Final approach from HORSE', 'active'],
    ]);
  });

  it('perfect run: GA at DA, climb to 6800, right turn direct CYS, parallel entry, one circuit', () => {
    const f = new Flight(scenario({ startId: 'vectors-final', ceiling: 'below' }));
    flyVectors(f);
    expect(f.untilMinimums(1500)).toBe(true);

    f.goAround(8000);
    expect(f.progress.phase).toBe('missed');
    f.send({ type: 'button', button: 'HDG' }, { type: 'headingBug', deg: 265 });
    expect(f.until(() => f.alt >= 6800, 180)).toBe(true);
    f.tune(1, CYS, 196);
    f.turn(330); // climbing right turn, then direct CYS (about 003°)
    flyDirect(f, 'CYS');

    // CYS hold: inbound 196 (R-016 inbound), right turns, holding side west. Arriving on
    // ~030 (the turn from the runway heading puts the aircraft west of the direct line):
    // parallel, outbound 016 on the east side, then left round to intercept from the east.
    const cys = NAVDATA.navaids.CYS!.position;
    const inboundTrue = inboundTrueAtFix(f.sc.missedHold.course, cys, NAVDATA);
    // 30° intercept onto the inbound course from whichever side the turn ended on (radials
    // counter-clockwise of 016 are west of it).
    const inbound = () => {
      f.turn(signedAngleDiff(f.radialFrom('CYS').radial, 16) < 0 ? 166 : 226);
      f.send({ type: 'button', button: 'NAV' });
    };
    f.turn(16);
    f.wait(60);
    f.turn(286); // left round toward the holding side
    inbound();
    expect(f.until(() => f.progress.inboundCrossings === 1, 600)).toBe(true);
    if (f.r.state.ap.lateralArmed === 'NAV') f.send({ type: 'button', button: 'NAV' });
    f.turn(286, 16); // racetrack: right turn outbound
    expect(
      f.until(() => alongTrackBeforeFixNm(cys, inboundTrue, f.r.state.aircraft.position) >= 0),
    ).toBe(true);
    f.wait(60);
    f.turn(106, 166); // right round
    inbound();
    expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
    expect(f.progress.outcome).toBe('missedComplete');

    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(measured(a, 'decision')).toMatch(/^Go-around \(GA\) at 63\d\d ft$/);
    expect(measured(a, 'missed-approach')).toBe(f.sc.procedure.missedText);
    const entry = a.items.find((x) => x.id.startsWith('hold-entry:CYS:'));
    expect(entry?.measured, summary(a)).toMatch(/^Flew parallel/);
    expect(a.items.map((x) => x.id)).toEqual(expect.arrayContaining(['ident:CYS']));
  });
});
