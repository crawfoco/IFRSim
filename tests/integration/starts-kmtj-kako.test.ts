/**
 * Start conditions without their own test: KMTJ ILS 17 from HAQHY (JNC R-098 feeder) and
 * the PAGRE 14.8 DME arc; KAKO VOR 29 via the north and south AKO 10 DME arcs. Each is a
 * scripted perfect run (100%). One KMTJ run goes missed at the DA and flies the missed
 * approach to the PAGRE hold, climbing in the hold to 11000.
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

const scenario = (id: string, startId: string, ceiling: 'above' | 'below') =>
  buildScenario(procedureById(id)!, NAVDATA, { startId, ceiling, gsOutOfService: false });

/** AP on in HDG, holding the present altitude. */
function engage(f: Flight, hdg: number) {
  f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
  f.send({ type: 'headingBug', deg: hdg }, { type: 'altPreselect', ft: Math.round(f.alt) });
  f.wait(0.1);
  f.send({ type: 'button', button: 'ALT' });
}

describe('KMTJ ILS 17: HAQHY and PAGRE arc starts', () => {
  /**
   * I-MTJ on NAV1 (CRS 168), MTJ on NAV2 as the DME source, APR armed; once established,
   * on to BRUUK and down to the 8100 glideslope intercept altitude (capture from below).
   */
  function toLocalizer(f: Flight, interceptHdg: number) {
    f.send({ type: 'button', button: 'HDG' }, { type: 'headingBug', deg: interceptHdg });
    f.tune(1, 111.3, 168);
    f.tune(2, 117.1);
    f.send({ type: 'dmeSource', radio: 2 }, { type: 'button', button: 'APR' });
    const dev = () => Math.abs(f.sensors.nav1.indication?.deviationDeg ?? 10);
    expect(f.until(() => f.r.state.ap.lateral === 'APR' && dev() < 0.5, 600)).toBe(true);
  }

  /** HAQHY feeder: JNC R-098 FROM to BRUUK at 9400, then the localizer. */
  function flyHaqhy(f: Flight) {
    engage(f, 98);
    f.tune(1, 112.4, 98); // JNC R-098 (NAV2 is on JNC too)
    f.send({ type: 'button', button: 'NAV' });
    f.untilDme('JNC', 36.2, true, 900); // past HAQHY at 12000
    f.descendOrClimb(9400, -600);
    // Re-tune for the localizer ~3 NM before BRUUK (JNC 46 DME).
    f.untilDme('JNC', 43, true, 900);
    toLocalizer(f, 98); // APR armed on the feeder heading: the AP leads the 70° turn
    f.crossFix('BRUUK', 1.0, 600);
    f.descendOrClimb(8100, -800);
  }

  it('HAQHY feeder (NoPT), ceiling above: lands, 100%', () => {
    const f = new Flight(scenario('kmtj-ils17', 'haqhy', 'above'));
    flyHaqhy(f);
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
    expect(f.progress.outcome).toBe('landed');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(item(a, 'ident:JNC'), summary(a)).toMatchObject({ status: 'pass' });
    expect(item(a, 'dme-source')).toMatchObject({ status: 'pass' });
    expect(item(a, 'fix-order')!.measured).toMatch(/BRUUK → WIDRU/);
  });

  it('PAGRE 14.8 DME arc (NoPT), ceiling above: lands, 100%', () => {
    const f = new Flight(scenario('kmtj-ils17', 'pagre-arc', 'above'));
    engage(f, 117);
    f.tune(1, 117.1, 117); // MTJ, inbound on R-297
    f.send({ type: 'button', button: 'NAV' });
    f.untilDme('MTJ', 15.3, false, 900);
    f.descendOrClimb(9400, -600); // reaching PAGRE: down to the arc altitude
    f.flyArc('MTJ', 14.8, 'R', 341); // the charted lead radial
    toLocalizer(f, 140);
    f.crossFix('BRUUK', 1.0, 600);
    f.descendOrClimb(8100, -800);
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
    expect(f.progress.outcome).toBe('landed');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(item(a, 'ident:MTJ')).toMatchObject({ status: 'pass' });
    expect(item(a, 'fix-order')!.measured).toMatch(/BRUUK/);
    expect(item(a, 'segment-minimums')).toMatchObject({ status: 'pass' });
  });

  it('HAQHY, ceiling below: GA at the DA, missed approach, climb in the PAGRE hold, 100%', () => {
    const f = new Flight(scenario('kmtj-ils17', 'haqhy', 'below'));
    flyHaqhy(f);
    expect(f.untilMinimums(900)).toBe(true);
    f.goAround(11000);
    expect(f.progress.phase).toBe('missed');
    // Straight ahead to 6300, then a climbing right turn to 325, intercepting MTJ R-297.
    f.send({ type: 'button', button: 'HDG' }, { type: 'headingBug', deg: 168 });
    expect(f.until(() => f.alt >= 6300, 300)).toBe(true);
    f.tune(1, 117.1, 297);
    f.turn(250, 325);
    f.send({ type: 'button', button: 'NAV' });
    f.crossFix('PAGRE', 1.0, 900);
    // Hold at PAGRE, inbound 117 to MTJ, right turns: arriving on ~297 → parallel/teardrop.
    f.turn(297);
    f.wait(60);
    f.turn(207, 117, 77); // parallel: left turn back across to the inbound course
    f.send({ type: 'course', radio: 1, deg: 117 }, { type: 'button', button: 'NAV' });
    f.crossFix('PAGRE', 1.0, 600); // established inbound
    // One racetrack circuit.
    f.turn(207, 297);
    f.wait(63);
    f.turn(27, 117);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
    expect(f.progress.outcome).toBe('missedComplete');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(item(a, 'missed-approach')).toMatchObject({ status: 'pass' });
    expect(item(a, 'climb-in-hold:PAGRE'), summary(a)).toMatchObject({ status: 'pass' });
    expect(item(a, 'hold-entry:PAGRE')!.measured).toMatch(/^Flew parallel/);
    expect(item(a, 'hold-timing:PAGRE')).toMatchObject({ status: 'pass' });
  });
});

