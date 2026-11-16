/**
 * KCEZ VOR RWY 21 (AL-112 Amdt 5C): every start flown headlessly. CEZ VOR/DME is the IAF and
 * the FAF; the course reversal is a barbed procedure turn on R-350 (outbound 350, barb 305,
 * inbound 125 then 170, within 10 NM, 9800, then 8000 at CEZ); final R-196 FROM CEZ to the MAP
 * at 5.5 DME (MDA 6660); missed: climbing right turn to 9800 direct CEZ and hold (170 inbound,
 * right turns). Perfect runs score 100%; the bad runs fail exactly the expected rules.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../src/procedures';
import { buildScenario } from '../../src/sim/scenario/scenario';
import type { FlightAnalysis } from '../../src/sim/scoring/analyze';
import { Flight } from '../sim/scripted';

const failed = (a: FlightAnalysis) => a.items.filter((x) => x.status === 'fail').map((x) => x.id);
const summary = (a: FlightAnalysis) =>
  a.items.map((x) => `${x.status.padEnd(4)} ${x.id}: ${x.measured}`).join('\n');
const item = (a: FlightAnalysis, prefix: string) => a.items.find((x) => x.id.startsWith(prefix));

const CEZ = 114.35;
const MDA_TARGET = 6640; // a little under the 6660 MDA, as the pilot levels at it

const scenario = (startId: string, ceiling: 'above' | 'below' = 'above') =>
  buildScenario(procedureById('kcez-vor21')!, NAVDATA, {
    startId,
    ceiling,
    gsOutOfService: false,
  });

/** AP on in HDG, holding the present altitude. */
function engage(f: Flight, hdg: number) {
  f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
  f.send({ type: 'headingBug', deg: hdg }, { type: 'altPreselect', ft: Math.round(f.alt) });
  f.wait(0.1);
  f.send({ type: 'button', button: 'ALT' });
}

const dev = (f: Flight) => Math.abs(f.sensors.nav1.indication?.deviationDeg ?? 10);

/** NAV1 on CEZ, CRS to the station, NAV: direct CEZ. */
function directCez(f: Flight) {
  const toCez = () => Math.round((f.radialFrom('CEZ').radial + 180) % 360);
  f.tune(1, CEZ);
  f.turn(toCez());
  f.send({ type: 'course', radio: 1, deg: toCez() }, { type: 'button', button: 'NAV' });
}

/**
 * The procedure turn after crossing CEZ outbound-bound, already turned (or turning) onto
 * R-350: NAV on R-350, a minute out, the 305 barb a minute, right turn back through 035 to
 * 125, then the 170 inbound course; established, down to 8000 to CEZ.
 */
function procedureTurn(f: Flight, barb = 305, back = [35, 125], inbound = 170) {
  f.send({ type: 'course', radio: 1, deg: 350 }, { type: 'button', button: 'NAV' });
  expect(f.until(() => f.r.state.ap.lateral === 'NAV' && dev(f) < 1, 300)).toBe(true);
  f.wait(60);
  f.turn(barb);
  f.wait(60);
  f.turn(...back);
  f.send({ type: 'course', radio: 1, deg: inbound }, { type: 'button', button: 'NAV' });
  expect(f.until(() => f.r.state.ap.lateral === 'NAV' && dev(f) < 1, 300)).toBe(true);
  f.descendOrClimb(8000, -1000); // established inbound: down to 8000 to CEZ
}

/**
 * Over CEZ (the FAF): a 26° turn onto R-196 FROM at station passage (started just before the
 * station, as a pilot leads it), NAV, down to the MDA.
 */
function final(f: Flight, toEnd = true, mdaTargetFt = MDA_TARGET) {
  // Level first (pressing VS again while still in VS would switch to PIT).
  expect(f.until(() => f.r.state.ap.vertical !== 'VS', 600)).toBe(true);
  expect(f.until(() => f.distTo('CEZ') < 0.15, 900)).toBe(true);
  f.send({ type: 'course', radio: 1, deg: 196 }, { type: 'button', button: 'HDG' });
  f.send({ type: 'headingBug', deg: 198 });
  f.crossFix('CEZ', 1.0, 300);
  f.wait(10);
  f.send({ type: 'button', button: 'NAV' });
  f.descendOrClimb(mdaTargetFt, -700);
  if (toEnd) expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
}

describe('KCEZ VOR 21: radar vectors to the CEZ R-350 inbound', () => {
  function intercept(f: Flight) {
    engage(f, 140);
    f.tune(1, CEZ, 170);
    f.send({ type: 'button', button: 'NAV' }); // arms: captures 170 inbound from heading 140
    expect(f.until(() => f.r.state.ap.lateral === 'NAV' && dev(f) < 1, 900)).toBe(true);
  }

  it('joins 170 inbound at 8000, crosses CEZ, MDA, lands: 100%', () => {
    const f = new Flight(scenario('vectors-final'));
    intercept(f);
    final(f);
    expect(f.progress.outcome).toBe('landed');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(item(a, 'final-course')).toMatchObject({ status: 'pass' });
    expect(item(a, 'assigned-altitude')).toMatchObject({ status: 'pass' });
  });

  it('bad run: leaves 8000 for the MDA before CEZ (assigned altitude and the FAF altitude)', () => {
    const f = new Flight(scenario('vectors-final'));
    intercept(f);
    f.descendOrClimb(7000, -700); // early descent on the intermediate course
    final(f);
    const a = f.analyze();
    // Below the assigned 8000 before CEZ, below the 8000 FAF minimum, and down at the MDA
    // too far out to see the runway (1 SM): below the MDA without it in sight.
    expect(failed(a), summary(a)).toEqual(['assigned-altitude', 'segment-minimums', 'decision']);
    expect(item(a, 'assigned-altitude')!.measured).toMatch(/before reaching CEZ/);
  });
});

