/**
 * Hold rules: outbound leg timing, the hold's maximum altitude and climb-in-hold, on
 * scripted flights (KCFO SKIPI hold-in-lieu, KMTJ PAGRE missed-approach hold).
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../../src/procedures';
import { trueToMag } from '../../../src/sim/geo/angles';
import { initialBearingTrueDeg } from '../../../src/sim/geo/geodesy';
import { buildScenario } from '../../../src/sim/scenario/scenario';
import type { FlightAnalysis } from '../../../src/sim/scoring/analyze';
import { Flight } from '../scripted';

const summary = (a: FlightAnalysis) =>
  a.items.map((x) => `${x.status.padEnd(4)} ${x.id}: ${x.measured}`).join('\n');
const item = (a: FlightAnalysis, prefix: string) => a.items.find((x) => x.id.startsWith(prefix));

const kcfo = () =>
  buildScenario(procedureById('kcfo-ils26')!, NAVDATA, {
    startId: 'over-fqf',
    ceiling: 'above',
    gsOutOfService: false,
  });

/** Steer direct to a fix in HDG mode (bug refreshed each second) until it is crossed. */
function direct(f: Flight, fix: string, maxS = 900) {
  const mv = f.sc.world.magVarEastDeg;
  if (f.r.state.ap.lateral !== 'HDG') f.send({ type: 'button', button: 'HDG' });
  let last = Infinity;
  for (let i = 0; i < maxS; i++) {
    const d = f.distTo(fix);
    if (d > last && d < 1.0) return;
    last = d;
    const brg = initialBearingTrueDeg(f.r.state.aircraft.position, f.sc.fixes[fix]!);
    f.send({ type: 'headingBug', deg: Math.round(trueToMag(brg, mv)) });
    f.wait(1);
  }
  expect.fail(`did not reach ${fix}`);
}

/** Direct SKIPI at 8000, parallel entry with `outboundS` outbound, then the ILS. */
function flySkipi(f: Flight, outboundS: number, holdAltFt = 7200) {
  f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
  f.send({ type: 'altPreselect', ft: 8000 });
  f.wait(0.1);
  f.send({ type: 'button', button: 'ALT' });
  f.send({ type: 'standby', radio: 1, mhz: 109.3 });
  direct(f, 'SKIPI');
  f.send({ type: 'swap', radio: 1 }, { type: 'course', radio: 1, deg: 263 });
  f.turn(83); // parallel entry: outbound on the non-holding (north) side
  f.descendOrClimb(holdAltFt, holdAltFt > f.alt ? 700 : -500);
  f.wait(outboundS);
  f.turn(173, 263, 303); // back toward the holding side, intercept at 40°
  if (holdAltFt > 7200) f.descendOrClimb(7200, -1000);
  f.send({ type: 'button', button: 'APR' });
  f.until(() => f.progress.phase === 'ended', 1200);
}

describe('hold outbound timing', () => {
  it('a one-minute outbound leg passes', () => {
    const f = new Flight(kcfo());
    flySkipi(f, 58);
    const a = f.analyze();
    const t = item(a, 'hold-timing:SKIPI:');
    expect(t, summary(a)).toMatchObject({
      status: 'pass',
      title: 'Hold outbound timing at SKIPI (1 min)',
    });
    expect(t!.measured).toMatch(/^Outbound leg (0:5\d|1:0\d)$/);
    expect(item(a, 'hold-max-altitude:SKIPI:')).toMatchObject({ status: 'pass' });
  });

  it('a 30 s outbound leg fails', () => {
    const f = new Flight(kcfo());
    flySkipi(f, 28);
    const a = f.analyze();
    const t = item(a, 'hold-timing:SKIPI:');
    expect(t, summary(a)).toMatchObject({ status: 'fail' });
    expect(t!.measured).toMatch(/^Outbound leg 0:[23]\d \(expected 1:00 ±15 s\)/);
  });
});

describe('hold maximum altitude', () => {
  it('climbing above 8000 in the SKIPI hold fails', () => {
    const f = new Flight(kcfo());
    flySkipi(f, 58, 8600);
    const a = f.analyze();
    const m = item(a, 'hold-max-altitude:SKIPI:');
    expect(m, summary(a)).toMatchObject({ status: 'fail' });
    expect(m!.measured).toMatch(/^Highest 8,[4-6]\d\d ft \(maximum 8,000 ft\)$/);
  });
});

describe('climb in hold', () => {
  it('a missed approach that never climbs to the PAGRE hold altitude fails', () => {
    const f = new Flight(
      buildScenario(procedureById('kmtj-ils17')!, NAVDATA, {
        startId: 'vectors-final',
        ceiling: 'below',
        gsOutOfService: false,
      }),
    );
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.send({ type: 'headingBug', deg: 140 }, { type: 'altPreselect', ft: 10000 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'ALT' });
    f.tune(1, 111.3, 168);
    f.send({ type: 'ident', radio: 2 }, { type: 'dmeSource', radio: 2 });
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 600)).toBe(true);
    f.descendOrClimb(8100, -800);
    expect(f.untilMinimums(1500)).toBe(true);
    // Missed approach, but levelling at 9000 instead of climbing to 11000.
    f.goAround(9000);
    expect(f.until(() => f.alt >= 6300, 300)).toBe(true);
    f.tune(1, 117.1, 297); // MTJ R-297 outbound to PAGRE
    f.turn(325);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.progress.holdArrivalTick !== null, 1500)).toBe(true);
    f.turn(207, 117); // teardrop-ish turn back toward the hold
    f.wait(120);
    const a = f.analyze();
    const c = item(a, 'climb-in-hold:PAGRE');
    expect(c, summary(a)).toMatchObject({ status: 'fail' });
    expect(c!.measured).toMatch(/^Highest 9,\d{3} ft .*climb to 11,000 ft in the hold$/);
  });
});
