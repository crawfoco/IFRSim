import { describe, expect, it } from 'vitest';
import kcfo from '../../src/procedures/kcfo-ils26.json';
import { checkAgainstNavdata, resolveFixDef } from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { nav } from '../sim/helpers';

const clone = () => structuredClone(kcfo) as Record<string, unknown> & typeof kcfo;

describe('procedure schema', () => {
  it('accepts the KCFO encoding and fills defaults', () => {
    const p = parseProcedure(kcfo);
    expect(p.id).toBe('kcfo-ils26');
    expect(p.transitions[0]!.noPT).toBe(false);
    expect(p.starts.map((s) => s.id)).toEqual([
      'over-fqf',
      'join-feeder',
      'direct-skipi',
      'vectors-final',
    ]);
  });

  it('rejects an unknown leg type with the path to it', () => {
    const bad = clone();
    (bad.missed as unknown[]).push({ type: 'teleport', to: 'SKIPI' });
    expect(() => parseProcedure(bad, 'bad.json')).toThrow(/bad\.json is invalid[\s\S]*missed\[4\]/);
  });

  it('rejects a reference to an undefined fix', () => {
    const bad = clone();
    bad.approach[0]!.faf = 'NOWHERE';
    expect(() => parseProcedure(bad)).toThrow(/unknown fix "NOWHERE"[\s\S]*approach\[0\]\.faf/);
  });

  it('rejects a start on an unknown transition', () => {
    const bad = clone();
    bad.starts[0]!.transition = 'ghost';
    expect(() => parseProcedure(bad)).toThrow(/unknown transition "ghost"/);
  });

  it('rejects a hold with both leg time and leg distance', () => {
    const bad = clone();
    Object.assign(bad.missed[3]!, { legNm: 4 });
    expect(() => parseProcedure(bad)).toThrow(/exactly one of legMinutes or legNm/);
  });

  it('rejects out-of-range values and unknown keys', () => {
    const bad = clone();
    bad.starts[0]!.iasKt = 160;
    expect(() => parseProcedure(bad)).toThrow(/starts\[0\]\.iasKt/);
    const extra = clone();
    Object.assign(extra.fixes.SKIPI, { altitude: 7200 });
    expect(() => parseProcedure(extra)).toThrow(/altitude/);
  });

  it('requires a final approach leg', () => {
    const bad = clone();
    bad.approach = [{ type: 'climb', toAltFt: 7000 }] as unknown as typeof bad.approach;
    expect(() => parseProcedure(bad)).toThrow(/approach has no final leg/);
  });
});

describe('navdata cross-check', () => {
  const p = parseProcedure(kcfo);
  const ctx = { navdata: nav, procedure: p };

  it('KCFO has no issues', () => {
    expect(checkAgainstNavdata(p, nav)).toEqual([]);
  });

  it('reports unknown navaids and fixes far from the FAA position', () => {
    const bad = parseProcedure({
      ...clone(),
      navaids: ['I-FTG', 'XYZ'],
      fixes: {
        ...kcfo.fixes,
        SKIPI: { def: { kind: 'locDme', loc: 'I-FTG', dmeNm: 7.3 }, faaId: 'SKIPI' },
      },
    });
    const issues = checkAgainstNavdata(bad, nav);
    expect(issues.map((i) => i.path)).toEqual(['navaids[1]', 'fixes.SKIPI']);
    expect(issues[1]!.message).toMatch(/0\.\d\d NM from FAA SKIPI/);
  });

  it('SKIPI is both I-FTG 7 DME and FQF R-045 at 11 NM, as charted', () => {
    const byLoc = resolveFixDef({ kind: 'locDme', loc: 'I-FTG', dmeNm: 7 }, ctx);
    const byVor = resolveFixDef(
      { kind: 'radialDme', navaid: 'FQF', radialMag: 45, dmeNm: 11 },
      ctx,
    );
    expect(distanceNm(byLoc, byVor)).toBeLessThan(0.1);
  });

  it('the LOC-only MAP (I-FTG 1.7) is at the threshold, the VDP 1.1–1.3 NM before it', () => {
    const map = resolveFixDef({ kind: 'locDme', loc: 'I-FTG', dmeNm: 1.7 }, ctx);
    const vdp = resolveFixDef({ kind: 'locDme', loc: 'I-FTG', dmeNm: 2.9 }, ctx);
    const thr = resolveFixDef({ kind: 'threshold' }, ctx);
    expect(distanceNm(map, thr)).toBeLessThan(0.15);
    expect(distanceNm(vdp, thr)).toBeGreaterThan(1.0);
    expect(distanceNm(vdp, thr)).toBeLessThan(1.3);
  });
});

describe('DME source per leg', () => {
  const p = parseProcedure(kcfo);
  it('is inferred from the fixes when not given', async () => {
    const { expectedDmeSource } = await import('../../src/procedures/resolve');
    const final = p.approach[0]!;
    expect(expectedDmeSource(final, p)).toBe('I-FTG');
    expect(expectedDmeSource(p.transitions[0]!.legs[0]!, p)).toBe('I-FTG'); // SKIPI is I-FTG 7
    expect(expectedDmeSource({ type: 'climb', toAltFt: 6100 }, p)).toBeNull();
    expect(expectedDmeSource({ ...final, dme: 'FQF' } as typeof final, p)).toBe('FQF');
  });
});
