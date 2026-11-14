import { describe, expect, it } from 'vitest';
import { locIndication } from '../../../src/sim/nav/loc';
import { localizer, onLocalizer } from '../helpers';

const at = (locId: string, dist: number, offset = 0, alt = 8000) => ({
  position: onLocalizer(locId, dist, offset),
  altitudeFt: alt,
});

describe('locIndication', () => {
  it('is centred on the I-FTG final', () => {
    const ind = locIndication(at('I-FTG', 7), localizer('I-FTG'));
    expect(ind.flag).toBe(false);
    expect(ind.backCourse).toBe(false);
    expect(Math.abs(ind.deviationDeg)).toBeLessThan(0.1);
  });

  it('needle points toward the course; full scale is ±2.5°', () => {
    // Left of course from an inbound pilot's view: fly right, so the needle is right.
    const l = localizer('I-FTG');
    expect(locIndication(at('I-FTG', 7, 1), l).deviationDeg).toBeCloseTo(1, 2);
    expect(locIndication(at('I-FTG', 7, -1.5), l).deviationDeg).toBeCloseTo(-1.5, 2);
    expect(locIndication(at('I-FTG', 7, 6), l).deviationDeg).toBe(2.5);
    expect(locIndication(at('I-FTG', 7, 6), l).offsetDeg).toBeCloseTo(6, 2);
  });

  it('works for every V1 localizer', () => {
    for (const id of ['I-FTG', 'I-DCI', 'I-MTJ']) {
      expect(Math.abs(locIndication(at(id, 10), localizer(id)).deviationDeg), id).toBeLessThan(0.1);
      expect(locIndication(at(id, 10, 1), localizer(id)).deviationDeg, id).toBeCloseTo(1, 2);
    }
  });

  it('coverage: ±10° to 18 NM, ±35° to 10 NM', () => {
    const l = localizer('I-DCI');
    expect(locIndication(at('I-DCI', 17.5, 9), l).flag).toBe(false);
    expect(locIndication(at('I-DCI', 18.5, 0), l).flag).toBe(true);
    expect(locIndication(at('I-DCI', 9.5, 30), l).flag).toBe(false);
    expect(locIndication(at('I-DCI', 12, 30), l).flag).toBe(true);
    expect(locIndication(at('I-DCI', 5, 40), l).flag).toBe(true);
  });

  it('flags the back course', () => {
    const ind = locIndication(at('I-FTG', 5, 180), localizer('I-FTG'));
    expect(ind).toMatchObject({ flag: true, backCourse: true, deviationDeg: 0 });
  });
});
