/**
 * T21 acceptance: a scripted perfect KCFO run scores 100%, and a "bad run" for each rule
 * loses points on exactly that rule.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../src/procedures';
import { buildScenario, type ScenarioOptions } from '../../src/sim/scenario/scenario';
import type { FlightAnalysis } from '../../src/sim/scoring/analyze';
import { Flight } from '../sim/scripted';

const kcfo = procedureById('kcfo-ils26')!;
const scenario = (o: Partial<ScenarioOptions>) =>
  buildScenario(kcfo, NAVDATA, {
    startId: 'over-fqf',
    ceiling: 'above',
    gsOutOfService: false,
    ...o,
  });

const failed = (a: FlightAnalysis) => a.items.filter((x) => x.status === 'fail').map((x) => x.id);
const summary = (a: FlightAnalysis) =>
  a.items.map((x) => `${x.status.padEnd(4)} ${x.id}: ${x.measured}`).join('\n');

export interface FeederOptions {
  identify?: boolean;
  /** Entry flown at SKIPI. */
  entry?: 'parallel' | 'teardrop';
  /** Descend to this altitude on the feeder (to break the segment minimum). */
  feederAltFt?: number;
}

/** Over FQF → R-045 → SKIPI hold-in-lieu (parallel entry) → LOC/GS inbound. */
export function flyFeederAndHold(f: Flight, o: FeederOptions = {}) {
  const identify = o.identify ?? true;
  f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
  f.send({ type: 'headingBug', deg: 75 }, { type: 'altPreselect', ft: 8000 }); // 30° cut
  f.wait(0.1);
  f.send({ type: 'button', button: 'ALT' });
  // NAV1 stays on FQF (already tuned): identify it and set the radial. NAV2 → I-FTG for DME.
  f.send({ type: 'course', radio: 1, deg: 45 });
  if (identify) f.send({ type: 'ident', radio: 1 });
  f.send({ type: 'standby', radio: 2, mhz: 109.3 }, { type: 'swap', radio: 2 });
  f.send({ type: 'course', radio: 2, deg: 263 }, { type: 'dmeSource', radio: 2 });
  f.wait(0.1);
  if (identify) f.send({ type: 'ident', radio: 2 });
  f.send({ type: 'standby', radio: 1, mhz: 109.3 });
  f.wait(20);
  f.send({ type: 'button', button: 'NAV' });
  if (o.feederAltFt !== undefined) {
    f.descendOrClimb(o.feederAltFt, -500);
  }
  f.crossFix('SKIPI', 1.0, 900);

  // Hold-in-lieu at SKIPI: inbound 263, left turns.
  f.send({ type: 'swap', radio: 1 }, { type: 'course', radio: 1, deg: 263 });
  if (o.entry === 'teardrop') {
    // Wrong for this arrival: 30° off the outbound course toward the holding (south) side.
    f.turn(113);
  } else {
    f.turn(83); // parallel: outbound on the non-holding (north) side
  }
  // Down to 7200 on the outbound leg, so the glideslope is intercepted from below.
  f.descendOrClimb(7200, -500);
  f.wait(90);
  if (o.entry === 'teardrop')
    f.turn(353, 263, 223); // teardrop: turn back in the holding direction
  // Parallel: turn back toward the holding side (right, through south), intercept at 40°.
  else f.turn(173, 263, 303);
  f.send({ type: 'button', button: 'APR' });
}

describe('KCFO ILS 26 scoring', () => {
  it('perfect run: feeder, parallel entry, ILS to DA scores 100%', () => {
    const f = new Flight(scenario({}));
    flyFeederAndHold(f);
    expect(f.until(() => f.progress.phase === 'ended', 1200)).toBe(true);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(a.items.map((x) => x.id)).toEqual([
      'ident:FQF',
      'ident:I-FTG',
      'fix-order',
      'segment-minimums',
      'hold-entry:SKIPI:1',
      'final-course',
      'glideslope',
      'decision',
    ]);
    expect(a.items.find((x) => x.id === 'decision')!.measured).toMatch(
      /^Runway in sight: landing\. Descended below the DA 5,689/,
    );
    expect(a.items.find((x) => x.id === 'hold-entry:SKIPI:1')!.measured).toMatch(
      /^Flew parallel; arriving on heading 04\d° calls for parallel/,
    );
    const legs = a.sequencer.legs.map((l) => [a.sequencer.route[l.index]!.label, l.status]);
    expect(legs).toEqual([
      ['Track to SKIPI', 'flown'],
      ['Hold at SKIPI', 'flown'],
      ['Final approach from SKIPI', 'active'],
    ]);
    expect(a.sequencer.fafTick).not.toBeNull();
  });

  it('bad run: navaids never identified', () => {
    const f = new Flight(scenario({}));
    flyFeederAndHold(f, { identify: false });
    f.until(() => f.progress.phase === 'ended', 1200);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['ident:FQF', 'ident:I-FTG']);
  });

  it('bad run: teardrop entry where the arrival calls for parallel', () => {
    const f = new Flight(scenario({}));
    flyFeederAndHold(f, { entry: 'teardrop' });
    f.until(() => f.progress.phase === 'ended', 1200);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['hold-entry:SKIPI:1']);
  });

  it('bad run: below the 8000 ft feeder minimum', () => {
    const f = new Flight(scenario({}));
    flyFeederAndHold(f, { feederAltFt: 7500 });
    f.until(() => f.progress.phase === 'ended', 1200);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['segment-minimums']);
    expect(a.items.find((x) => x.id === 'segment-minimums')!.measured).toMatch(
      /on "Track to SKIPI" \(minimum 8,000 ft\)/,
    );
  });
});

