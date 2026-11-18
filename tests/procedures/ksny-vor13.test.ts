import { describe, expect, it } from 'vitest';
import ksny from '../../src/procedures/ksny-vor13.json';
import { checkAgainstNavdata } from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { nav } from '../sim/helpers';
import { expectGolden, fixPosition, type GoldenFix } from './vorGolden';

const p = parseProcedure(ksny, 'ksny-vor13.json');
const SNY_MHZ = 115.9;

describe('KSNY VOR/DME RWY 13 encoding', () => {
  it('parses, with the arcs NoPT and the procedure turn at CHAKO', () => {
    expect(p.transitions.map((t) => [t.id, t.noPT])).toEqual([
      ['sny-pt', false],
      ['riyop-arc', true],
      ['ogjun-arc', true],
    ]);
    expect(p.transitions[0]!.legs[1]).toMatchObject({
      type: 'procedureTurn',
      fix: 'CHAKO',
      outboundCourseMag: 310,
      barbHeadingMag: 265,
      inboundCourseMag: 130,
      side: 'L',
      maxDistanceNm: 10,
      minAltFt: 6200,
    });
    expect(p.starts.map((s) => s.id)).toEqual([
      'riyop-arc',
      'ogjun-arc',
      'direct-sny',
      'direct-sny-northeast',
    ]);
  });

  it('has no navdata issues', () => {
    expect(checkAgainstNavdata(p, nav)).toEqual([]);
  });

  it('final from CHAKO at 5800, VDP SNY 1.9, MAP JIKUT; missed holds at SNY', () => {
    const final = p.approach[0]!;
    expect(final).toMatchObject({
      type: 'final',
      faf: 'CHAKO',
      fafAltFt: 5800,
      vdp: 'SNY 1.9',
      map: { fix: 'JIKUT' },
    });
    expect(p.missed.map((l) => l.type)).toEqual(['climb', 'direct', 'hold']);
    expect(p.missed[2]).toMatchObject({
      fix: 'SNY',
      inboundCourseMag: 130,
      turn: 'R',
      minAltFt: 6200,
    });
  });

  it('JIKUT is at the runway 13 threshold, the VDP 1.1 NM before it', () => {
    const thr = fixPosition(p, 'RW13');
    expect(distanceNm(fixPosition(p, 'JIKUT'), thr)).toBeLessThan(0.1);
    expect(distanceNm(fixPosition(p, 'SNY 1.9'), thr)).toBeCloseTo(1.1, 1);
  });
});

describe('KSNY golden receiver readings', () => {
  const cases: GoldenFix[] = [
    { fix: 'RIYOP', obs: 78, toFrom: 'FROM', dme: 11, altFt: 6200, tolDeg: 0.15 },
    { fix: 'OGJUN', obs: 202, toFrom: 'FROM', dme: 11, altFt: 6200, tolDeg: 0.25 },
    { fix: 'JUNAD', obs: 130, toFrom: 'TO', dme: 11, altFt: 5800 },
    { fix: 'CHAKO', obs: 130, toFrom: 'TO', dme: 5, altFt: 5800 },
    { fix: 'SNY 1.9', obs: 130, toFrom: 'TO', dme: 1.9, altFt: 4700 },
    { fix: 'JIKUT', obs: 130, toFrom: 'TO', dme: 0.8, altFt: 4700 },
  ];
  it.each(cases)('$fix: OBS $obs $toFrom centred, DME $dme', (g) => expectGolden(p, SNY_MHZ, g));
});
