/**
 * T23: KGXY ILS or LOC RWY 35 (AL-325, Amdt 3A). Schema, navdata cross-check, and golden
 * receiver readings at every charted fix. I-DCI 110.3 (course 350°, own DME), GLL 114.2.
 */
import { describe, expect, it } from 'vitest';
import json from '../../src/procedures/kgxy-ils35.json';
import { checkAgainstNavdata, resolveFixDef } from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { buildWorld } from '../../src/sim/world';
import { nav } from '../sim/helpers';
import { dmeAt, fixPositions, locAt, vorAt } from './golden';

const IDCI = 110.3;
const GLL = 114.2;

const p = parseProcedure(json, 'kgxy-ils35.json');
const world = buildWorld(nav, { magVarEastDeg: 8, tchFt: { 'I-DCI': 51 } });
const pos = fixPositions(p);
const at = (fix: string, altitudeFt: number) => ({ position: pos[fix]!, altitudeFt });

describe('KGXY ILS or LOC RWY 35: encoding', () => {
  it('parses', () => {
    expect(p.id).toBe('kgxy-ils35');
    expect(p.transitions.map((t) => [t.id, t.noPT])).toEqual([
      ['wavdi', true],
      ['gll', false],
    ]);
    expect(p.starts.map((s) => s.id)).toEqual(['wavdi-arc', 'over-gll', 'vectors-final']);
  });

  it('has no navdata issues', () => {
    expect(checkAgainstNavdata(p, nav)).toEqual([]);
  });

  it('WELDS is both I-DCI 14.5 DME and GLL R-177 at 17.5 DME, as charted', () => {
    const ctx = { navdata: nav, procedure: p };
    const byVor = resolveFixDef(
      { kind: 'radialDme', navaid: 'GLL', radialMag: 177, dmeNm: 17.5 },
      ctx,
    );
    expect(distanceNm(pos.WELDS!, byVor)).toBeLessThan(0.1);
  });

  it('the segment distances match the profile view (6.9, 3.9, 0.8 NM)', () => {
    expect(distanceNm(pos.WELDS!, pos.BUFFS!)).toBeCloseTo(6.9, 1);
    expect(distanceNm(pos.BUFFS!, pos.ARTSS!)).toBeCloseTo(3.9, 1);
    expect(distanceNm(pos.ARTSS!, pos['I-DCI 2.9']!)).toBeCloseTo(0.8, 1);
  });

  it('the LOC MAP (I-DCI 1.6) is near the displaced threshold, before the runway', () => {
    const d = distanceNm(pos['I-DCI 1.6']!, pos.RW35!);
    expect(d).toBeLessThan(0.3);
  });
});

describe('KGXY ILS or LOC RWY 35: golden receiver readings', () => {
  it.each([
    // fix, altitude, OBS, TO/FROM
    ['WAVDI', 7000, 136, 'FROM'],
    ['CEDUK', 7000, 136, 'FROM'],
    ['CEDUK', 7000, 316, 'TO'], // inbound leg of the missed-approach hold
    ['WELDS', 7000, 177, 'FROM'],
  ] as const)('%s at %i: GLL needle centred with OBS %i %s', (fix, alt, obs, toFrom) => {
    const ind = vorAt(world, GLL, obs, at(fix, alt));
    expect(ind.flag).toBe(false);
    expect(ind.toFrom).toBe(toFrom);
    expect(Math.abs(ind.deviationDeg)).toBeLessThan(0.5);
  });

  it.each([
    ['WELDS', 7000],
    ['BUFFS', 6600],
    ['ARTSS', 5360],
    ['I-DCI 2.9', 5100],
    ['I-DCI 1.6', 5100],
  ] as const)('%s at %i: localizer centred', (fix, alt) => {
    const { loc } = locAt(world, IDCI, at(fix, alt));
    expect(loc.flag).toBe(false);
    expect(loc.backCourse).toBe(false);
    expect(Math.abs(loc.deviationDeg)).toBeLessThan(0.05);
  });

  it.each([
    // fix, altitude, DME source, charted DME
    ['WAVDI', 7000, GLL, 17.5],
    ['CEDUK', 7000, GLL, 16],
    ['WELDS', 7000, GLL, 17.5],
    ['WELDS', 7000, IDCI, 14.5],
    ['BUFFS', 6600, IDCI, 7.6],
    ['ARTSS', 5360, IDCI, 3.7],
    ['I-DCI 2.9', 5100, IDCI, 2.9],
    ['I-DCI 1.6', 5100, IDCI, 1.6],
  ] as const)('%s at %i: DME (%s) reads %s', (fix, alt, freq, dme) => {
    const reading = dmeAt(world, freq, at(fix, alt));
    expect(reading).not.toBeNull();
    expect(Math.abs(reading! - dme)).toBeLessThanOrEqual(0.1);
  });

  it('BUFFS at the GS intercept altitude (6600): glideslope centred', () => {
    const { gs } = locAt(world, IDCI, at('BUFFS', 6600));
    expect(gs).not.toBeNull();
    expect(gs!.flag).toBe(false);
    // 0.1° is a seventh of full scale, about 70 ft at BUFFS.
    expect(Math.abs(gs!.deviationDeg)).toBeLessThan(0.1);
  });

  it('on the GLL 17.5 arc, mid-way and at the lead radial, DME reads 17.5', () => {
    for (const radialMag of [156, 170]) {
      const position = resolveFixDef(
        { kind: 'radialDme', navaid: 'GLL', radialMag, dmeNm: 17.5 },
        { navdata: nav, procedure: p },
      );
      const ac = { position, altitudeFt: 7000 };
      expect(Math.abs(dmeAt(world, GLL, ac)! - 17.5)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(vorAt(world, GLL, radialMag, ac).deviationDeg)).toBeLessThan(0.1);
    }
  });
});
