/** Every registered procedure loads, matches the navdata, and builds every start condition. */
import { describe, expect, it } from 'vitest';
import { NAVDATA, PROCEDURES, RNAV_PROCEDURES } from '../../src/procedures';
import { checkAgainstNavdata } from '../../src/procedures/resolve';
import { briefing, buildScenario } from '../../src/sim/scenario/scenario';
import { sense } from '../../src/sim/sensors';

describe('registered procedures', () => {
  it('has the nine radio approaches (V1 six, V3 three more) with unique ids', () => {
    expect(PROCEDURES.map((p) => p.id)).toEqual([
      'kcfo-ils26',
      'kgxy-ils35',
      'kmtj-ils17',
      'kcys-ils27',
      'kako-vor29',
      'klar-vor30',
      'ksny-vor13',
      'kcez-vor21',
      'kskx-vordme-b',
    ]);
  });

  it('has the nine V3 RNAV approaches', () => {
    expect(RNAV_PROCEDURES.map((p) => p.id)).toEqual([
      'klaa-rnav18',
      'koga-rnav8',
      'kbff-rnav12',
      'kpub-rnav26l',
      'kcpr-rnav3',
      'kapa-rnav28',
      'kcos-rnav31',
      'kals-rnav2',
      'kcny-rnav3',
    ]);
  });

  for (const p of [...PROCEDURES, ...RNAV_PROCEDURES]) {
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
