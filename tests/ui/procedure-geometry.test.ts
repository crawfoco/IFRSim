/**
 * Map route drawing. Starts with a lead-in begin `leadInNm` short of their fix: the route must
 * still start at that fix (e.g. FQF, then R-045 to SKIPI), with the lead-in drawn on its own,
 * not a line from the start position straight to the first leg's end fix.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, PROCEDURES, procedureById } from '../../src/procedures';
import { resolveFixDef } from '../../src/procedures/resolve';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { buildScenario } from '../../src/sim/scenario/scenario';
import { buildRoute } from '../../src/sim/scoring/sequencer';
import { drawRoute } from '../../src/ui/map/procedureGeometry';

const scenario = (procId: string, startId: string) =>
  buildScenario(procedureById(procId)!, NAVDATA, {
    startId,
    ceiling: 'above',
    gsOutOfService: false,
  });

describe('drawRoute', () => {
  it('KCFO over-FQF: lead-in to FQF, then FQF R-045 to SKIPI', () => {
    const sc = scenario('kcfo-ils26', 'over-fqf');
    const legs = drawRoute(buildRoute(sc), sc);
    const [leadIn, feeder] = legs;
    expect(leadIn!.leadIn).toBe(true);
    expect(distanceNm(leadIn!.points[0]!, sc.initial.aircraft.position)).toBeLessThan(0.01);
    expect(distanceNm(leadIn!.points.at(-1)!, sc.fixes['FQF']!)).toBeLessThan(0.01);
    expect(feeder!.leadIn).toBeFalsy();
    expect(distanceNm(feeder!.points[0]!, sc.fixes['FQF']!)).toBeLessThan(0.01);
    expect(distanceNm(feeder!.points.at(-1)!, sc.fixes['SKIPI']!)).toBeLessThan(0.01);
  });

  for (const p of PROCEDURES)
    for (const st of p.starts.filter((s) => s.leadInNm))
      it(`${p.id} / ${st.id}: the route starts at the start fix, with a separate lead-in`, () => {
        const sc = scenario(p.id, st.id);
        const fix = resolveFixDef(st.position, { navdata: NAVDATA, procedure: p });
        const legs = drawRoute(buildRoute(sc), sc);
        expect(legs[0]!.leadIn).toBe(true);
        expect(distanceNm(legs[0]!.points.at(-1)!, fix)).toBeLessThan(0.01);
        // No route leg (other than the lead-in) starts at the aircraft's start position.
        for (const l of legs.slice(1))
          expect(distanceNm(l.points[0]!, sc.initial.aircraft.position)).toBeGreaterThan(0.5);
      });
});
