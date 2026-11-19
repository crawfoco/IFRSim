/**
 * T21 acceptance on the rules KCFO cannot exercise: the charted DME source (KMTJ) and the
 * barbed procedure turn (KAKO). Each has a perfect run and a bad run.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../src/procedures';
import { buildScenario } from '../../src/sim/scenario/scenario';
import type { FlightAnalysis } from '../../src/sim/scoring/analyze';
import { trueToMag } from '../../src/sim/geo/angles';
import { initialBearingTrueDeg } from '../../src/sim/geo/geodesy';
import { Flight } from '../sim/scripted';

const failed = (a: FlightAnalysis) => a.items.filter((x) => x.status === 'fail').map((x) => x.id);
const summary = (a: FlightAnalysis) =>
  a.items.map((x) => `${x.status.padEnd(4)} ${x.id}: ${x.measured}`).join('\n');

describe('KMTJ ILS 17: DME from the MTJ VOR/DME', () => {
  const sc = () =>
    buildScenario(procedureById('kmtj-ils17')!, NAVDATA, {
      startId: 'vectors-final',
      ceiling: 'above',
      gsOutOfService: false,
    });

  function fly(f: Flight, dmeFromMtj: boolean) {
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.send({ type: 'headingBug', deg: 140 }, { type: 'altPreselect', ft: 10000 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'ALT' });
    f.tune(1, 111.3, 168); // I-MTJ: no DME of its own
    f.tune(2, 117.1); // MTJ, for the DME
    if (dmeFromMtj) f.send({ type: 'dmeSource', radio: 2 });
    f.send({ type: 'button', button: 'APR' });
    // Established on the localizer: descend to the 8100 glideslope intercept altitude.
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 600)).toBe(true);
    f.descendOrClimb(8100, -800);
    expect(f.until(() => f.progress.phase === 'ended', 1500)).toBe(true);
  }

  it('perfect run: DME source NAV2 (MTJ) scores 100%', () => {
    const f = new Flight(sc());
    fly(f, true);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.items.find((x) => x.id === 'dme-source')).toMatchObject({ status: 'pass' });
  });

  it('bad run: DME left on NAV1 (the localizer, which has no DME)', () => {
    const f = new Flight(sc());
    fly(f, false);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['dme-source']);
    expect(a.items.find((x) => x.id === 'dme-source')!.measured).toMatch(/NAV1 \(I-MTJ\)/);
  });
});

describe('KMTJ ILS 17: procedure turn at BRUUK (over MTJ start)', () => {
  it('perfect run scores 100%: the localizer is usable out to the PT (expanded service volume)', () => {
    const f = new Flight(
      buildScenario(procedureById('kmtj-ils17')!, NAVDATA, {
        startId: 'over-mtj',
        ceiling: 'above',
        gsOutOfService: false,
      }),
    );
    // Vectored north, west of MTJ: turn for the VOR, track to it, then outbound on R-349.
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.send({ type: 'headingBug', deg: 20 }, { type: 'altPreselect', ft: 14500 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'ALT' });
    f.descendOrClimb(12500, -1000); // the assigned altitude, from 14500
    f.tune(1, 117.1); // MTJ on NAV1
    f.send({ type: 'dmeSource', radio: 1 });
    f.tune(2, 111.3, 168); // I-MTJ on NAV2 for now
    const toMtj = () => Math.round((f.radialFrom('MTJ').radial + 180) % 360);
    f.turn(toMtj());
    f.send({ type: 'course', radio: 1, deg: toMtj() }, { type: 'button', button: 'NAV' });
    f.crossFix('MTJ', 1.0, 900);
    // Over MTJ heading ~070: left turn onto R-349, intercepting it from the right (east).
    f.send({ type: 'course', radio: 1, deg: 349 });
    f.turn(319);
    f.send({ type: 'button', button: 'NAV' });
    f.crossFix('BRUUK', 1.0, 900);
    // PT: a minute outbound on 348, left to the 303 barb for a minute, right turn to 123.
    f.turn(348);
    f.wait(60);
    f.turn(303);
    f.wait(60);
    f.turn(33, 123);
    f.send({ type: 'standby', radio: 1, mhz: 111.3 }, { type: 'swap', radio: 1 });
    f.send({ type: 'course', radio: 1, deg: 168 }, { type: 'dmeSource', radio: 2 });
    f.send({ type: 'standby', radio: 2, mhz: 117.1 }, { type: 'swap', radio: 2 });
    f.wait(0.1);
    f.send({ type: 'ident', radio: 2 }, { type: 'button', button: 'APR' });
    const dev = () => Math.abs(f.sensors.nav1.indication?.deviationDeg ?? 10);
    expect(f.until(() => f.r.state.ap.lateral === 'APR' && dev() < 0.5, 600)).toBe(true);
    f.descendOrClimb(9400, -800); // established inbound: down to 9400 to BRUUK
    f.crossFix('BRUUK', 1.0, 600);
    f.descendOrClimb(8100, -800); // to WIDRU, the glideslope intercept altitude
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.items.find((x) => x.id.startsWith('procedure-turn:BRUUK'))).toMatchObject({
      status: 'pass',
    });
  });
});

describe('KAKO VOR 29: barbed procedure turn at AKO', () => {
  const sc = () =>
    buildScenario(procedureById('kako-vor29')!, NAVDATA, {
      startId: 'direct-ako',
      ceiling: 'above',
      gsOutOfService: false,
    });

  /** Direct AKO, outbound R-110, 45° barb, 180° back, inbound 290, final R-289 FROM. */
  function fly(f: Flight, barbHeading: number, backTurn: number[], toEnd = true) {
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.tune(1, 114.4, 135);
    f.send({ type: 'button', button: 'NAV' });
    f.descendOrClimb(7000, -1000); // the assigned altitude, from 10000
    f.crossFix('AKO', 1.0, 600);
    f.descendOrClimb(6000, -500); // over the IAF: down to the 6000 PT altitude
    // Outbound on R-110: heading 110, then NAV (pressing NAV while in NAV would cancel it).
    f.send({ type: 'course', radio: 1, deg: 110 });
    f.turn(110);
    f.send({ type: 'button', button: 'NAV' });
    f.wait(120);
    // The barb, one minute, then the 180° turn back.
    f.turn(barbHeading);
    f.wait(60);
    f.turn(...backTurn);
    f.send({ type: 'course', radio: 1, deg: 290 }, { type: 'button', button: 'NAV' });
    expect(f.until(() => f.r.state.ap.lateral === 'NAV', 300)).toBe(true);
    // Established inbound (needle nearly centred) before leaving the PT altitude.
    const dev = () => Math.abs(f.sensors.nav1.indication?.deviationDeg ?? 10);
    expect(f.until(() => dev() < 1, 300)).toBe(true);
    f.descendOrClimb(5300, -500);
    f.crossFix('AKO', 1.0, 600);
    // Final: R-289 FROM AKO, down to the MDA (5120).
    f.send({ type: 'course', radio: 1, deg: 289 });
    f.descendOrClimb(5100, -700);
    if (toEnd) expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
  }

  it('perfect run: PT on the north side within 10 NM scores 100%', () => {
    const f = new Flight(sc());
    fly(f, 65, [155, 245]); // left to 065, then right turn through south to 245
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.items.map((x) => x.id)).toContain('procedure-turn:AKO:0');
    // The final course is judged even though the MDA comes within 1 NM of AKO.
    expect(a.items.find((x) => x.id === 'final-course')).toMatchObject({ status: 'pass' });
    expect(a.items.find((x) => x.id === 'procedure-turn:AKO:0')!.measured).toMatch(/^Left side/);
  });

  it('missed approach back over AKO: hold reached and a parallel entry along the course', () => {
    const f = new Flight(
      buildScenario(procedureById('kako-vor29')!, NAVDATA, {
        startId: 'direct-ako',
        ceiling: 'below',
        gsOutOfService: false,
      }),
    );
    fly(f, 65, [155, 245], false);
    // At the MDA, level to the MAP (AKO 1.7), then GA and the missed approach.
    expect(f.until(() => f.distTo('AKO 1.7') < 0.2, 600)).toBe(true);
    f.goAround(6100);
    f.turn(20, 110); // climbing right turn, back to AKO
    const radial = f.sensors.nav1.indication!;
    f.send({
      type: 'course',
      radio: 1,
      deg: Math.round(((radial as { radialMagDeg: number }).radialMagDeg + 180) % 360),
    });
    f.send({ type: 'button', button: 'NAV' });
    f.crossFix('AKO', 1.0, 600);
    // Hold at AKO, inbound 290, right turns: arriving on 110 → parallel (or teardrop).
    f.turn(110);
    f.wait(60);
    f.turn(20, 290, 250); // parallel: turn back the other way, toward the holding side
    f.send({ type: 'course', radio: 1, deg: 290 }, { type: 'button', button: 'NAV' });
    f.crossFix('AKO', 1.0, 600);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(a.items.find((x) => x.id.startsWith('hold-entry:AKO'))!.measured).toMatch(
      /^Flew parallel/,
    );
    expect(a.items.find((x) => x.id === 'missed-approach')).toMatchObject({ status: 'pass' });
  });

  it('bad run: PT flown on the wrong (south) side', () => {
    const f = new Flight(sc());
    fly(f, 155, [65, 335]); // right to 155, then left turn through north to 335
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['procedure-turn:AKO:0']);
    expect(a.items.find((x) => x.id === 'procedure-turn:AKO:0')!.measured).toMatch(/wrong side/);
  });
});

