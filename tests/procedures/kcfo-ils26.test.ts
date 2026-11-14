/**
 * Golden receiver tests for KCFO ILS or LOC RWY 26: what the needles and DME read at
 * every charted fix and start position.
 */
import { describe, expect, it } from 'vitest';
import kcfo from '../../src/procedures/kcfo-ils26.json';
import { resolveFixDef, resolveFixes } from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import { GS_FULL_SCALE_DEG } from '../../src/sim/nav/gs';
import { readDme, readNav } from '../../src/sim/nav/radios';
import { buildWorld } from '../../src/sim/world';
import { nav } from '../sim/helpers';

const p = parseProcedure(kcfo);
const W = buildWorld(nav, { magVarEastDeg: 8 });
const fixes = resolveFixes(p, nav);
const at = (name: string, altitudeFt: number) => ({ position: fixes[name]!, altitudeFt });

describe('KCFO ILS 26 fixes', () => {
  it('SKIPI (FAF, 7200): LOC centred, GS centred, I-FTG 7.0 DME', () => {
    const ac = at('SKIPI', 7200);
    const r = readNav(W, 109.3, 263, ac);
    expect(r.ident).toBe('I-FTG');
    expect(r.indication!.flag).toBe(false);
    expect(Math.abs(r.indication!.deviationDeg)).toBeLessThan(0.05);
    // Glideslope intercept altitude at the FAF: within a tenth of full scale.
    expect(Math.abs(r.gs!.deviationDeg)).toBeLessThan(GS_FULL_SCALE_DEG / 10);
    expect(readDme(r.station, ac)).toBeCloseTo(7, 1);
  });

  it('SKIPI on the feeder: FQF R-045 centred FROM, 11 DME', () => {
    const ac = at('SKIPI', 8000);
    const r = readNav(W, 116.3, 45, ac);
    expect(r.indication).toMatchObject({ kind: 'VOR', flag: false, toFrom: 'FROM' });
    expect(Math.abs(r.indication!.deviationDeg)).toBeLessThan(0.5);
    expect(readDme(r.station, ac)).toBeCloseTo(11, 0);
  });

  it('VDP and MAP read their charted DME on the localizer', () => {
    for (const [name, dme] of [
      ['I-FTG 2.9', 2.9],
      ['I-FTG 1.7', 1.7],
    ] as const) {
      const ac = at(name, 5900);
      const r = readNav(W, 109.3, 263, ac);
      expect(Math.abs(r.indication!.deviationDeg)).toBeLessThan(0.05);
      expect(Math.abs(readDme(r.station, ac)! - dme)).toBeLessThan(0.1);
    }
  });

  it('LOC MDA 5900 at the VDP is on a normal descent path (within ±1 dot of the GS)', () => {
    const r = readNav(W, 109.3, 263, at('I-FTG 2.9', 5900));
    expect(Math.abs(r.gs!.deviationDeg)).toBeLessThan(GS_FULL_SCALE_DEG / 2);
  });
});

describe('KCFO start conditions', () => {
  const ctx = { navdata: nav, procedure: p };
  const pos = (id: string) => resolveFixDef(p.starts.find((s) => s.id === id)!.position, ctx);

  it('over FQF: the VOR is directly below (flagged)', () => {
    const r = readNav(W, 116.3, 45, { position: pos('over-fqf'), altitudeFt: 8000 });
    expect(r.indication!.flag).toBe(true);
  });

  it('join-feeder: R-090 at 6 NM, east of R-045 (needle left when set to 045)', () => {
    const r = readNav(W, 116.3, 45, { position: pos('join-feeder'), altitudeFt: 8000 });
    expect(r.indication).toMatchObject({ flag: false, toFrom: 'FROM' });
    expect(r.indication!.deviationDeg).toBeLessThan(-9);
  });

  it('vectors-final: 16 NM out, south of the localizer, outside LOC coverage', () => {
    const r = readNav(W, 109.3, 263, { position: pos('vectors-final'), altitudeFt: 8000 });
    expect(r.indication!.flag).toBe(true);
    expect(r.indication!.offsetDeg).toBeGreaterThan(10);
  });
});