/** Radar vectors: tune and identify I-FTG, heading 293, arm APR. */
function flyVectors(f: Flight) {
  f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
  f.send({ type: 'headingBug', deg: 293 }, { type: 'altPreselect', ft: 8000 });
  f.wait(0.1);
  f.send({ type: 'button', button: 'ALT' });
  f.tune(1, 109.3, 263);
  f.send({ type: 'button', button: 'APR' });
  expect(f.until(() => f.r.state.ap.lateral === 'APR', 600)).toBe(true);
  if (f.sc.options.gsOutOfService) {
    f.descendOrClimb(7200, -500);
    f.crossFix('SKIPI', 0.5, 600);
    f.descendOrClimb(5900, -700);
  }
}

/** GA, then the published missed approach from wherever the aircraft is on final, to SKIPI. */
function flyMissed(f: Flight, turn: 'L' | 'R' = 'L') {
  f.goAround(7200);
  expect(f.progress.phase).toBe('missed');
  f.send({ type: 'button', button: 'HDG' }, { type: 'headingBug', deg: 263 });
  expect(f.until(() => f.alt >= 6100, 120)).toBe(true);
  f.tune(1, 116.3, 45);
  if (turn === 'R') {
    f.turn(350, 80); // the wrong way round: joins R-045 beyond SKIPI
    f.wait(120);
    return;
  }
  f.turn(170, 80);
  f.send({ type: 'button', button: 'NAV' });
  f.crossFix('SKIPI', 1.0, 900);
  f.turn(83); // parallel entry, as on the feeder
  f.wait(60);
  f.turn(173, 263); // back toward the holding side
}

describe('KCFO bad runs on the final and the missed approach', () => {
  const vectors = (o: Partial<ScenarioOptions>) => scenario({ startId: 'vectors-final', ...o });

  it('reference: vectors to an ILS with a published missed approach scores 100%', () => {
    const f = new Flight(vectors({ ceiling: 'below' }));
    flyVectors(f);
    expect(f.untilMinimums()).toBe(true);
    flyMissed(f);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.items.find((x) => x.id === 'decision')!.measured).toMatch(
      /^Go-around \(GA\) at 56\d\d ft$/,
    );
    expect(a.items.map((x) => x.id)).toEqual([
      'ident:I-FTG',
      'ident:FQF',
      'fix-order',
      'segment-minimums',
      'hold-entry:SKIPI:4',
      'final-course',
      'glideslope',
      'decision',
      'missed-approach',
    ]);
  });

  it('bad run: localizer beyond half scale inside the FAF (LOC only)', () => {
    const f = new Flight(vectors({ gsOutOfService: true }));
    flyVectors(f);
    f.turn(275); // wander right of course
    f.wait(40);
    f.send({ type: 'button', button: 'NAV' });
    f.until(() => f.progress.phase === 'ended', 900);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['final-course']);
  });

  it('bad run: glideslope beyond half scale (VS dive inside the FAF)', () => {
    const f = new Flight(vectors({}));
    flyVectors(f);
    f.crossFix('SKIPI', 0.5, 600);
    f.wait(20);
    f.descendOrClimb(5600, -1000); // dive under the glideslope down to DA
    f.until(() => f.progress.phase === 'ended', 900);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['glideslope']);
  });

  it('bad run: continuing below DA without the runway', () => {
    const f = new Flight(vectors({ ceiling: 'below' }));
    flyVectors(f);
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true); // still coupled, no GA
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['decision']);
    expect(a.items.find((x) => x.id === 'decision')!.measured).toMatch(
      /^Descended below the DA 5,689 without the runway in sight/,
    );
  });

  it('bad run: missed approach turned right instead of left', () => {
    const f = new Flight(vectors({ ceiling: 'below' }));
    flyVectors(f);
    expect(f.untilMinimums()).toBe(true);
    flyMissed(f, 'R');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['missed-approach']);
    expect(a.items.find((x) => x.id === 'missed-approach')!.measured).toMatch(
      /turned right \(charted: left\)/,
    );
  });
});

