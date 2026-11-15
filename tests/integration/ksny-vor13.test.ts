/**
 * T28 integration: KSNY VOR/DME 13 from RIYOP on the SNY 11 DME arc (NoPT), ceiling below
 * minimums: final to the MDA, missed approach (climb to 6200, right turn direct SNY) and
 * the hold. A perfect run scores 100%; turning left on the missed fails only that item.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../src/procedures';
import { normalize360 } from '../../src/sim/geo/angles';
import { buildScenario } from '../../src/sim/scenario/scenario';
import type { FlightAnalysis } from '../../src/sim/scoring/analyze';
import { Flight } from '../sim/scripted';

const failed = (a: FlightAnalysis) => a.items.filter((x) => x.status === 'fail').map((x) => x.id);
const summary = (a: FlightAnalysis) =>
  a.items.map((x) => `${x.status.padEnd(4)} ${x.id}: ${x.measured}`).join('\n');

const sc = () =>
  buildScenario(procedureById('ksny-vor13')!, NAVDATA, {
    startId: 'riyop-arc',
    ceiling: 'below',
    gsOutOfService: false,
  });

function fly(f: Flight, missedTurn: 'L' | 'R') {
  f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
  f.tune(1, 115.9, 258); // SNY, inbound on R-078
  f.send({ type: 'button', button: 'NAV' });
  f.descendOrClimb(6200, -500);
  f.untilDme('SNY', 11.5, false, 600);
  f.flyArc('SNY', 11, 'L', 315); // counter-clockwise through north, lead 5° before R-310
  f.send({ type: 'course', radio: 1, deg: 130 });
  f.turn(160); // 30° intercept onto the 130° inbound course
  f.send({ type: 'button', button: 'NAV' });
  f.crossFix('JUNAD', 3.0, 300);
  f.descendOrClimb(5800, -500); // to CHAKO
  f.crossFix('CHAKO', 1.0, 600);
  f.descendOrClimb(4700, -700); // to the MDA
  // Level at the MDA to the MAP (JIKUT), then GA.
  expect(f.until(() => f.distTo('JIKUT') < 0.2, 600)).toBe(true);
  f.goAround(6200);
  expect(f.progress.phase).toBe('missed');

  // Missed: climb to 6200 straight ahead (over SNY), then turn back direct SNY.
  f.send({ type: 'button', button: 'HDG' }, { type: 'headingBug', deg: 130 });
  expect(f.until(() => f.alt >= 6150, 300)).toBe(true);
  if (missedTurn === 'R') f.turn(220, 310);
  else f.turn(40, 310);
  const back = normalize360(f.radialFrom('SNY').radial + 180);
  f.send({ type: 'course', radio: 1, deg: Math.round(back) }, { type: 'button', button: 'NAV' });
  f.crossFix('SNY', 1.0, 600);
  if (missedTurn === 'L') return; // the bad run stops at SNY
  // Hold at SNY, inbound 130, right turns: arriving on ~310 → parallel (or teardrop).
  f.turn(310);
  f.wait(60);
  f.turn(220, 100); // parallel: turn back toward the holding side, 30° intercept
  f.send({ type: 'course', radio: 1, deg: 130 }, { type: 'button', button: 'NAV' });
  f.crossFix('SNY', 1.0, 600);
}

describe('KSNY VOR/DME 13 from the RIYOP arc, missed approach', () => {
  it('perfect run scores 100%', () => {
    const f = new Flight(sc());
    fly(f, 'R');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(
      a.items.map((x) => x.id),
      summary(a),
    ).toEqual(
      expect.arrayContaining([
        'ident:SNY',
        'fix-order',
        'segment-minimums',
        'final-course',
        'missed-approach',
      ]),
    );
    expect(a.items.find((x) => x.id.startsWith('hold-entry:SNY'))!.measured).toMatch(
      /^Flew parallel/,
    );
  });

  it('bad run: missed approach turned left', () => {
    const f = new Flight(sc());
    fly(f, 'L');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['missed-approach']);
    expect(a.items.find((x) => x.id === 'missed-approach')!.measured).toMatch(
      /turned left \(charted: right\)/,
    );
  });
});
