import { describe, expect, it } from 'vitest';
import klar from '../../src/procedures/klar-vor30.json';
import { checkAgainstNavdata } from '../../src/procedures/resolve';
import { parseProcedure } from '../../src/procedures/schema';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { readNav } from '../../src/sim/nav/radios';
import type { VorIndication } from '../../src/sim/nav/vor';
import { buildWorld } from '../../src/sim/world';
import { nav } from '../sim/helpers';
import { expectGolden, fixPosition, type GoldenFix } from './vorGolden';

const p = parseProcedure(klar, 'klar-vor30.json');
const LAR_MHZ = 117.6;

describe('KLAR VOR/DME RWY 30 encoding', () => {
  it('parses, with the arcs and FLEMS NoPT and the procedure turn at ECECU', () => {
    expect(p.transitions.map((t) => [t.id, t.noPT])).toEqual([
      ['lar-pt', false],
      ['povoh-arc', true],
      ['jesar-arc', true],
      ['flems', true],
    ]);
    expect(p.transitions[0]!.legs[1]).toMatchObject({
      type: 'procedureTurn',
      fix: 'ECECU',
      outboundCourseMag: 112,
      barbHeadingMag: 67,
      inboundCourseMag: 292,
      side: 'L',
      maxDistanceNm: 10,
      minAltFt: 10600,
    });
    expect(p.transitions[3]!.legs[0]).toMatchObject({ type: 'heading', headingMag: 337 });
    expect(p.starts.map((s) => s.id)).toEqual(['direct-lar', 'povoh-arc', 'flems']);
  });

  it('has no navdata issues', () => {
    expect(checkAgainstNavdata(p, nav)).toEqual([]);
  });

  it('step-downs DUCBE 10200, HEMBI (FAF) 9900, GARBE 8220; VDP LAR 4; MAP LAR 3.1', () => {
    expect(p.approach.slice(0, 2).map((l) => l.type === 'track' && [l.to, l.minAltFt])).toEqual([
      ['DUCBE', 10200],
      ['HEMBI', 9900],
    ]);
    const final = p.approach[2]!;
    if (final.type !== 'final') throw new Error('no final');
    expect(final).toMatchObject({
      faf: 'HEMBI',
      fafAltFt: 9900,
      vdp: 'LAR 4',
      map: { fix: 'LAR 3.1' },
    });
    expect(final.stepDowns).toEqual([{ fix: 'GARBE', minAltFt: 8220 }]);
  });

  it('missed approach holds at LAR with climb-in-hold to 9600', () => {
    expect(p.missed.at(-1)).toMatchObject({
      type: 'hold',
      fix: 'LAR',
      inboundCourseMag: 125,
      turn: 'L',
      climbInHold: true,
      minAltFt: 9600,
    });
  });

  it('the MAP (LAR 3.1) is at the runway 30 threshold', () => {
    expect(distanceNm(fixPosition(p, 'LAR 3.1'), fixPosition(p, 'RW30'))).toBeLessThan(0.15);
  });

  it('the FLEMS heading 337° leg reaches DMYIH in 5.1 NM', () => {
    const d = distanceNm(fixPosition(p, 'FLEMS'), fixPosition(p, 'DMYIH'));
    expect(Math.abs(d - 5.1)).toBeLessThan(0.1);
  });
});

describe('KLAR golden receiver readings', () => {
  // The NASR fixes on the final lie on R-111.6; with the charted OBS 292 the needle is
  // within 0.5° of centre (a twentieth of full scale).
  const cases: GoldenFix[] = [
    { fix: 'POVOH', obs: 55, toFrom: 'FROM', dme: 18, altFt: 10600 },
    { fix: 'JESAR', obs: 86, toFrom: 'FROM', dme: 18, altFt: 10600, tolDeg: 0.3 },
    { fix: 'FLEMS', obs: 119, toFrom: 'FROM', dme: 28.8, altFt: 10600, tolDeg: 0.2 },
    { fix: 'DMYIH', obs: 292, toFrom: 'TO', dme: 25, altFt: 10600, tolDeg: 0.5 },
    { fix: 'ECECU', obs: 292, toFrom: 'TO', dme: 18, altFt: 10600, tolDeg: 0.5 },
    { fix: 'DUCBE', obs: 292, toFrom: 'TO', dme: 14.1, altFt: 10200, tolDeg: 0.5 },
    { fix: 'HEMBI', obs: 292, toFrom: 'TO', dme: 11.2, altFt: 9900, tolDeg: 0.5 },
    { fix: 'GARBE', obs: 292, toFrom: 'TO', dme: 6, altFt: 8220, tolDeg: 0.5 },
    { fix: 'LAR 4', obs: 292, toFrom: 'TO', dme: 4, altFt: 7600, tolDeg: 0.5 },
    { fix: 'LAR 3.1', obs: 292, toFrom: 'TO', dme: 3.1, altFt: 7600, tolDeg: 0.5 },
  ];
  it.each(cases)('$fix: OBS $obs $toFrom centred, DME $dme', (g) => expectGolden(p, LAR_MHZ, g));

  it('every final-course fix is on R-111.6 to within 0.1°', () => {
    const world = buildWorld(nav, { magVarEastDeg: 13 });
    for (const fix of ['DMYIH', 'ECECU', 'DUCBE', 'HEMBI', 'GARBE']) {
      const ind = readNav(world, LAR_MHZ, 292, { position: fixPosition(p, fix), altitudeFt: 10000 })
        .indication as VorIndication;
      expect(Math.abs(ind.radialMagDeg - 111.6), fix).toBeLessThan(0.1);
    }
  });
});
