/**
 * Track overlay on the plate (prototype, KCFO): the plate's plan view is fitted to the sim's
 * geography from a few anchor points (scale, rotation and offset). The plan view of an FAA plate
 * is drawn to scale (holds and course reversals are schematic).
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, PROCEDURES, RNAV_PROCEDURES, procedureById } from '../../src/procedures';
import { buildScenario } from '../../src/sim/scenario/scenario';
import { fitPlate, PLATE_CALIBRATION } from '../../src/ui/chart/overlay';

const kcfo = buildScenario(procedureById('kcfo-ils26')!, NAVDATA, {
  startId: 'vectors-final',
  ceiling: 'above',
  gsOutOfService: false,
});

describe('KCFO plate fit', () => {
  const fit = fitPlate(PLATE_CALIBRATION['kcfo-ils26']!, kcfo);

  it('is to scale and north-up', () => {
    expect(fit.scalePxPerNm).toBeGreaterThan(18);
    expect(fit.scalePxPerNm).toBeLessThan(21);
    expect(Math.abs(fit.rotationDeg)).toBeLessThan(1);
  });

  it('every anchor is within 5 px (about 0.25 NM) of the fit', () => {
    expect(fit.residuals.length).toBeGreaterThanOrEqual(4);
    for (const r of fit.residuals) expect(r.px, r.name).toBeLessThan(5);
  });

  it('maps FQF onto the VORTAC symbol on the plate', () => {
    const [x, y] = fit.toPx(kcfo.fixes['FQF']!);
    expect(Math.hypot(x - 219, y - 542)).toBeLessThan(5);
  });

  it('a point 11 NM along FQF R-045 lands on SKIPI', () => {
    const [x, y] = fit.toPx(kcfo.fixes['SKIPI']!);
    expect(Math.hypot(x - 395, y - 423)).toBeLessThan(5);
  });
});

describe('every calibrated plate', () => {
  for (const [id, cal] of Object.entries(PLATE_CALIBRATION)) {
    it(`${id}: to scale, north-up, every anchor within 5 px; insets inside the plan view`, () => {
      const p = procedureById(id)!;
      const sc = buildScenario(p, NAVDATA, {
        startId: p.starts[0]!.id,
        ceiling: 'above',
        gsOutOfService: false,
      });
      const fit = fitPlate(cal, sc);
      expect(fit.scalePxPerNm).toBeGreaterThan(15);
      expect(fit.scalePxPerNm).toBeLessThan(25);
      expect(Math.abs(fit.rotationDeg)).toBeLessThan(1);
      for (const r of fit.residuals) expect(r.px, r.name).toBeLessThan(5);
      const a = cal.planArea;
      for (const i of cal.insets ?? []) {
        expect(i.x).toBeGreaterThanOrEqual(a.x);
        expect(i.y).toBeGreaterThanOrEqual(a.y);
        expect(i.x + i.w).toBeLessThanOrEqual(a.x + a.w);
        expect(i.y + i.h).toBeLessThanOrEqual(a.y + a.h);
      }
    });
  }
});

describe('calibrations', () => {
  it('only name procedures that exist, with at least four anchors', () => {
    for (const [id, cal] of Object.entries(PLATE_CALIBRATION)) {
      expect(
        [...PROCEDURES, ...RNAV_PROCEDURES].some((p) => p.id === id),
        id,
      ).toBe(true);
      expect(cal.anchors.length).toBeGreaterThanOrEqual(4);
    }
  });
});
