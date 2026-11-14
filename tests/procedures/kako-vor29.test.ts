import { describe, expect, it } from 'vitest';
import kako from '../../src/procedures/kako-vor29.json';
import { checkAgainstNavdata } from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { nav } from '../sim/helpers';
import { expectGolden, fixPosition, type GoldenFix } from './vorGolden';

const p = parseProcedure(kako, 'kako-vor29.json');
const AKO_MHZ = 114.4;

describe('KAKO VOR RWY 29 encoding', () => {
  it('parses, with the arcs NoPT and the procedure turn from AKO', () => {
    expect(p.transitions.map((t) => [t.id, t.noPT])).toEqual([
      ['ako-pt', false],
      ['north-arc', true],
      ['south-arc', true],
    ]);
    const pt = p.transitions[0]!.legs[0]!;
    expect(pt).toMatchObject({
      type: 'procedureTurn',
      fix: 'AKO',
      outboundCourseMag: 110,
      barbHeadingMag: 65,
      inboundCourseMag: 290,
      side: 'L',
      maxDistanceNm: 10,
      minAltFt: 6000,
    });
    expect(p.starts.map((s) => s.id)).toEqual(['direct-ako', 'north-arc', 'south-arc']);
  });

  it('has no navdata issues', () => {
    expect(checkAgainstNavdata(p, nav)).toEqual([]);
  });

  it('final is flown FROM AKO, MAP by DME or timing (1.7 NM)', () => {
    const final = p.approach.find((l) => l.type === 'final')!;
    if (final.type !== 'final') throw new Error('no final');
    expect(final.faf).toBe('AKO');
    expect(final.course).toEqual({ navaid: 'AKO', courseMag: 289, toFrom: 'FROM' });
    const timing = final.map.timing!;
    // Each row is 1.7 NM at that groundspeed, to the printed second.
    for (const t of timing)
      expect(Math.abs((1.7 / t.groundspeedKt) * 3600 - t.seconds)).toBeLessThan(1);
  });

  it('the MAP (AKO 1.7) is at the runway 29 threshold', () => {
    expect(distanceNm(fixPosition(p, 'AKO 1.7'), fixPosition(p, 'RW29'))).toBeLessThan(0.15);
  });
});

describe('KAKO golden receiver readings', () => {
  const cases: GoldenFix[] = [
    // Arc IAFs: on the charted radial, OBS set to the radial reads FROM.
    { fix: 'AKO R-050/10', obs: 50, toFrom: 'FROM', dme: 10, altFt: 6000 },
    { fix: 'AKO R-170/10', obs: 170, toFrom: 'FROM', dme: 10, altFt: 6000 },
    // GERON: inbound 290° TO AKO (the NASR fix is on R-110.3; charted radials are whole degrees).
    { fix: 'GERON', obs: 290, toFrom: 'TO', dme: 10, altFt: 6000, tolDeg: 0.35 },
    // Final: FROM the station on R-289.
    { fix: 'AKO 1.7', obs: 289, toFrom: 'FROM', dme: 1.7, altFt: 5120 },
  ];
  it.each(cases)('$fix: OBS $obs $toFrom centred, DME $dme', (g) => expectGolden(p, AKO_MHZ, g));
});
