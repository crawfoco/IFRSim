import { describe, expect, it } from 'vitest';
import { NAVDATA, RNAV_PROCEDURES } from '../../../src/procedures';
import { magToTrue, normalize360 } from '../../../src/sim/geo/angles';
import { destination } from '../../../src/sim/geo/geodesy';
import { rnavWaypoint } from '../../../src/sim/navdata/rnav';
import { briefing, buildScenario } from '../../../src/sim/scenario/scenario';
import { inArc, taaPosition } from '../../../src/sim/scenario/taa';

const koga = RNAV_PROCEDURES.find((p) => p.id === 'koga-rnav8')!;
const taa = koga.taa!;
const iaf = rnavWaypoint(NAVDATA, 'AHUFU');
/** A point `nm` from AHUFU from which the magnetic course to AHUFU is `courseTo`. */
const at = (courseTo: number, nm: number) =>
  destination(iaf.position, normalize360(magToTrue(courseTo, iaf.magVarEastDeg) + 180), nm);
const where = (courseTo: number, nm: number) =>
  taaPosition(taa, iaf.position, iaf.magVarEastDeg, at(courseTo, nm));

describe('inArc', () => {
  it('handles arcs across north', () => {
    expect(inArc(10, 353, 173)).toBe(true);
    expect(inArc(353, 353, 173)).toBe(true);
    expect(inArc(200, 353, 173)).toBe(false);
    expect(inArc(200, 173, 353)).toBe(true);
  });
});

describe('KOGA TAA areas and rings', () => {
  it('west of AHUFU (course 083 to it) is the straight-in area: 5700 out to 30 NM, 5300 within 6', () => {
    expect(where(83, 20)).toMatchObject({ area: { noPT: true }, ring: { minAltFt: 5700 } });
    expect(where(83, 5)).toMatchObject({ area: { noPT: true }, ring: { minAltFt: 5300 } });
  });

  it('east of AHUFU (course 263) is the course-reversal area: 5600, 5300 within 5 NM', () => {
    expect(where(263, 20)).toMatchObject({ area: { noPT: false }, ring: { minAltFt: 5600 } });
    expect(where(263, 5.5)).toMatchObject({ ring: { minAltFt: 5600 } });
    expect(where(263, 4)).toMatchObject({ ring: { minAltFt: 5300 } });
  });

  it('the boundary is the 173°/353° line', () => {
    expect(where(170, 10)?.area.noPT).toBe(true);
    expect(where(176, 10)?.area.noPT).toBe(false);
    expect(where(350, 10)?.area.noPT).toBe(false);
    expect(where(356, 10)?.area.noPT).toBe(true);
  });

  it('is null outside 30 NM', () => {
    expect(where(83, 31)).toBeNull();
  });
});

describe('KOGA briefing', () => {
  it('leaves the TAA areas to the plate (no TAA hints)', () => {
    const p = RNAV_PROCEDURES.find((x) => x.id === 'koga-rnav8')!;
    for (const st of p.starts) {
      const b = briefing(
        buildScenario(p, NAVDATA, { startId: st.id, ceiling: 'above', gsOutOfService: false }),
      );
      expect(b.hints.some((h) => /TAA/.test(h))).toBe(false);
    }
  });
});
