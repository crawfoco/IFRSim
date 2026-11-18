/**
 * KCYS ILS or LOC RWY 27 (AL-80, Amdt 36). Schema, navdata cross-check, and golden receiver
 * readings at every charted fix. I-CYS 110.1 (course 265°, own DME), CYS 113.1, GLL 114.2.
 */
import { describe, expect, it } from 'vitest';
import json from '../../src/procedures/kcys-ils27.json';
import { checkAgainstNavdata, resolveFixDef } from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { buildWorld } from '../../src/sim/world';
import { nav } from '../sim/helpers';
import { dmeAt, fixPositions, locAt, vorAt } from './golden';

const ICYS = 110.1;
const CYS = 113.1;
const GLL = 114.2;

const p = parseProcedure(json, 'kcys-ils27.json');
const world = buildWorld(nav, {
  magVarEastDeg: 10,
  tchFt: { 'I-CYS': 55 },
  expandedServiceVolumeNm: { 'I-CYS': 30 },
});
const pos = fixPositions(p);
const at = (fix: string, altitudeFt: number) => ({ position: pos[fix]!, altitudeFt });
const ctx = { navdata: nav, procedure: p };

describe('KCYS ILS or LOC RWY 27: encoding', () => {
  it('parses', () => {
    expect(p.id).toBe('kcys-ils27');
    expect(p.transitions.map((t) => [t.id, t.noPT])).toEqual([
      ['cys', false],
      ['egber', true],
      ['hamer', true],
    ]);
    expect(p.starts.map((s) => s.id)).toEqual([
      'over-cys',
      'direct-colla-southwest',
      'egber',
      'direct-hamer-south',
      'vectors-final',
    ]);
  });

  it('has no navdata issues', () => {
    expect(checkAgainstNavdata(p, nav)).toEqual([]);
  });

  it('COLLA is also CYS R-098 at 13 NM and on GLL R-350; HORSE is on CYS R-118', () => {
    const r098 = resolveFixDef({ kind: 'radialDme', navaid: 'CYS', radialMag: 98, dmeNm: 13 }, ctx);
    expect(distanceNm(pos.COLLA!, r098)).toBeLessThan(0.1);
    expect(vorAt(world, GLL, 350, at('COLLA', 7800)).deviationDeg).toBeCloseTo(0, 0);
    expect(Math.abs(vorAt(world, CYS, 118, at('HORSE', 7800)).deviationDeg)).toBeLessThan(1);
  });

  it('the segment distances match the chart (5.4, 7.8, 3.9 NM; 11.3 from EGBER)', () => {
    expect(distanceNm(pos.HAMER!, pos.COLLA!)).toBeCloseTo(5.4, 1);
    expect(distanceNm(pos.COLLA!, pos.HORSE!)).toBeCloseTo(7.8, 1);
    expect(distanceNm(pos.HORSE!, pos['I-CYS 2.7']!)).toBeCloseTo(3.9, 1);
    // 220° (5.5) and 265° (6.8): EGBER is 11.3 NM from COLLA in a straight line.
    expect(distanceNm(pos.EGBER!, pos.COLLA!)).toBeCloseTo(11.3, 0);
  });

  it('the LOC MAP (I-CYS 1.5) is at the displaced threshold', () => {
    expect(distanceNm(pos['I-CYS 1.5']!, pos.RW27!)).toBeLessThan(0.1);
  });

  it('the VDP (I-CYS 2.7) is where a 3° path from TCH 55 reaches the MDA (6560)', () => {
    const thrElevFt = 6099;
    const nmToMda = (6560 - thrElevFt - 55) / (Math.tan((3 * Math.PI) / 180) * 6076.1);
    expect(distanceNm(pos['I-CYS 2.7']!, pos.RW27!)).toBeCloseTo(nmToMda, 1);
  });
});

describe('KCYS ILS or LOC RWY 27: golden receiver readings', () => {
  it.each([
    // fix, altitude, navaid, OBS, TO/FROM
    ['COLLA', 8500, CYS, 98, 'FROM'],
    ['COLLA', 7800, GLL, 350, 'FROM'],
    ['HAMER', 7800, GLL, 350, 'FROM'],
    ['MARKL', 8000, CYS, 196, 'TO'], // TACAN missed-approach hold, inbound 196
  ] as const)('%s at %i: needle centred on %s with OBS %i %s', (fix, alt, freq, obs, toFrom) => {
    const ind = vorAt(world, freq, obs, at(fix, alt));
    expect(ind.flag).toBe(false);
    expect(ind.toFrom).toBe(toFrom);
    expect(Math.abs(ind.deviationDeg)).toBeLessThan(0.6);
  });

  it('EGBER at 7800: CYS reads R-081 (CYS 23.2 DME)', () => {
    const ind = vorAt(world, CYS, 81, at('EGBER', 7800));
    expect(ind.flag).toBe(false);
    expect(ind.toFrom).toBe('FROM');
    expect(Math.abs(ind.deviationDeg)).toBeLessThan(0.5);
  });

  it.each([
    ['COLLA', 7800],
    ['HORSE', 7800],
    ['I-CYS 2.7', 6560],
    ['I-CYS 1.5', 6560],
  ] as const)('%s at %i: localizer centred', (fix, alt) => {
    const { loc } = locAt(world, ICYS, at(fix, alt));
    expect(loc.flag).toBe(false);
    expect(loc.backCourse).toBe(false);
    expect(Math.abs(loc.deviationDeg)).toBeLessThan(0.05);
  });

  it.each([
    // fix, altitude, DME source, charted DME
    ['EGBER', 7800, CYS, 23.2],
    ['COLLA', 8500, CYS, 13],
    ['MARKL', 8000, CYS, 10],
    ['HAMER', 7800, GLL, 32.5],
    ['COLLA', 7800, ICYS, 14.5],
    ['HORSE', 7800, ICYS, 6.6],
    ['I-CYS 2.7', 6560, ICYS, 2.7],
    ['I-CYS 1.5', 6560, ICYS, 1.5],
  ] as const)('%s at %i: DME (%s) reads %s', (fix, alt, freq, dme) => {
    const reading = dmeAt(world, freq, at(fix, alt));
    expect(reading).not.toBeNull();
    expect(Math.abs(reading! - dme)).toBeLessThanOrEqual(0.1);
  });

  it('HORSE at the GS intercept altitude (7800): glideslope centred', () => {
    const { gs } = locAt(world, ICYS, at('HORSE', 7800));
    expect(gs).not.toBeNull();
    expect(gs!.flag).toBe(false);
    expect(Math.abs(gs!.deviationDeg)).toBeLessThan(0.1);
  });

  it('the EGBER route meets the localizer 6.8 NM before COLLA, inside its expanded service volume', () => {
    const join = resolveFixDef({ kind: 'locDme', loc: 'I-CYS', dmeNm: 14.5 + 6.8 }, ctx);
    const { loc } = locAt(world, ICYS, { position: join, altitudeFt: 7800 });
    expect(loc.flag).toBe(false);
    expect(Math.abs(loc.deviationDeg)).toBeLessThan(0.05);
  });
});