describe('KCEZ VOR 21: direct CEZ starts with the procedure turn', () => {
  it('from the south-southeast: over CEZ straight onto R-350, PT, lands: 100%', () => {
    const f = new Flight(scenario('direct-cez-south'));
    engage(f, 20);
    directCez(f);
    f.descendOrClimb(10000, -1000); // the assigned altitude, from 12000
    f.crossFix('CEZ', 1.0, 900);
    f.descendOrClimb(9800, -500); // over the IAF: the PT altitude
    procedureTurn(f);
    final(f);
    expect(f.progress.outcome).toBe('landed');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(item(a, 'procedure-turn:CEZ'), summary(a)).toMatchObject({ status: 'pass' });
    expect(item(a, 'procedure-turn:CEZ')!.measured).toMatch(/^Left side/);
  });

  it('from the west: right turn over CEZ onto R-350, PT, lands: 100%', () => {
    const f = new Flight(scenario('direct-cez-west'));
    engage(f, 60);
    directCez(f);
    f.descendOrClimb(11000, -1000); // the assigned altitude, from 13000
    f.crossFix('CEZ', 1.0, 900);
    f.descendOrClimb(9800, -700);
    // Arrived heading ~090: left turn round to intercept R-350 outbound from the east at 30°.
    f.send({ type: 'course', radio: 1, deg: 350 });
    f.turn(320);
    procedureTurn(f);
    final(f);
    expect(f.progress.outcome).toBe('landed');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(item(a, 'procedure-turn:CEZ'), summary(a)).toMatchObject({ status: 'pass' });
  });

  /** From the north, arriving nearly on the 170 inbound course: the PT is still required. */
  function northArrival(f: Flight) {
    engage(f, 230);
    directCez(f);
    f.descendOrClimb(11000, -1000); // the assigned altitude, from 13000
    f.crossFix('CEZ', 1.0, 900);
    f.descendOrClimb(9800, -700);
    // Over CEZ heading ~190: right turn (toward the PT side, west) round to R-350 outbound,
    // ending west of it; intercept it from the west at 30°.
    f.send({ type: 'course', radio: 1, deg: 350 });
    f.turn(280, 20);
  }

  it('from the north, ceiling below: PT, MDA, missed approach to the CEZ hold: 100%', () => {
    const f = new Flight(scenario('direct-cez-north', 'below'));
    northArrival(f);
    procedureTurn(f);
    // Preselect 6700: the autopilot settles some 40 ft under it, at the 6660 MDA.
    final(f, false, 6700);
    // Level at the MDA to the MAP (CEZ 5.5 DME), then GA: climbing right turn direct CEZ.
    expect(f.until(() => f.distTo('CEZ 5.5') < 0.2, 900)).toBe(true);
    f.goAround(9800);
    f.turn(290, 20);
    const radial = f.sensors.nav1.indication as { radialMagDeg: number };
    f.send({ type: 'course', radio: 1, deg: Math.round((radial.radialMagDeg + 180) % 360) });
    f.send({ type: 'button', button: 'NAV' });
    f.crossFix('CEZ', 1.0, 900);
    // Hold at CEZ, inbound 170, right turns, arriving heading ~015 (on the non-holding side
    // of the outbound course): parallel entry, a minute out on 350, then left round to 130
    // to rejoin 170 inbound from the holding side.
    f.turn(350);
    f.wait(60);
    f.turn(260, 170, 130);
    f.send({ type: 'course', radio: 1, deg: 170 }, { type: 'button', button: 'NAV' });
    f.crossFix('CEZ', 1.0, 600);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(item(a, 'missed-approach')).toMatchObject({ status: 'pass' });
    expect(item(a, 'procedure-turn:CEZ')).toMatchObject({ status: 'pass' });
    expect(item(a, 'hold-entry:CEZ')!.measured).toMatch(/^Flew parallel/);
  });

  it('bad run from the north: straight in over CEZ without the procedure turn', () => {
    const f = new Flight(scenario('direct-cez-north'));
    engage(f, 230);
    directCez(f);
    f.descendOrClimb(11000, -1000);
    expect(f.until(() => f.distTo('CEZ') < 6, 900)).toBe(true);
    f.descendOrClimb(8000, -1000); // planning a straight-in: down to the FAF altitude
    f.crossFix('CEZ', 1.0, 900);
    f.send({ type: 'course', radio: 1, deg: 196 });
    f.turn(196);
    f.send({ type: 'button', button: 'NAV' });
    f.descendOrClimb(MDA_TARGET, -800);
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
    const a = f.analyze();
    // The PT skipped; down to 8000 before CEZ is also below the assigned 11000.
    expect(failed(a), summary(a)).toEqual(['fix-order', 'assigned-altitude']);
    expect(item(a, 'fix-order')!.measured).toMatch(/Skipped: Procedure turn at CEZ/);
  });

  it('bad run from the south: PT flown on the wrong (east) side', () => {
    const f = new Flight(scenario('direct-cez-south'));
    engage(f, 20);
    directCez(f);
    f.descendOrClimb(10000, -1000);
    f.crossFix('CEZ', 1.0, 900);
    f.descendOrClimb(9800, -500);
    procedureTurn(f, 35, [305, 215]); // right to 035, then left turn through west to 215
    final(f);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['procedure-turn:CEZ:0']);
    expect(item(a, 'procedure-turn:CEZ:0')!.measured).toMatch(/wrong side/);
  });
});
