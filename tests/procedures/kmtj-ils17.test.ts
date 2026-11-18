/**
 * T24: KMTJ ILS or LOC RWY 17 (AL-668, Amdt 3A). Schema, navdata cross-check, and golden
 * receiver readings at every charted fix. I-MTJ 111.3 (course 168°) has no DME of its own:
 * DME comes from the MTJ VOR/DME (117.1), so the DME source must be NAV2.
 */
import { describe, expect, it } from 'vitest';
import json from '../../src/procedures/kmtj-ils17.json';
import {
  checkAgainstNavdata,
  expectedDmeSource,
  resolveFixDef,
} from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { buildWorld } from '../../src/sim/world';
import { nav } from '../sim/helpers';
import { dmeAt, fixPositions, locAt, vorAt } from './golden';

const IMTJ = 111.3;
const MTJ = 117.1;
const JNC = 112.4;

const p = parseProcedure(json, 'kmtj-ils17.json');
const world = buildWorld(nav, { magVarEastDeg: 12, tchFt: { 'I-MTJ': 56 } });
const pos = fixPositions(p);
const at = (fix: string, altitudeFt: number) => ({ position: pos[fix]!, altitudeFt });

describe('KMTJ ILS or LOC RWY 17: encoding', () => {
  it('parses', () => {
    expect(p.id).toBe('kmtj-ils17');
    expect(p.transitions.map((t) => [t.id, t.noPT])).toEqual([
      ['haqhy', true],
      ['pagre', true],
      ['mtj', false],
    ]);
    expect(p.starts.map((s) => s.id)).toEqual([
      'haqhy',
      'direct-haqhy',
      'pagre-arc',
      'vectors-final',
      'over-mtj',
      'direct-bruuk',
    ]);
    expect(p.missed.at(-1)).toMatchObject({ type: 'hold', fix: 'PAGRE', climbInHold: true });
  });

  it('has no navdata issues', () => {
    expect(checkAgainstNavdata(p, nav)).toEqual([]);
  });

  it('BRUUK is also MTJ R-349 at 14.8 DME and JNC R-098 at 46 DME, as charted', () => {
    const ctx = { navdata: nav, procedure: p };
    const r349 = resolveFixDef(
      { kind: 'radialDme', navaid: 'MTJ', radialMag: 349, dmeNm: 14.8 },
      ctx,
    );
    const jnc = resolveFixDef({ kind: 'radialDme', navaid: 'JNC', radialMag: 98, dmeNm: 46 }, ctx);
    expect(distanceNm(pos.BRUUK!, r349)).toBeLessThan(0.1);
    // JNC R-098 is a whole-degree rounding of R-098.3: 0.3° at 46 NM is about 0.26 NM.
    expect(distanceNm(pos.BRUUK!, jnc)).toBeLessThan(0.3);
  });

  it('the segment distances match the profile view (6, 4.1, 2.4, 0.9 NM)', () => {
    expect(distanceNm(pos.BRUUK!, pos.WIDRU!)).toBeCloseTo(6, 1);
    expect(distanceNm(pos.WIDRU!, pos.ZIMVI!)).toBeCloseTo(4.1, 1);
    expect(distanceNm(pos.ZIMVI!, pos['MTJ 2.3']!)).toBeCloseTo(2.4, 1);
    expect(distanceNm(pos['MTJ 2.3']!, pos['MTJ 1.4']!)).toBeCloseTo(0.9, 1);
  });
});

