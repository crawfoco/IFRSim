import { describe, expect, it } from 'vitest';
import kskx from '../../src/procedures/kskx-vordme-b.json';
import { checkAgainstNavdata } from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import { isCirclingOnly } from '../../src/sim/scenario/scenario';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { nav } from '../sim/helpers';
import { expectGolden, fixPosition, type GoldenFix } from './vorGolden';

const p = parseProcedure(kskx, 'kskx-vordme-b.json');
const TAS_MHZ = 115.8;

describe('KSKX VOR/DME-B encoding', () => {
  it('parses: hold-in-lieu at TAS, NoPT only from R-353', () => {
    expect(p.transitions.map((t) => [t.id, t.noPT])).toEqual([
      ['tas-hold', false],
      ['r296', false],
      ['r353', true],
    ]);
    const hold = p.transitions[0]!.legs[0]!;
    expect(hold).toMatchObject({
      type: 'hold',
      fix: 'TAS',
      inboundCourseMag: 116,
      turn: 'R',
      legMinutes: 1,
      minAltFt: 12000,
    });
    expect(p.transitions[2]!.legs[0]).toMatchObject({
      type: 'track',
      to: 'TAS',
      course: { navaid: 'TAS', courseMag: 173, toFrom: 'TO' },
    });
    expect(p.starts.map((s) => s.id)).toEqual([
      'r353',
      'r296',
      'direct-tas-southwest',
      'direct-tas-east',
    ]);
  });

  it('has no navdata issues', () => {
    expect(checkAgainstNavdata(p, nav)).toEqual([]);
  });

  it('final 116° FROM TAS: 10000 to RESOY (8 DME), MAP ZUTRI (14.3 DME)', () => {
    expect(p.approach[0]).toMatchObject({ type: 'track', to: 'RESOY', minAltFt: 10000 });
    const final = p.approach.find((l) => l.type === 'final')!;
    if (final.type !== 'final') throw new Error('no final');
    expect(final).toMatchObject({
      faf: 'RESOY',
      course: { navaid: 'TAS', courseMag: 116, toFrom: 'FROM' },
      fafAltFt: 10000,
      stepDowns: [],
      map: { fix: 'ZUTRI' },
    });
    expect(final.descentAngle).toBeUndefined();
    expect(distanceNm(fixPosition(p, 'RESOY'), fixPosition(p, 'ZUTRI'))).toBeCloseTo(6.3, 1);
  });

  it('circling only: A and B 8000-1¼; runway 13 is the landing runway', () => {
    expect(isCirclingOnly(p)).toBe(true);
    expect(p.minimums).toEqual([
      {
        kind: 'CIRCLING',
        label: 'CIRCLING',
        A: { altFt: 8000, visibilitySm: 1.25 },
        B: { altFt: 8000, visibilitySm: 1.25 },
      },
    ]);
    expect(p.runway).toBe('13');
    // ZUTRI lies next to the airport, abeam the runway 13 threshold (not on its centreline).
    expect(distanceNm(fixPosition(p, 'ZUTRI'), fixPosition(p, 'RW13'))).toBeLessThan(0.6);
  });

  it('missed: climbing right turn to 12000 direct TAS and hold (same racetrack)', () => {
    expect(p.missed).toEqual([
      { type: 'direct', to: 'TAS', turn: 'R', climbToFt: 12000 },
      {
        type: 'hold',
        fix: 'TAS',
        inboundCourseMag: 116,
        course: { navaid: 'TAS', courseMag: 116, toFrom: 'TO' },
        turn: 'R',
        legMinutes: 1,
        minAltFt: 12000,
      },
    ]);
  });
});

describe('KSKX golden receiver readings', () => {
  const cases: GoldenFix[] = [
    // On the 116° final FROM TAS (the NASR fixes lie on R-115.5; charted radials are whole degrees).
    { fix: 'RESOY', obs: 116, toFrom: 'FROM', dme: 8, altFt: 10000, tolDeg: 0.6 },
    { fix: 'ZUTRI', obs: 116, toFrom: 'FROM', dme: 14.3, altFt: 8000, tolDeg: 0.6 },
    { fix: 'RESOY', obs: 296, toFrom: 'TO', dme: 8, altFt: 10000, tolDeg: 0.6 },
  ];
  it.each(cases)('$fix: OBS $obs $toFrom centred, DME $dme', (g) => expectGolden(p, TAS_MHZ, g));
});
