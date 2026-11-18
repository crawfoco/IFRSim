import { describe, expect, it } from 'vitest';
import kcez from '../../src/procedures/kcez-vor21.json';
import { checkAgainstNavdata } from '../../src/procedures/resolve';
import { parseProcedure, type Procedure } from '../../src/procedures/schema';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { nav } from '../sim/helpers';
import { expectGolden, fixPosition, type GoldenFix } from './vorGolden';

const p = parseProcedure(kcez, 'kcez-vor21.json');
const CEZ_MHZ = 114.35;

describe('KCEZ VOR RWY 21 encoding', () => {
  it('parses, with the barbed procedure turn on R-350 at CEZ', () => {
    expect(p.transitions.map((t) => [t.id, t.noPT])).toEqual([['cez-pt', false]]);
    expect(p.transitions[0]!.legs).toHaveLength(1);
    expect(p.transitions[0]!.legs[0]).toMatchObject({
      type: 'procedureTurn',
      fix: 'CEZ',
      course: { navaid: 'CEZ', courseMag: 170, toFrom: 'TO' },
      outboundCourseMag: 350,
      barbHeadingMag: 305,
      inboundCourseMag: 170,
      side: 'L',
      maxDistanceNm: 10,
      minAltFt: 9800,
      inboundMinAltFt: 8000,
    });
    expect(p.starts.map((s) => s.id)).toEqual([
      'vectors-final',
      'direct-cez-south',
      'direct-cez-north',
      'direct-cez-west',
    ]);
  });

  it('has no navdata issues', () => {
    expect(checkAgainstNavdata(p, nav)).toEqual([]);
  });

  it('CEZ is 114.35, channel 90Y, with DME', () => {
    const v = nav.navaids.CEZ!;
    expect(v.freqMHz).toBe(CEZ_MHZ);
    expect(v.dmeChannel).toBe('90Y');
    expect(v.type).toBe('VOR/DME');
  });

  it('runway 21: TDZE 5913, airport elevation 5918, TCH 50', () => {
    const rwy = nav.runwayEnds.find((r) => r.airport === 'CEZ' && r.runway === '21')!;
    expect(Math.round(rwy.tdzeFt)).toBe(5913);
    expect(Math.round(nav.airports.KCEZ!.elevationFt)).toBe(5918);
    expect(rwy.vgsiTchFt).toBe(50);
  });

  it('final is flown FROM CEZ on R-196 at 8000, MAP by DME or timing (5.5 NM)', () => {
    const final = p.approach.find((l) => l.type === 'final')!;
    if (final.type !== 'final') throw new Error('no final');
    expect(final.faf).toBe('CEZ');
    expect(final.fafAltFt).toBe(8000);
    expect(final.course).toEqual({ navaid: 'CEZ', courseMag: 196, toFrom: 'FROM' });
    expect(final.descentAngle).toEqual({ angleDeg: 3.49, tchFt: 50 });
    expect(final.stepDowns).toEqual([]);
    // Each row is 5.5 NM at that groundspeed, to the printed second.
    for (const t of final.map.timing!)
      expect(Math.abs((5.5 / t.groundspeedKt) * 3600 - t.seconds)).toBeLessThan(1);
  });

  it('the MAP (CEZ 5.5) is at the runway 21 threshold', () => {
    expect(distanceNm(fixPosition(p, 'CEZ 5.5'), fixPosition(p, 'RW21'))).toBeLessThan(0.15);
  });

  it('S-21 minimums: MDA 6660, 1 SM (A) and 1¼ SM (B); missed to 9800 and the CEZ hold', () => {
    expect(p.minimums).toEqual([
      {
        kind: 'VOR',
        label: 'S-21',
        A: { altFt: 6660, visibilitySm: 1 },
        B: { altFt: 6660, visibilitySm: 1.25 },
      },
    ]);
    expect(p.missed).toMatchObject([
      { type: 'direct', to: 'CEZ', turn: 'R', climbToFt: 9800 },
      { type: 'hold', fix: 'CEZ', inboundCourseMag: 170, turn: 'R', legMinutes: 1, minAltFt: 9800 },
    ]);
  });
});

describe('KCEZ golden receiver readings', () => {
  // The procedure turn's outbound radial and the inbound course: points on CEZ R-350.
  const withPtPoints: Procedure = {
    ...p,
    fixes: {
      ...p.fixes,
      'CEZ R-350/10': { def: { kind: 'radialDme', navaid: 'CEZ', radialMag: 350, dmeNm: 10 } },
      'CEZ R-350/5': { def: { kind: 'radialDme', navaid: 'CEZ', radialMag: 350, dmeNm: 5 } },
    },
  };
  const cases: GoldenFix[] = [
    // PT limit (10 NM) and the inbound course: OBS 350 reads FROM, OBS 170 reads TO.
    { fix: 'CEZ R-350/10', obs: 350, toFrom: 'FROM', dme: 10, altFt: 9800 },
    { fix: 'CEZ R-350/5', obs: 170, toFrom: 'TO', dme: 5, altFt: 8000 },
    // Final: FROM the station on R-196 to the MAP at 5.5 DME.
    { fix: 'CEZ 5.5', obs: 196, toFrom: 'FROM', dme: 5.5, altFt: 6660 },
  ];
  it.each(cases)('$fix: OBS $obs $toFrom centred, DME $dme', (g) =>
    expectGolden(withPtPoints, CEZ_MHZ, g),
  );
});
