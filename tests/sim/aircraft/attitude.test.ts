/** V2: display pitch (the sim has no pitch) and the airspeed trend for the glass PFD. */
import { describe, expect, it } from 'vitest';
import { displayPitchDeg, speedTrendKt } from '../../../src/sim/aircraft/attitude';

describe('displayPitchDeg', () => {
  it('level flight shows the nominal angle of attack: 4° at 80 kt, 2° at 110 kt', () => {
    expect(displayPitchDeg(0, 85, 80)).toBeCloseTo(4, 6);
    expect(displayPitchDeg(0, 120, 110)).toBeCloseTo(2, 6);
    expect(displayPitchDeg(0, 100, 95)).toBeCloseTo(3, 6);
  });

  it('adds the flight-path angle from VS and TAS', () => {
    // 100 kt TAS, −530 fpm ≈ −3° path; at 95 KIAS the nominal AoA is 3° → about 0°.
    expect(displayPitchDeg(-530, 100, 95)).toBeCloseTo(0, 1);
    // +1000 fpm at 100 kt TAS ≈ +5.6°, plus 3°.
    expect(displayPitchDeg(1000, 100, 95)).toBeCloseTo(8.6, 1);
  });

  it('nominal AoA is held at the 80–110 kt limits; pitch is clamped to ±20°', () => {
    expect(displayPitchDeg(0, 60, 60)).toBeCloseTo(4, 6);
    expect(displayPitchDeg(0, 150, 150)).toBeCloseTo(2, 6);
    expect(displayPitchDeg(5000, 30, 80)).toBe(20);
    expect(displayPitchDeg(-5000, 30, 80)).toBe(-20);
  });

  it('copes with zero TAS', () => {
    expect(Number.isFinite(displayPitchDeg(-500, 0, 80))).toBe(true);
  });
});

describe('speedTrendKt', () => {
  it('is the change expected in 6 s at 2 kt/s toward the target', () => {
    expect(speedTrendKt(90, 100)).toBe(10);
    expect(speedTrendKt(100, 80)).toBe(-12);
    expect(speedTrendKt(80, 110)).toBe(12);
  });

  it('is zero when within 1 kt of the target', () => {
    expect(speedTrendKt(99.5, 100)).toBe(0);
    expect(speedTrendKt(100, 100)).toBe(0);
  });
});