/** Steer in HDG mode straight for a fix (radar vectors / own navigation) until within `nm`. */
function steerTo(f: Flight, fix: string, nm: number, maxS = 1200) {
  const mv = f.sc.world.magVarEastDeg;
  if (f.r.state.ap.lateral !== 'HDG') f.send({ type: 'button', button: 'HDG' });
  for (let i = 0; i < maxS / 5; i++) {
    if (f.distTo(fix) <= nm) return;
    const brg = initialBearingTrueDeg(f.r.state.aircraft.position, f.sc.fixes[fix]!);
    f.send({ type: 'headingBug', deg: Math.round(trueToMag(brg, mv)) });
    f.wait(5);
  }
  expect.fail(`did not reach ${fix}`);
}

describe('Offset starts nearly straight in: the course reversal is still required', () => {
  it('KMTJ direct-bruuk, bad run: straight in over BRUUK without the procedure turn', () => {
    const f = new Flight(
      buildScenario(procedureById('kmtj-ils17')!, NAVDATA, {
        startId: 'direct-bruuk',
        ceiling: 'above',
        gsOutOfService: false,
      }),
    );
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.send({ type: 'headingBug', deg: 200 }, { type: 'altPreselect', ft: 14500 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'ALT' });
    f.descendOrClimb(12500, -1000); // the assigned altitude, from 14500
    f.tune(1, 111.3, 168);
    f.tune(2, 117.1); // MTJ, for the DME
    f.send({ type: 'dmeSource', radio: 2 });
    steerTo(f, 'BRUUK', 3);
    // Arriving heading ~150, 18° off the localizer: joins it and carries straight on.
    f.send({ type: 'button', button: 'APR' });
    const dev = () => Math.abs(f.sensors.nav1.indication?.deviationDeg ?? 10);
    expect(f.until(() => f.r.state.ap.lateral === 'APR' && dev() < 0.5, 600)).toBe(true);
    f.descendOrClimb(8100, -1500); // high: down to the GS intercept altitude
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['fix-order']);
    expect(a.items.find((x) => x.id === 'fix-order')!.measured).toMatch(/Skipped: .*BRUUK/);
  });

  it('KAKO direct-ako-east, bad run: the shorter (left) turn outbound puts the PT on the wrong side', () => {
    const f = new Flight(
      buildScenario(procedureById('kako-vor29')!, NAVDATA, {
        startId: 'direct-ako-east',
        ceiling: 'above',
        gsOutOfService: false,
      }),
    );
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.send({ type: 'headingBug', deg: 210 }, { type: 'altPreselect', ft: 9000 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'ALT' });
    f.tune(1, 114.4);
    const toAko = () => Math.round((f.radialFrom('AKO').radial + 180) % 360);
    f.turn(toAko());
    f.send({ type: 'course', radio: 1, deg: toAko() }, { type: 'button', button: 'NAV' });
    f.descendOrClimb(7000, -1000); // the assigned altitude, from 10000
    f.crossFix('AKO', 1.0, 600);
    f.descendOrClimb(6000, -500); // over the IAF: down to the 6000 PT altitude
    // Over AKO heading ~255: the shorter, left turn round to R-110 outbound ends south of
    // it, and the PT is flown on that (wrong) side: barb 155, left turn back to 335.
    f.send({ type: 'course', radio: 1, deg: 110 });
    f.turn(180, 80);
    f.send({ type: 'button', button: 'NAV' });
    const dev = () => Math.abs(f.sensors.nav1.indication?.deviationDeg ?? 10);
    expect(f.until(() => f.r.state.ap.lateral === 'NAV' && dev() < 1, 300)).toBe(true);
    f.wait(60);
    f.turn(155);
    f.wait(60);
    f.turn(65, 335);
    f.send({ type: 'course', radio: 1, deg: 290 }, { type: 'button', button: 'NAV' });
    expect(f.until(() => f.r.state.ap.lateral === 'NAV' && dev() < 1, 300)).toBe(true);
    f.descendOrClimb(5300, -500);
    f.crossFix('AKO', 1.0, 600);
    f.send({ type: 'course', radio: 1, deg: 289 });
    f.descendOrClimb(5100, -700);
    expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['procedure-turn:AKO:0']);
    expect(a.items.find((x) => x.id === 'procedure-turn:AKO:0')!.measured).toMatch(/wrong side/);
  });

  // AKO is both the PT fix and the FAF, with the MAP 1.7 NM beyond: the skipped PT must be
  // caught within the final segment (the sequencer decides 1 NM past the fix).
  it('KAKO direct-ako-east, bad run: straight in over AKO without the procedure turn', () => {
    const f = new Flight(
      buildScenario(procedureById('kako-vor29')!, NAVDATA, {
        startId: 'direct-ako-east',
        ceiling: 'above',
        gsOutOfService: false,
      }),
    );
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.send({ type: 'headingBug', deg: 210 }, { type: 'altPreselect', ft: 9000 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'ALT' });
    f.tune(1, 114.4);
    const toAko = () => Math.round((f.radialFrom('AKO').radial + 180) % 360);
    f.turn(toAko());
    f.send({ type: 'course', radio: 1, deg: toAko() }, { type: 'button', button: 'NAV' });
    f.descendOrClimb(7000, -1000); // the assigned altitude, from 10000
    // Planning a straight-in, the pilot is already down to the 6000 PT altitude at AKO.
    expect(f.until(() => f.distTo('AKO') < 4, 600)).toBe(true);
    f.descendOrClimb(6000, -1000);
    f.crossFix('AKO', 1.0, 600);
    // Over AKO heading ~255: straight onto the final course, R-289, and down to the MDA.
    f.send({ type: 'course', radio: 1, deg: 289 });
    f.turn(289);
    f.send({ type: 'button', button: 'NAV' });
    f.descendOrClimb(5100, -1000);
    expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
    const a = f.analyze();
    // Crossing the FAF ~35° off R-289 and turning onto it there is also off the final course.
    // Down to the PT altitude before AKO is also below the assigned 7000 (assigned-altitude).
    expect(failed(a), summary(a)).toEqual(['fix-order', 'assigned-altitude', 'final-course']);
    expect(a.items.find((x) => x.id === 'fix-order')!.measured).toMatch(/Skipped: .*AKO/);
  });
});

