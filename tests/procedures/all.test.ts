/** Every registered procedure loads, matches the navdata, and builds every start condition. */
import { describe, expect, it } from 'vitest';
import { NAVDATA, PROCEDURES } from '../../src/procedures';
import { checkAgainstNavdata } from '../../src/procedures/resolve';
import { briefing, buildScenario } from '../../src/sim/scenario/scenario';
import { sense } from '../../src/sim/sensors';

describe('registered procedures', () => {
  it('has the six V1 approaches with unique ids', () => {
    expect(PROCEDURES.map((p) => p.id)).toEqual([
      'kcfo-ils26',
      'kgxy-ils35',
      'kmtj-ils17',
      'kako-vor29',
      'klar-vor30',
      'ksny-vor13',
    ]);
  });

  for (const p of PROCEDURES) {
    describe(p.id, () => {
      it('matches the FAA navdata', () => {
        expect(checkAgainstNavdata(p, NAVDATA)).toEqual([]);
      });

      for (const start of p.starts) {
        it(`builds start "${start.id}" with every weather/GS option`, () => {
          const hasGs = p.approach.some((l) => l.type === 'final' && !!l.glideslope);
          for (const ceiling of ['above', 'below'] as const) {
            for (const gsOutOfService of hasGs ? [false, true] : [false]) {
              const sc = buildScenario(p, NAVDATA, { startId: start.id, ceiling, gsOutOfService });
              expect(sc.initial.aircraft.altitudeFt).toBe(start.altitudeFt);
              expect(Object.values(sc.fixes).every((f) => Number.isFinite(f.latDeg))).toBe(true);
              const b = briefing(sc);
              expect(b.minimums).toMatch(/(DA|MDA) [\d,]+ ft/);
              // The tuned radios read something sensible at the start.
              const s = sense(sc.initial, sc.world);
              expect(Number.isFinite(s.headingMagDeg)).toBe(true);
            }
          }
        });
      }
    });
  }
});
