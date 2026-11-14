/**
 * T27 integration: KLAR VOR/DME 30 direct LAR, outbound R-112 to ECECU, barbed procedure
 * turn, inbound 292° with the DUCBE / HEMBI / GARBE step-downs to the MDA. A perfect run
 * scores 100%; descending to the MDA before GARBE fails only the segment minimum.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../src/procedures';
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
  f.send({ type: 'altPreselect', ft: 11300 });
  f.wait(0.1);
  f.send({ type: 'button', button: 'ALT' });
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
