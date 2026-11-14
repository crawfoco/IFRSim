import { describe, expect, it } from 'vitest';
import { vorIndication, vorServiceRangeNm } from '../../../src/sim/nav/vor';
import { nav, navaid, onRadial } from '../helpers';

const ALT = 9000;
const at = (id: string, radial: number, dist: number, alt = ALT) => ({
  position: onRadial(id, radial, dist),
  altitudeFt: alt,
});

describe('vorIndication', () => {
  it('FQF R-045 at 11 DME: centred FROM with OBS 045', () => {
    const ind = vorIndication(at('FQF', 45, 11), navaid('FQF'), 45);
    expect(ind.flag).toBe(false);
    expect(ind.toFrom).toBe('FROM');
    expect(Math.abs(ind.deviationDeg)).toBeLessThan(0.1);
    expect(ind.radialMagDeg).toBeCloseTo(45, 1);
  });

  it('same point with OBS 225: centred TO', () => {
    const ind = vorIndication(at('FQF', 45, 11), navaid('FQF'), 225);
    expect(ind.toFrom).toBe('TO');
    expect(Math.abs(ind.deviationDeg)).toBeLessThan(0.1);
  });

  it.each([
    // [radial, obs, expected needle]: + = course is to the right
    [45, 50, 5], // FROM: outbound on 050 while on R-045, the course lies right
    [45, 40, -5],
    [45, 230, -5], // TO 230 (inbound on R-050) from R-045: the course lies left
    [45, 220, 5],
    [45, 75, 10], // beyond full scale: pegged
    [45, 195, 10],
  ])('R-%s, OBS %s: needle %s°', (radial, obs, needle) => {
    const ind = vorIndication(at('GLL', radial, 15), navaid('GLL'), obs);
    expect(ind.deviationDeg).toBeCloseTo(needle, 1);
  });

  it('keeps the unclamped offset and ground distance for the autopilot', () => {
    const ind = vorIndication(at('GLL', 45, 15), navaid('GLL'), 75);
    expect(ind.offsetDeg).toBeCloseTo(30, 1);
    expect(ind.distanceNm).toBeCloseTo(15, 3);
  });

  it('every V1 VOR is centred on its own radials (station declination)', () => {
    for (const id of Object.keys(nav.navaids)) {
      for (const radial of [0, 90, 136, 270, 315]) {
        const ind = vorIndication(at(id, radial, 10), navaid(id), radial);
        expect(Math.abs(ind.deviationDeg), `${id} R-${radial}`).toBeLessThan(0.1);
        expect(ind.toFrom).toBe('FROM');
      }
    }
  });

  it('flags beyond the service volume', () => {
    // LAR is a Low VOR (40 NM); GLL is High (40 NM below 14,500 ft AGL).
    expect(vorIndication(at('LAR', 100, 41), navaid('LAR'), 100).flag).toBe(true);
    const off = vorIndication(at('GLL', 100, 41), navaid('GLL'), 100);
    expect(off).toMatchObject({ flag: true, toFrom: 'OFF', deviationDeg: 0 });
  });

  it('flags abeam the station (to/from ambiguity)', () => {
    const ind = vorIndication(at('GLL', 90, 10), navaid('GLL'), 0);
    expect(ind).toMatchObject({ flag: true, toFrom: 'OFF' });
  });

  it('flags in the cone of confusion overhead', () => {
    expect(vorIndication(at('GLL', 90, 0.3), navaid('GLL'), 90).flag).toBe(true);
    expect(vorIndication(at('GLL', 90, 2), navaid('GLL'), 90).flag).toBe(false);
  });
});

describe('vorServiceRangeNm', () => {
  it.each([
    ['T', 5000, 25],
    ['L', 5000, 40],
    ['H', 5000, 40],
    ['H', 15000, 100],
  ] as const)('%s at %s ft AGL: %s NM', (sv, agl, nm) => {
    expect(vorServiceRangeNm(sv, agl)).toBe(nm);
  });
});
