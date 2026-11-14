import { describe, expect, it } from 'vitest';
import {
  dmsToDeg,
  magToTrue,
  normalize360,
  reciprocal,
  signedAngleDiff,
  trueToMag,
} from '../../../src/sim/geo/angles';

describe('normalize360', () => {
  it.each([
    [0, 0],
    [360, 0],
    [-10, 350],
    [725, 5],
    [359.999, 359.999],
  ])('%d → %d', (input, expected) => {
    expect(normalize360(input)).toBeCloseTo(expected, 9);
  });
});

describe('signedAngleDiff(a, b) = a − b wrapped to (−180, 180]', () => {
  it.each([
    [10, 350, 20],
    [350, 10, -20],
    [90, 90, 0],
    [180, 0, 180],
    [0, 180, 180],
    [263, 83, 180],
    [45, 225.5, -180.5 + 360],
  ])('(%d, %d) → %d', (a, b, expected) => {
    expect(signedAngleDiff(a, b)).toBeCloseTo(expected, 9);
  });
});

describe('reciprocal', () => {
  it('flips a course', () => {
    expect(reciprocal(263)).toBe(83);
    expect(reciprocal(83)).toBe(263);
    expect(reciprocal(180)).toBe(0);
  });
});

describe('magnetic variation (east positive)', () => {
  it('true = magnetic + east variation', () => {
    expect(magToTrue(263, 8)).toBe(271);
    expect(trueToMag(271, 8)).toBe(263);
  });

  it('handles west variation and wraps', () => {
    expect(magToTrue(5, -10)).toBe(355);
    expect(trueToMag(355, -10)).toBe(5);
  });
});

describe('dmsToDeg', () => {
  it('converts the chart reference point for KCFO (39°47′N 104°32′W)', () => {
    expect(dmsToDeg(39, 47, 0, 'N')).toBeCloseTo(39.783333, 6);
    expect(dmsToDeg(104, 32, 0, 'W')).toBeCloseTo(-104.533333, 6);
  });
});
