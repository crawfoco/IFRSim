import { describe, expect, it } from 'vitest';
import { dmeSlantRangeNm } from '../../../src/sim/nav/dme';
import { distanceNm } from '../../../src/sim/geo/geodesy';
import { navaid, onRadial } from '../helpers';

const FT_PER_NM = 6076.115;

describe('dmeSlantRangeNm', () => {
  it('is slant range from the DME antenna', () => {
    const fqf = navaid('FQF');
    const antenna = { position: fqf.dmePosition ?? fqf.position, elevationFt: fqf.elevationFt };
    const p = onRadial('FQF', 45, 11);
    const ground = distanceNm(antenna.position, p);
    const dh = 9000 - fqf.elevationFt;
    const got = dmeSlantRangeNm({ position: p, altitudeFt: 9000 }, antenna, 40);
    expect(got).not.toBeNull();
    // Flat-earth slant range; the receiver adds earth curvature (under 0.001 NM here).
    expect(Math.abs(got! - Math.hypot(ground, dh / FT_PER_NM))).toBeLessThan(0.002);
    expect(got! - ground).toBeGreaterThan(0.005);
  });

  it('reads height above the station when overhead', () => {
    const gll = navaid('GLL');
    const antenna = { position: gll.position, elevationFt: gll.elevationFt };
    const got = dmeSlantRangeNm(
      { position: gll.position, altitudeFt: gll.elevationFt + FT_PER_NM },
      antenna,
      40,
    );
    expect(got).toBeCloseTo(1, 6);
  });

  it('returns null out of range', () => {
    const gll = navaid('GLL');
    const antenna = { position: gll.position, elevationFt: gll.elevationFt };
    expect(
      dmeSlantRangeNm({ position: onRadial('GLL', 0, 45), altitudeFt: 9000 }, antenna, 40),
    ).toBeNull();
  });
});
