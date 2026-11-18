/**
 * T27 integration: KLAR VOR/DME 30 direct LAR, outbound R-112 to ECECU, barbed procedure
 * turn, inbound 292° with the DUCBE / HEMBI / GARBE step-downs to the MDA. A perfect run
 * scores 100%; descending to the MDA before GARBE fails only the segment minimum.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../src/procedures';
import { normalize360, signedAngleDiff } from '../../src/sim/geo/angles';
import { buildScenario } from '../../src/sim/scenario/scenario';
import type { FlightAnalysis } from '../../src/sim/scoring/analyze';
import { Flight } from '../sim/scripted';

const failed = (a: FlightAnalysis) => a.items.filter((x) => x.status === 'fail').map((x) => x.id);
const summary = (a: FlightAnalysis) =>
  a.items.map((x) => `${x.status.padEnd(4)} ${x.id}: ${x.measured}`).join('\n');

const sc = () =>
  buildScenario(procedureById('klar-vor30')!, NAVDATA, {
    startId: 'direct-lar',
    ceiling: 'above',
    gsOutOfService: false,
  });

function fly(f: Flight, diveAfterHembi: boolean) {
  f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
  f.descendOrClimb(11300, -800); // cleared: descend and maintain 11300
  f.tune(1, 117.6, 200); // LAR, inbound on R-020
  f.send({ type: 'button', button: 'NAV' });
  f.crossFix('LAR', 1.0, 900);
  // Outbound on R-112 to ECECU at 11300.
  f.send({ type: 'course', radio: 1, deg: 112 });
  f.turn(100); // a 12° cut onto R-112
  f.send({ type: 'button', button: 'NAV' });
  expect(f.until(() => f.r.state.ap.lateral === 'NAV', 600)).toBe(true);
  f.crossFix('ECECU', 1.0, 1200);
  // Procedure turn: a minute outbound, left to 067 for a minute, right turn to 247.
  f.descendOrClimb(10600, -500);
  f.wait(60);
  f.turn(67);
  f.wait(60);
  f.turn(157, 247);
  f.send({ type: 'course', radio: 1, deg: 292 }, { type: 'button', button: 'NAV' });
  const dev = () => Math.abs(f.sensors.nav1.indication?.deviationDeg ?? 10);
  expect(f.until(() => f.r.state.ap.lateral === 'NAV' && dev() < 1, 600)).toBe(true);
  f.crossFix('ECECU', 1.0, 600);
  f.descendOrClimb(10200, -600); // to DUCBE
  f.crossFix('DUCBE', 1.0, 600);
  f.descendOrClimb(9900, -600); // to HEMBI (FAF)
  f.crossFix('HEMBI', 1.0, 600);
  if (diveAfterHembi) {
    f.descendOrClimb(7600, -1000); // straight to the MDA, ignoring GARBE
  } else {
    f.descendOrClimb(8300, -800); // to GARBE (8220)
    f.crossFix('GARBE', 1.0, 600);
    f.descendOrClimb(7600, -700); // the MDA
  }
  expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
}

describe('KLAR VOR/DME 30 with the ECECU procedure turn', () => {
  it('perfect run scores 100%', () => {
    const f = new Flight(sc());
    fly(f, false);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(
      a.items.map((x) => x.id),
      summary(a),
    ).toEqual(
      expect.arrayContaining(['ident:LAR', 'fix-order', 'procedure-turn:ECECU:1', 'final-course']),
    );
    expect(a.items.find((x) => x.id === 'fix-order')!.measured).toBe('ECECU → DUCBE → HEMBI');
  });

  it('bad run: below the GARBE step-down (8220) before reaching it', () => {
    const f = new Flight(sc());
    fly(f, true);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['segment-minimums']);
    expect(a.items.find((x) => x.id === 'segment-minimums')!.measured).toMatch(/minimum 8,220 ft/);
  });
});

/**
 * Offset start: east of LAR on a vector heading of 200, cleared direct LAR. The learner turns
 * toward the VOR, crosses it, makes a left turn of some 135° onto R-112 outbound, and flies
 * the procedure turn at ECECU: the route from LAR is not NoPT, so arriving from the east does
 * not make it a straight-in.
 */
const east = () =>
  buildScenario(procedureById('klar-vor30')!, NAVDATA, {
    startId: 'direct-lar-east',
    ceiling: 'above',
    gsOutOfService: false,
  });