describe('KMTJ ILS or LOC RWY 17: golden receiver readings', () => {
  it.each([
    // fix, altitude, station, OBS, TO/FROM
    ['HAQHY', 9400, JNC, 98, 'FROM'],
    ['PAGRE', 11000, MTJ, 297, 'FROM'],
    ['PAGRE', 11000, MTJ, 117, 'TO'], // inbound leg of the missed-approach hold
    ['BRUUK', 9400, MTJ, 349, 'FROM'],
  ] as const)('%s at %i: needle (%s) centred with OBS %i %s', (fix, alt, freq, obs, toFrom) => {
    const ind = vorAt(world, freq, obs, at(fix, alt));
    expect(ind.flag).toBe(false);
    expect(ind.toFrom).toBe(toFrom);
    expect(Math.abs(ind.deviationDeg)).toBeLessThan(0.5);
  });

  it('the JNC R-098 feeder is usable to BRUUK (46 DME) with the expanded service volume', () => {
    // JNC's standard service volume ends at 40 NM; the charted feeder implies an ESV.
    const position = resolveFixDef(
      { kind: 'radialDme', navaid: 'JNC', radialMag: 98, dmeNm: 45 },
      { navdata: nav, procedure: p },
    );
    const ac = { position, altitudeFt: 9400 };
    expect(vorAt(world, JNC, 98, ac).flag).toBe(true); // standard volume only
    const esv = buildWorld(nav, {
      magVarEastDeg: 12,
      expandedServiceVolumeNm: p.expandedServiceVolumeNm!,
    });
    const ind = vorAt(esv, JNC, 98, ac);
    expect(ind).toMatchObject({ flag: false, toFrom: 'FROM' });
    expect(Math.abs(ind.deviationDeg)).toBeLessThan(0.5);
  });

  it('the PT is flown at 12500, inbound at 9400; DME on the final comes from MTJ', () => {
    const pt = p.transitions.find((t) => t.id === 'mtj')!.legs.at(-1)!;
    expect(pt).toMatchObject({ type: 'procedureTurn', minAltFt: 12500, inboundMinAltFt: 9400 });
    const final = p.approach.find((l) => l.type === 'final')!;
    expect(expectedDmeSource(final, p)).toBe('MTJ');
  });

  it.each([
    ['BRUUK', 9400],
    ['WIDRU', 8100],
    ['ZIMVI', 6800],
    ['MTJ 2.3', 6020],
    ['MTJ 1.4', 6020],
  ] as const)('%s at %i: localizer centred', (fix, alt) => {
    const { loc } = locAt(world, IMTJ, at(fix, alt));
    expect(loc.flag).toBe(false);
    expect(loc.backCourse).toBe(false);
    expect(Math.abs(loc.deviationDeg)).toBeLessThan(0.05);
  });

  it.each([
    // fix, altitude, DME source, charted DME
    ['HAQHY', 9400, JNC, 36],
    ['PAGRE', 11000, MTJ, 14.8],
    ['BRUUK', 9400, MTJ, 14.8],
    ['WIDRU', 8100, MTJ, 8.8],
    ['ZIMVI', 6800, MTJ, 4.7],
    ['MTJ 2.3', 6020, MTJ, 2.3],
    ['MTJ 1.4', 6020, MTJ, 1.4],
  ] as const)('%s at %i: DME (%s) reads %s', (fix, alt, freq, dme) => {
    const reading = dmeAt(world, freq, at(fix, alt));
    expect(reading).not.toBeNull();
    expect(Math.abs(reading! - dme)).toBeLessThanOrEqual(0.1);
  });

  it('with the DME source on NAV1 (I-MTJ) there is no DME reading', () => {
    expect(dmeAt(world, IMTJ, at('WIDRU', 8100))).toBeNull();
  });

  it('WIDRU at the GS intercept altitude (8100): glideslope centred', () => {
    const { gs } = locAt(world, IMTJ, at('WIDRU', 8100));
    expect(gs).not.toBeNull();
    expect(gs!.flag).toBe(false);
    expect(Math.abs(gs!.deviationDeg)).toBeLessThan(0.1);
  });

  it('on the MTJ 14.8 arc, mid-way and at the lead radial, DME reads 14.8', () => {
    for (const radialMag of [320, 341]) {
      const position = resolveFixDef(
        { kind: 'radialDme', navaid: 'MTJ', radialMag, dmeNm: 14.8 },
        { navdata: nav, procedure: p },
      );
      const ac = { position, altitudeFt: 9400 };
      expect(Math.abs(dmeAt(world, MTJ, ac)! - 14.8)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(vorAt(world, MTJ, radialMag, ac).deviationDeg)).toBeLessThan(0.1);
    }
  });
});
