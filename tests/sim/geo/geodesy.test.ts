import { describe, expect, it } from 'vitest';
import { dmsToDeg } from '../../../src/sim/geo/angles';
import {
  METRES_PER_NM,
  destination,
  distanceNm,
  initialBearingTrueDeg,
  inverse,
} from '../../../src/sim/geo/geodesy';

// Geoscience Australia's published Vincenty worked example (WGS84/GRS80-equivalent at mm level):
// Flinders Peak → Buninyong, s = 54 972.271 m, az1→2 = 306°52′05.37″, az2→1 = 127°10′25.07″.
const flindersPeak = {
  latDeg: dmsToDeg(37, 57, 3.7203, 'S'),
  lonDeg: dmsToDeg(144, 25, 29.5244, 'E'),
};
const buninyong = {
  latDeg: dmsToDeg(37, 39, 10.1561, 'S'),
  lonDeg: dmsToDeg(143, 55, 35.3839, 'E'),
};
const S_METRES = 54_972.271;
const AZ12 = dmsToDeg(306, 52, 5.37, 'N');
const AZ21 = dmsToDeg(127, 10, 25.07, 'N');

const ARC_SECOND = 1 / 3600;

describe('inverse geodesic (Vincenty, WGS84)', () => {
  it('matches the Flinders Peak → Buninyong distance to the millimetre', () => {
    const { distanceM } = inverse(flindersPeak, buninyong);
    expect(Math.abs(distanceM - S_METRES)).toBeLessThan(0.005);
  });

  it('matches both azimuths to 0.01″', () => {
    expect(Math.abs(initialBearingTrueDeg(flindersPeak, buninyong) - AZ12)).toBeLessThan(
      0.01 * ARC_SECOND,
    );
    expect(Math.abs(initialBearingTrueDeg(buninyong, flindersPeak) - AZ21)).toBeLessThan(
      0.01 * ARC_SECOND,
    );
  });

  it('returns zero for coincident points', () => {
    expect(distanceNm(flindersPeak, flindersPeak)).toBe(0);
  });

  it('one nautical mile is one minute of latitude only approximately (ellipsoid)', () => {
    // At 45°N one minute of latitude is ≈ 1852.2 m, close to the NM definition.
    const a = { latDeg: 45, lonDeg: -105 };
    const b = { latDeg: 45 + 1 / 60, lonDeg: -105 };
    expect(inverse(a, b).distanceM).toBeCloseTo(1852.2, 0);
    expect(initialBearingTrueDeg(a, b)).toBeCloseTo(0, 9);
  });

  it('due east at the equator is 90° and 1° is 111.32 km', () => {
    const a = { latDeg: 0, lonDeg: 0 };
    const b = { latDeg: 0, lonDeg: 1 };
    expect(initialBearingTrueDeg(a, b)).toBeCloseTo(90, 9);
    expect(inverse(a, b).distanceM).toBeCloseTo(111_319.491, 2);
  });
});

describe('direct geodesic (Vincenty, WGS84)', () => {
  it('reaches Buninyong from Flinders Peak to within 1 mm', () => {
    const p = destination(flindersPeak, AZ12, S_METRES / METRES_PER_NM);
    const back = inverse(p, buninyong).distanceM;
    expect(back).toBeLessThan(0.001);
  });

  it('round-trips with the inverse over approach-sized distances', () => {
    const origin = { latDeg: 39.7833, lonDeg: -104.5333 };
    for (const bearing of [0, 45, 83, 179.9, 263, 300]) {
      for (const nm of [0.5, 7, 17.5, 30]) {
        const p = destination(origin, bearing, nm);
        expect(distanceNm(origin, p)).toBeCloseTo(nm, 9);
        expect(initialBearingTrueDeg(origin, p)).toBeCloseTo(bearing, 7);
      }
    }
  });

  it('zero distance returns the start point', () => {
    const origin = { latDeg: 40.4, lonDeg: -104.6 };
    const p = destination(origin, 123, 0);
    expect(p.latDeg).toBeCloseTo(origin.latDeg, 12);
    expect(p.lonDeg).toBeCloseTo(origin.lonDeg, 12);
  });
});
