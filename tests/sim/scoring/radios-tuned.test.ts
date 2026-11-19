/** tuneAndIdentify: a navaid a leg is flown on must stay tuned while that leg is current. */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../../src/procedures';
import { buildScenario } from '../../../src/sim/scenario/scenario';
import type { FlightAnalysis } from '../../../src/sim/scoring/analyze';
import { Flight } from '../scripted';

const kcfo = procedureById('kcfo-ils26')!;
const kgxy = procedureById('kgxy-ils35')!;
const vectors = () =>
  buildScenario(kcfo, NAVDATA, {
    startId: 'vectors-final',
    ceiling: 'above',
    gsOutOfService: false,
  });

const item = (a: FlightAnalysis, id: string) => a.items.find((x) => x.id === id)!;

/** Vectors to the ILS: NAV2 → FQF (missed approach), NAV1 → I-FTG (both identified); APR to SKIPI. */
function vectorsToFaf(f: Flight) {
  f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
  f.tune(2, 116.3); // FQF, for the missed approach
  f.send({ type: 'headingBug', deg: 293 }, { type: 'altPreselect', ft: 8000 });
  f.wait(0.1);
  f.send({ type: 'button', button: 'ALT' });
  f.tune(1, 109.3, 263);
  f.send({ type: 'button', button: 'APR' });
  expect(f.until(() => f.r.state.ap.lateral === 'APR', 600)).toBe(true);
  f.crossFix('SKIPI', 0.5, 600);
}

/**
 * Swap NAV1 to `mhz` for `seconds`, then back to I-FTG (no new ident). NAV2 stays on FQF
 * (needed by the missed approach) the whole time: parked there since the vectors, it does not
 * suspend the watch on I-FTG.
 */
function swapAway(f: Flight, seconds: number, mhz = 112.0) {
  expect(f.r.state.radios.nav2.activeMHz).toBeCloseTo(116.3);
  f.send({ type: 'standby', radio: 1, mhz }, { type: 'swap', radio: 1 });
  f.send({ type: 'course', radio: 1, deg: 45 });
  f.wait(seconds);
  f.send({ type: 'swap', radio: 1 }, { type: 'course', radio: 1, deg: 263 });
  f.wait(0.1);
}

describe('ident rule: navaid stays tuned while its leg is flown', () => {
  it('tuned and identified throughout: passes', () => {
    const f = new Flight(vectors());
    vectorsToFaf(f);
    f.until(() => f.progress.phase === 'ended', 900);
    const a = f.analyze();
    const x = item(a, 'ident:I-FTG');
    expect(x.status, x.measured).toBe('pass');
    expect(x.measured).toMatch(/^Identified at /);
  });

  it('localizer off both radios for 30 s on final (FQF parked on NAV2): fails', () => {
    const f = new Flight(vectors());
    vectorsToFaf(f);
    f.wait(5);
    swapAway(f, 30);
    f.until(() => f.progress.phase === 'ended', 900);
    const a = f.analyze();
    const x = item(a, 'ident:I-FTG');
    expect(x.status).toBe('fail');
    expect(x.measured).toMatch(
      /^I-FTG not tuned for 0:30 while flying 'Final approach from SKIPI' \(from \d\d:\d\d\)$/,
    );
  });

  it('NAV1 moved from I-FTG to FQF (next legs: missed approach) on final: tolerated', () => {
    const f = new Flight(vectors());
    vectorsToFaf(f);
    f.wait(5);
    swapAway(f, 30, 116.3);
    f.until(() => f.progress.phase === 'ended', 900);
    const x = item(f.analyze(), 'ident:I-FTG');
    expect(x.status, x.measured).toBe('pass');
  });

  it('a 5 s swap to check something: passes, and re-tuning needs no new ident', () => {
    const f = new Flight(vectors());
    vectorsToFaf(f);
    f.wait(5);
    swapAway(f, 5);
    f.until(() => f.progress.phase === 'ended', 900);
    const a = f.analyze();
    const x = item(a, 'ident:I-FTG');
    expect(x.status, x.measured).toBe('pass');
  });

  it('re-tuning early for the next leg (KGXY lead radial, before WELDS): passes', () => {
    const f = new Flight(
      buildScenario(kgxy, NAVDATA, {
        startId: 'wavdi-arc',
        ceiling: 'above',
        gsOutOfService: false,
      }),
    );
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.send({ type: 'altPreselect', ft: 7000 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'ALT' });
    f.descendOrClimb(7000, -1000); // from 9000: descend and maintain 7000
    f.tune(1, 114.2, 136); // GLL, outbound on R-136
    f.tune(2, 110.3, 350); // I-DCI, ready for the final
    f.send({ type: 'button', button: 'NAV' });
    f.untilDme('GLL', 17.0, true, 600);
    f.flyArc('GLL', 17.5, 'R', 170); // to the lead radial
    f.tune(1, 110.3, 350); // GLL now on neither radio, arc leg still current
    f.turn(320);
    f.send({ type: 'button', button: 'APR' });
    f.crossFix('WELDS', 3.0, 600);
    f.wait(30);
    const a = f.analyze();
    const legs = a.sequencer.legs.map((l) => a.sequencer.route[l.index]!.label);
    expect(legs[0]).toBe('GLL 17.5 DME arc to WELDS');
    const x = item(a, 'ident:GLL');
    expect(x.status, x.measured).toBe('pass');
    expect(x.measured).toMatch(/^Identified at /);
  });
});
