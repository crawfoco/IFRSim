/**
 * T23 integration: KGXY ILS 35 flown from WAVDI on the GLL 17.5 DME arc (NoPT): a perfect
 * run scores 100%, and descending below the arc altitude fails only the segment minimum.
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
  buildScenario(procedureById('kgxy-ils35')!, NAVDATA, {
    startId: 'wavdi-arc',
    ceiling: 'above',
    gsOutOfService: false,
  });

/** GLL R-136 outbound → 17.5 DME arc clockwise → lead R-170 → I-DCI 350 → ILS to DA. */
function fly(f: Flight, arcAltFt = 7000) {
  f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
  f.send({ type: 'altPreselect', ft: 7000 });
  f.wait(0.1);
  f.send({ type: 'button', button: 'ALT' });
  // Start at 10000: descend and maintain 7000 (the arc altitude) before WAVDI.
  if (f.alt > 7050) f.descendOrClimb(7000, -1000);
  f.tune(1, 114.2, 136); // GLL, outbound on R-136
  f.tune(2, 110.3, 350); // I-DCI, ready for the final
  f.send({ type: 'button', button: 'NAV' });
  f.untilDme('GLL', 17.0, true, 600);
  if (arcAltFt !== 7000) f.descendOrClimb(arcAltFt, -500);
  f.flyArc('GLL', 17.5, 'R', 170); // to the charted lead radial
  f.tune(1, 110.3, 350);
  f.turn(320); // 30° intercept onto the localizer
  f.send({ type: 'button', button: 'APR' });
  f.crossFix('WELDS', 3.0, 600);
  f.descendOrClimb(6600, f.alt > 6600 ? -600 : 500); // glideslope intercept altitude at BUFFS
  expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
}

describe('KGXY ILS 35 from the WAVDI arc', () => {
  it('perfect run scores 100%', () => {
    const f = new Flight(sc());
    fly(f);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.sequencer.legs.map((l) => [a.sequencer.route[l.index]!.label, l.status])).toEqual([
      ['GLL 17.5 DME arc to WELDS', 'flown'],
      ['Track to BUFFS', 'flown'],
      ['Final approach from BUFFS', 'active'],
    ]);
    expect(a.items.map((x) => x.id)).toEqual(
      expect.arrayContaining(['ident:GLL', 'ident:I-DCI', 'final-course', 'glideslope']),
    );
  });

  it('bad run: down to 6500 on the arc (minimum 7000)', () => {
    const f = new Flight(sc());
    fly(f, 6500);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['segment-minimums']);
    expect(a.items.find((x) => x.id === 'segment-minimums')!.measured).toMatch(
      /on "GLL 17.5 DME arc to WELDS" \(minimum 7,000 ft\)/,
    );
  });
});
