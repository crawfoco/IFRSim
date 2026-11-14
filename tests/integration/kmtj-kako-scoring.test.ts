/**
 * T21 acceptance on the rules KCFO cannot exercise: the charted DME source (KMTJ) and the
 * barbed procedure turn (KAKO). Each has a perfect run and a bad run.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../src/procedures';
import { buildScenario } from '../../src/sim/scenario/scenario';
import type { FlightAnalysis } from '../../src/sim/scoring/analyze';
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
    f.send({ type: 'ident', radio: 2 }); // NAV2 is already on MTJ 117.1
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
    f.descendOrClimb(6000, -500);
    f.crossFix('AKO', 1.0, 600);
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
    // At the MDA, level to the MAP (AKO 1.7), then the missed approach.
    expect(f.until(() => f.progress.phase === 'missed', 600)).toBe(true);
    f.descendOrClimb(6100, 800);
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
    f.descendOrClimb(7000, -500);
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