describe('KCFO LOC-only: the learner identifies the MAP', () => {
  it('passing the MAP at the MDA without GA, no runway: the decision fails', () => {
    const f = new Flight(
      scenario({ startId: 'vectors-final', ceiling: 'below', gsOutOfService: true }),
    );
    flyVectors(f);
    expect(f.untilMinimums()).toBe(true);
    expect(f.progress.callout).toBe('Minimums.'); // no MAP prompt: identifying it is the job
    expect(f.until(() => f.progress.phase === 'ended', 300)).toBe(true);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['decision']);
    expect(a.items.find((x) => x.id === 'decision')!.measured).toMatch(
      /^Passed the missed approach point \(I-FTG 1\.7\) without the runway in sight/,
    );
  });

  it('GA at the MAP passes', () => {
    const f = new Flight(
      scenario({ startId: 'vectors-final', ceiling: 'below', gsOutOfService: true }),
    );
    flyVectors(f);
    expect(f.until(() => f.distTo('I-FTG 1.7') < 0.2, 900)).toBe(true);
    flyMissed(f);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
  });
});

describe('KCFO regressions from the M5 review', () => {
  it('a tight hold (outbound never 2.5 NM away) still completes and sequences the final', () => {
    const f = new Flight(scenario({}));
    f.send({ type: 'speed', kt: 90 });
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.send({ type: 'headingBug', deg: 75 }, { type: 'altPreselect', ft: 8000 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'ALT' }, { type: 'course', radio: 1, deg: 45 });
    f.send({ type: 'ident', radio: 1 });
    f.send({ type: 'standby', radio: 2, mhz: 109.3 }, { type: 'swap', radio: 2 });
    f.send({ type: 'dmeSource', radio: 2 }, { type: 'standby', radio: 1, mhz: 109.3 });
    f.wait(0.1);
    f.send({ type: 'ident', radio: 2 });
    f.wait(20);
    f.send({ type: 'button', button: 'NAV' });
    f.crossFix('SKIPI', 1.0, 900);
    f.send({ type: 'swap', radio: 1 }, { type: 'course', radio: 1, deg: 263 });
    f.turn(83); // parallel: a short outbound leg
    f.descendOrClimb(7200, -700);
    f.wait(40);
    f.turn(173, 263, 293); // back toward the holding side, 30° intercept
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
    const a = f.analyze();
    const farthest = Math.max(
      ...a.samples
        .filter((s) => a.sequencer.route[s.legIndex]!.leg.type === 'hold')
        .map((s) => distanceTo(f, s)),
    );
    expect(farthest).toBeLessThan(2.5); // inside the old 2.5 NM re-arm distance
    expect(a.sequencer.legs.map((l) => l.status)).toEqual(['flown', 'flown', 'active']);
    expect(a.sequencer.fafTick).not.toBeNull();
    expect(failed(a), summary(a)).not.toContain('hold-entry:SKIPI:1');
    expect(a.items.map((x) => x.id)).toEqual(
      expect.arrayContaining(['final-course', 'glideslope']),
    );
  });

  it('joining the localizer east of SKIPI without the hold-in-lieu: fix order fails', () => {
    const f = new Flight(scenario({ gsOutOfService: true }));
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.send({ type: 'headingBug', deg: 90 }, { type: 'altPreselect', ft: 8000 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'ALT' }, { type: 'ident', radio: 1 });
    f.wait(720); // east, well south of SKIPI
    f.tune(1, 109.3, 263);
    f.turn(320); // join the localizer about 5 NM east of SKIPI
    f.send({ type: 'button', button: 'APR' });
    f.crossFix('SKIPI', 1.0, 900); // inbound, straight in: no course reversal
    f.descendOrClimb(5900, -1000); // from 8000: steeper, to reach the MDA before the MAP
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['fix-order']);
    expect(a.items.find((x) => x.id === 'fix-order')!.measured).toMatch(/Skipped: Hold at SKIPI/);
    expect(a.sequencer.fafTick).not.toBeNull(); // the final was still scored
    expect(a.items.map((x) => x.id)).toContain('final-course');
  });
});

function distanceTo(f: Flight, s: { latDeg: number; lonDeg: number }) {
  const p = f.sc.fixes.SKIPI!;
  const dLat = (s.latDeg - p.latDeg) * 60;
  const dLon = (s.lonDeg - p.lonDeg) * 60 * Math.cos((p.latDeg * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}
