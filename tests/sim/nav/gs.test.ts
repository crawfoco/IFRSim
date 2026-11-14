import { describe, expect, it } from 'vitest';
import { destination, distanceNm } from '../../../src/sim/geo/geodesy';
import { glidePathFor, gsIndication } from '../../../src/sim/nav/gs';
import { localizer, locOutboundTrue, runwayEnd } from '../helpers';

const FT_PER_NM = 6076.115;

describe('glide path', () => {
  const rwy = runwayEnd('CFO', '26');
  const gp = glidePathFor(localizer('I-FTG'), rwy, 50);
  const outbound = locOutboundTrue('I-FTG');

  it('crosses the threshold at the TCH', () => {
    const ind = gsIndication({ position: rwy.threshold, altitudeFt: rwy.elevationFt + 50 }, gp);
    expect(Math.abs(ind.verticalErrorFt)).toBeLessThan(1);
    expect(Math.abs(ind.offsetDeg)).toBeLessThan(0.05);
  });

  it('is centred at the 3° height 5 NM out (with earth curvature)', () => {
    const p = destination(gp.gpi, outbound, 5);
    const dFt = distanceNm(gp.gpi, p) * FT_PER_NM;
    const curvatureFt = (dFt * dFt) / (2 * 20_902_231);
    // On a straight 3° beam the aircraft must be higher by the earth's drop, d²/2R.
    const onPath = gp.elevationFt + dFt * Math.tan((3 * Math.PI) / 180) + curvatureFt;
    const ind = gsIndication({ position: p, altitudeFt: onPath }, gp);
    expect(ind.flag).toBe(false);
    expect(Math.abs(ind.deviationDeg)).toBeLessThan(0.02);
  });

  it('pointer says fly up when low, fly down when high; full scale ±0.7°', () => {
    const p = destination(gp.gpi, outbound, 5);
    const low = gsIndication({ position: p, altitudeFt: gp.elevationFt + 1200 }, gp);
    expect(low.deviationDeg).toBeGreaterThan(0);
    expect(low.verticalErrorFt).toBeGreaterThan(0);
    const high = gsIndication({ position: p, altitudeFt: gp.elevationFt + 2000 }, gp);
    expect(high.deviationDeg).toBeLessThan(0);
    const wayLow = gsIndication({ position: p, altitudeFt: gp.elevationFt + 300 }, gp);
    expect(wayLow.deviationDeg).toBe(0.7);
  });

  it('flags beyond 10 NM and outside ±8° of the course', () => {
    const far = destination(gp.gpi, outbound, 10.5);
    expect(gsIndication({ position: far, altitudeFt: 9000 }, gp).flag).toBe(true);
    const wide = destination(gp.gpi, outbound + 9, 5);
    expect(gsIndication({ position: wide, altitudeFt: 7000 }, gp).flag).toBe(true);
  });

  it('uses the displaced threshold when there is one (KGXY 35)', () => {
    const gxy = runwayEnd('GXY', '35');
    const gp2 = glidePathFor(localizer('I-DCI'), gxy, 51);
    const disp = gxy.displacedThreshold!;
    const ind = gsIndication({ position: disp.position, altitudeFt: disp.elevationFt + 51 }, gp2);
    expect(Math.abs(ind.verticalErrorFt)).toBeLessThan(1);
  });
});
