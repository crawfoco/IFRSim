import { describe, expect, it } from 'vitest';
import {
  initialAircraft,
  standardRateBankDeg,
  stepAircraft,
  tasKt,
  type AircraftControls,
  type AircraftState,
} from '../../../src/sim/aircraft/model';
import { signedAngleDiff } from '../../../src/sim/geo/angles';
import { destination, inverse } from '../../../src/sim/geo/geodesy';

const DT = 0.05;
const START = { latDeg: 39.79, lonDeg: -104.54 };

function run(
  s: AircraftState,
  c: AircraftControls,
  seconds: number,
  onStep?: (s: AircraftState, t: number) => boolean | void,
) {
  let t = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    s = stepAircraft(s, c, DT);
    t += DT;
    if (onStep?.(s, t)) break;
  }
  return s;
}

const level = (over: Partial<AircraftState> = {}) =>
  ({ ...initialAircraft(START, 8000, 90, 100), ...over }) satisfies AircraftState;
const hold = (s: AircraftState): AircraftControls => ({
  bankCmdDeg: 0,
  vsCmdFpm: 0,
  iasCmdKt: s.iasKt,
});

describe('true airspeed', () => {
  it('is IAS plus 2% per 1000 ft', () => {
    expect(tasKt(100, 0)).toBe(100);
    expect(tasKt(100, 8000)).toBeCloseTo(116, 6);
  });
});

describe('turns', () => {
  it.each([90, 100, 120])('a standard-rate 360° turn at %s KIAS takes 120 s ±2 s', (ias) => {
    let s = level({ iasKt: ias });
    const bank = standardRateBankDeg(tasKt(ias, s.altitudeFt));
    let turned = 0;
    let prev = s.headingTrueDeg;
    let time = 0;
    run(s, { ...hold(s), bankCmdDeg: bank }, 200, (next, t) => {
      turned += signedAngleDiff(next.headingTrueDeg, prev);
      prev = next.headingTrueDeg;
      s = next;
      time = t;
      return turned >= 360;
    });
    expect(time).toBeGreaterThan(118);
    expect(time).toBeLessThan(122);
  });

  it('bank is limited to standard rate (and never more than 25°)', () => {
    const s = run(level(), { ...hold(level()), bankCmdDeg: 60 }, 10);
    expect(s.bankDeg).toBeCloseTo(standardRateBankDeg(tasKt(100, 8000)), 6);
    expect(standardRateBankDeg(400)).toBe(25);
  });

  it('bank ramps in over about 2 s', () => {
    const s0 = level();
    const target = standardRateBankDeg(tasKt(100, 8000));
    const after1 = run(s0, { ...hold(s0), bankCmdDeg: target }, 1);
    expect(after1.bankDeg).toBeGreaterThan(target * 0.4);
    expect(after1.bankDeg).toBeLessThan(target * 0.7);
    const after2 = run(s0, { ...hold(s0), bankCmdDeg: target }, 2.5);
    expect(after2.bankDeg).toBeCloseTo(target, 6);
  });

  it('negative bank turns left', () => {
    const s = run(level(), { ...hold(level()), bankCmdDeg: -15 }, 10);
    expect(signedAngleDiff(s.headingTrueDeg, 90)).toBeLessThan(-20);
  });
});

describe('vertical speed', () => {
  it('is limited to −1500…+1000 fpm', () => {
    expect(run(level(), { ...hold(level()), vsCmdFpm: 3000 }, 20).vsFpm).toBe(1000);
    expect(run(level(), { ...hold(level()), vsCmdFpm: -3000 }, 20).vsFpm).toBe(-1500);
  });

  it('reaches a commanded 1000 fpm within 5 s and climbs', () => {
    let reached = 0;
    const s = run(level(), { ...hold(level()), vsCmdFpm: 1000 }, 60, (n, t) => {
      if (!reached && n.vsFpm === 1000) reached = t;
    });
    expect(reached).toBeGreaterThan(0);
    expect(reached).toBeLessThan(5);
    expect(s.altitudeFt).toBeGreaterThan(8000 + 900);
    expect(s.altitudeFt).toBeLessThan(8000 + 1000);
  });
});

describe('airspeed', () => {
  it('changes at 2 kt/s and holds the power selector range 90–120 KIAS', () => {
    const s10 = run(level(), { ...hold(level()), iasCmdKt: 120 }, 5);
    expect(s10.iasKt).toBeCloseTo(110, 6);
    expect(run(level(), { ...hold(level()), iasCmdKt: 150 }, 60).iasKt).toBe(120);
    expect(run(level(), { ...hold(level()), iasCmdKt: 50 }, 60).iasKt).toBe(90);
  });
});

describe('position', () => {
  it.each([0, 45, 90, 180, 263, 350])(
    'flies true heading %s° at TAS (within 0.1% and 0.05°)',
    (hdg) => {
      const s0 = level({ headingTrueDeg: hdg });
      const s = run(s0, hold(s0), 120);
      const expectedNm = (tasKt(100, 8000) * 120) / 3600;
      const g = inverse(START, s.position);
      expect(Math.abs(g.distanceM / 1852 - expectedNm) / expectedNm).toBeLessThan(0.001);
      expect(Math.abs(signedAngleDiff(g.initialBearingDeg, hdg))).toBeLessThan(0.05);
      const want = destination(START, hdg, expectedNm);
      expect(inverse(want, s.position).distanceM).toBeLessThan(10);
    },
  );
});
