/**
 * The WAAS outcome is hidden until the approach annunciation (SPEC story 16): before it, the
 * briefing (minimums and weather text), the GPS vertical guidance and the autopilot behave the
 * same whether WAAS is available or not.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../../src/procedures';
import { briefing, buildScenario, shownMinimums } from '../../../src/sim/scenario/scenario';
import { sense } from '../../../src/sim/sensors';

const build = (procId: string, startId: string, waasAvailable: boolean) =>
  buildScenario(procedureById(procId)!, NAVDATA, {
    startId,
    ceiling: 'above',
    gsOutOfService: false,
    waasAvailable,
  });

describe('WAAS outcome hidden until the annunciation', () => {
  for (const procId of ['klaa-rnav18', 'kcpr-rnav3', 'koga-rnav8', 'kcos-rnav31'])
    it(`${procId}: the briefing reads the same with and without WAAS`, () => {
      const a = briefing(build(procId, 'vectors-final', true));
      const b = briefing(build(procId, 'vectors-final', false));
      expect(b.minimums).toBe(a.minimums);
      expect(b.weather).toBe(a.weather);
    });

  it('KLAA: before the annunciation the GP shows (flagged or not) with and without WAAS', () => {
    const r = (waas: boolean) => {
      const sc = build('klaa-rnav18', 'vectors-final', waas);
      const s = {
        ...sc.initial,
        gps: { ...sc.initial.gps, loaded: { transition: 'VTF' }, active: true, leg: 0 },
      };
      return sense(s, sc.world).gps;
    };
    const withWaas = r(true);
    const without = r(false);
    expect(withWaas.annunciation).toBeNull();
    expect(without.annunciation).toBeNull();
    expect(without.vnavAvailable).toBe(withWaas.vnavAvailable);
    expect(without.gp === null).toBe(withWaas.gp === null);
  });

  it('both ceiling outcomes stay on the right side of the minimums actually in force', () => {
    for (const waas of [true, false])
      for (const ceiling of ['above', 'below'] as const) {
        const sc = buildScenario(procedureById('klaa-rnav18')!, NAVDATA, {
          startId: 'vectors-final',
          ceiling,
          gsOutOfService: false,
          waasAvailable: waas,
        });
        const da = waas ? 3945 : 4260; // LPV DA, LNAV MDA (KLAA)
        if (ceiling === 'above') expect(sc.weather.baseFtMsl).toBeGreaterThan(da + 100);
        else expect(sc.weather.baseFtMsl).toBeLessThan(da - 100);
      }
  });

  it('the panel shows the planned minimums until the annunciation, then the actual ones', () => {
    const sc = build('klaa-rnav18', 'vectors-final', false);
    expect(shownMinimums(sc, 100, false)).toMatchObject({ kind: 'DA', altFt: 3945 });
    expect(shownMinimums(sc, 100, true)).toMatchObject({ kind: 'MDA', altFt: 4260 });
    const waas = build('klaa-rnav18', 'vectors-final', true);
    expect(shownMinimums(waas, 100, true)).toMatchObject({ kind: 'DA', altFt: 3945 });
  });
});