/** Inbound 292° from ECECU: DUCBE, HEMBI (FAF), GARBE, the MDA and the landing. */
function finalFromEcecu(f: Flight) {
  if (f.radialFrom('LAR').dist > 18) f.crossFix('ECECU', 1.5, 900);
  f.descendOrClimb(10200, -600); // to DUCBE
  f.crossFix('DUCBE', 1.0, 600);
  f.descendOrClimb(9900, -600); // to HEMBI (FAF)
  f.crossFix('HEMBI', 1.0, 600);
  f.descendOrClimb(8300, -800); // to GARBE (8220)
  f.crossFix('GARBE', 1.0, 600);
  f.descendOrClimb(7600, -700); // the MDA
  expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
}

describe('KLAR VOR/DME 30 direct LAR from the east (offset start)', () => {
  it('starts off the direct course to LAR', () => {
    const f = new Flight(east());
    const toLar = normalize360(f.radialFrom('LAR').radial + 180);
    expect(Math.abs(signedAngleDiff(f.hdgMag, toLar))).toBeGreaterThanOrEqual(30);
    expect(f.radialFrom('LAR').dist).toBeGreaterThan(12);
  });

  it('perfect run: turn to LAR, R-112 outbound, procedure turn at ECECU, scores 100%', () => {
    const f = new Flight(east());
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.descendOrClimb(11300, -800); // cleared: descend and maintain 11300
    f.tune(1, 117.6);
    const toLar = Math.round(normalize360(f.radialFrom('LAR').radial + 180));
    f.turn(toLar); // right, toward the VOR
    f.send({ type: 'course', radio: 1, deg: toLar }, { type: 'button', button: 'NAV' });
    f.crossFix('LAR', 1.0, 900);
    // Left turn back to the southeast, a 30° cut onto R-112 outbound at 11300.
    f.turn(180, 82);
    f.send({ type: 'course', radio: 1, deg: 112 }, { type: 'button', button: 'NAV' });
    expect(f.until(() => f.r.state.ap.lateral === 'NAV', 600)).toBe(true);
    f.crossFix('ECECU', 1.0, 1200);
    // Procedure turn: a minute outbound, left to 067 for a minute, right turn to 247.
    f.descendOrClimb(10600, -500);
    f.wait(60);
    f.turn(67);
    f.wait(60);
    f.turn(157, 247);
    f.send({ type: 'course', radio: 1, deg: 292 }, { type: 'button', button: 'NAV' });
    const dev = () => Math.abs(f.sensors.nav1.indication?.deviationDeg ?? 10);
    expect(f.until(() => f.r.state.ap.lateral === 'NAV' && dev() < 1, 600)).toBe(true);
    finalFromEcecu(f);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(
      a.items.map((x) => x.id),
      summary(a),
    ).toEqual(expect.arrayContaining(['ident:LAR', 'procedure-turn:ECECU:1', 'final-course']));
    expect(a.items.find((x) => x.id === 'fix-order')!.measured).toBe('ECECU → DUCBE → HEMBI');
    expect(a.items.find((x) => x.id.startsWith('procedure-turn'))!.measured).toMatch(/^Left side/);
  });

  it('bad run: cutting across to join 292° inbound and skipping the procedure turn', () => {
    const f = new Flight(east());
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.descendOrClimb(11300, -800); // cleared: descend and maintain 11300
    f.tune(1, 117.6, 292);
    // Head east, outside ECECU, then south onto R-112 and turn right to join 292° inbound.
    f.turn(110);
    expect(f.until(() => f.radialFrom('LAR').dist > 23, 900)).toBe(true);
    f.turn(200);
    expect(f.until(() => f.radialFrom('LAR').radial > 108, 900)).toBe(true);
    f.turn(262); // a 30° intercept, some 3 NM outside ECECU
    f.send({ type: 'button', button: 'NAV' });
    const dev = () => Math.abs(f.sensors.nav1.indication?.deviationDeg ?? 10);
    expect(f.until(() => f.r.state.ap.lateral === 'NAV' && dev() < 1, 900)).toBe(true);
    // 11300 to ECECU, then 10600 straight in and on down the step-downs.
    f.crossFix('ECECU', 1.0, 900);
    f.descendOrClimb(10600, -500);
    f.untilDme('LAR', 15.5, false, 600);
    finalFromEcecu(f);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['fix-order']);
    expect(a.items.find((x) => x.id === 'fix-order')!.measured).toMatch(
      /Skipped: Procedure turn at ECECU/,
    );
  });
});