describe('KGXY ILS 35: fixes flown in order', () => {
  const sc = () =>
    buildScenario(procedureById('kgxy-ils35')!, NAVDATA, {
      startId: 'over-gll',
      ceiling: 'above',
      gsOutOfService: true,
    });

  it('bad run: cutting the corner to BUFFS skips WELDS and the hold-in-lieu', () => {
    const f = new Flight(sc());
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.send({ type: 'altPreselect', ft: 8000 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'ALT' });
    f.tune(1, 114.2, 177); // GLL R-177
    f.tune(2, 110.3, 350); // I-DCI on NAV2 for now
    f.turn(177);
    f.send({ type: 'button', button: 'NAV' });
    f.descendOrClimb(9000, -1000); // from 10000: descend and maintain 9000 to GLL
    f.crossFix('GLL', 1.0, 600);
    f.descendOrClimb(7000, -1000); // on the feeder: down to its 7000 minimum
    // Turn back early, 12.5 NM out (BUFFS is 1.5 NM west of the feeder), instead of
    // continuing to WELDS (5 NM further) and flying the hold-in-lieu.
    expect(f.until(() => f.distTo('GLL') > 12.5, 900)).toBe(true);
    f.tune(1, 110.3, 350);
    f.turn(290);
    f.send({ type: 'button', button: 'APR' });
    f.crossFix('BUFFS', 1.0, 900);
    f.descendOrClimb(5400, -700); // to the ARTSS step-down, then the MDA
    f.crossFix('ARTSS', 1.0, 600);
    f.descendOrClimb(5100, -600);
    expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual(['fix-order']);
    expect(a.items.find((x) => x.id === 'fix-order')!.measured).toMatch(
      /Skipped: Track to WELDS, Hold at WELDS/,
    );
  });
});
