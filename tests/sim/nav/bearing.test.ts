/** V2: bearing-pointer data. Magnetic bearing to a tuned VOR (station declination). */
import { describe, expect, it } from 'vitest';
import { normalize360 } from '../../../src/sim/geo/angles';
import { bearingToStationMagDeg, bearingInfo } from '../../../src/sim/nav/bearing';
import { readNav } from '../../../src/sim/nav/radios';
import { buildWorld } from '../../../src/sim/world';
import { nav, navaid, onLocalizer, onRadial } from '../helpers';

const W = buildWorld(nav, { magVarEastDeg: 8 });
const at = (position: ReturnType<typeof onRadial>, altitudeFt = 8000) => ({
  position,
  altitudeFt,
});

describe('bearingToStationMagDeg', () => {
  // On a radial, the bearing to the station is the reciprocal of the radial.
  for (const [id, radial, dist] of [
    ['FQF', 45, 11],
    ['FQF', 200, 20],
    ['GLL', 136, 16],
    ['AKO', 290, 8],
    ['LAR', 10, 18],
    ['MTJ', 300, 14.8],
  ] as const) {
    it(`${id} R-${radial} at ${dist} NM → ${normalize360(radial + 180)}°`, () => {
      const ac = at(onRadial(id, radial, dist), navaid(id).elevationFt + 6000);
      const r = readNav(W, navaid(id).freqMHz, 0, ac);
      const brg = bearingToStationMagDeg(r, ac, W);
      expect(brg).not.toBeNull();
      const err = Math.abs(((brg! - normalize360(radial + 180) + 540) % 360) - 180);
      expect(err).toBeLessThan(0.1);
    });
  }

  it('is null for a localizer (no bearing)', () => {
    const ac = at(onLocalizer('I-FTG', 10));
    const r = readNav(W, 109.3, 263, ac);
    expect(r.station?.kind).toBe('LOC');
    expect(bearingToStationMagDeg(r, ac, W)).toBeNull();
  });

  it('is null with nothing tuned or out of range', () => {
    const ac = at(onRadial('FQF', 45, 11));
    expect(bearingToStationMagDeg(readNav(W, 108.0, 0, ac), ac, W)).toBeNull();
    const far = at(onRadial('FQF', 45, 150), 3000);
    expect(bearingToStationMagDeg(readNav(W, navaid('FQF').freqMHz, 0, far), far, W)).toBeNull();
  });
});

describe('bearingInfo (the info box)', () => {
  it('VOR in range: source, ident, bearing and DME', () => {
    const ac = at(onRadial('FQF', 45, 11));
    const info = bearingInfo('NAV1', readNav(W, navaid('FQF').freqMHz, 0, ac), ac, W);
    expect(info.source).toBe('NAV1');
    expect(info.ident).toBe('FQF');
    expect(info.bearingMagDeg).toBeCloseTo(225, 0);
    expect(info.dmeNm).toBeGreaterThan(10.9);
    expect(info.dmeNm).toBeLessThan(11.3);
  });

  it('localizer: NO BRG (bearing null), ident still shown', () => {
    const ac = at(onLocalizer('I-FTG', 10));
    const info = bearingInfo('NAV2', readNav(W, 109.3, 263, ac), ac, W);
    expect(info).toMatchObject({ source: 'NAV2', ident: 'I-FTG', bearingMagDeg: null });
  });

  it('nothing received: frequency only', () => {
    const ac = at(onRadial('FQF', 45, 11));
    const info = bearingInfo('NAV2', readNav(W, 108.0, 0, ac), ac, W);
    expect(info).toMatchObject({
      source: 'NAV2',
      freqMHz: 108.0,
      ident: null,
      bearingMagDeg: null,
      dmeNm: null,
    });
  });
});