describe('KAKO VOR 29: AKO 10 DME arc starts', () => {
  /** From the arc's lead radial: intercept 290 inbound, AKO at 5300, final to the MDA. */
  function inboundAndFinal(f: Flight, interceptHdg: number) {
    f.send({ type: 'course', radio: 1, deg: 290 });
    f.turn(interceptHdg);
    f.send({ type: 'button', button: 'NAV' });
    f.crossFix('GERON', 3.0, 300);
    const dev = () => Math.abs(f.sensors.nav1.indication?.deviationDeg ?? 10);
    expect(f.until(() => f.r.state.ap.lateral === 'NAV' && dev() < 1, 300)).toBe(true);
    f.descendOrClimb(5300, -500);
    f.crossFix('AKO', 1.0, 600);
    f.send({ type: 'course', radio: 1, deg: 289 }); // final: R-289 FROM AKO
    f.descendOrClimb(5100, -700);
  }

  it('north arc (R-050, clockwise), ceiling above: lands, 100%', () => {
    const f = new Flight(scenario('kako-vor29', 'north-arc', 'above'));
    engage(f, 230);
    f.tune(1, 114.4, 230); // AKO (already on NAV1), inbound on R-050
    f.send({ type: 'button', button: 'NAV' });
    f.descendOrClimb(6000, -500);
    f.untilDme('AKO', 10.5, false, 600);
    f.flyArc('AKO', 10, 'R', 105); // lead 5° before R-110
    inboundAndFinal(f, 260);
    expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
    expect(f.progress.outcome).toBe('landed');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(item(a, 'fix-order')!.measured).toMatch(/GERON → AKO/);
    expect(item(a, 'final-course')).toMatchObject({ status: 'pass' });
  });

  it('south arc (R-170, counter-clockwise), ceiling above: lands, 100%', () => {
    const f = new Flight(scenario('kako-vor29', 'south-arc', 'above'));
    engage(f, 350);
    f.tune(1, 114.4, 350); // AKO, inbound on R-170
    f.send({ type: 'button', button: 'NAV' });
    f.descendOrClimb(6000, -500);
    f.untilDme('AKO', 10.5, false, 600);
    f.flyArc('AKO', 10, 'L', 115); // lead 5° before R-110
    inboundAndFinal(f, 320);
    expect(f.until(() => f.progress.phase === 'ended', 600)).toBe(true);
    expect(f.progress.outcome).toBe('landed');
    const a = f.analyze();
    expect(failed(a), summary(a)).toEqual([]);
    expect(item(a, 'ident:AKO')).toMatchObject({ status: 'pass' });
    expect(item(a, 'fix-order')!.measured).toMatch(/GERON → AKO/);
    expect(item(a, 'decision')).toMatchObject({ status: 'pass' });
  });
});
