/**
 * Circling-only approaches (VOR/DME-B style): the minimums are a circling MDA, the decision at
 * the MAP is go around or continue, and "in sight" means the airport (any runway): continuing
 * with it in sight circles to land on the procedure's landing runway, whichever that is.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../../src/procedures';
import { parseProcedure, type Procedure } from '../../../src/procedures/schema';
import { destination, distanceNm } from '../../../src/sim/geo/geodesy';
import { runwayInSight } from '../../../src/sim/scenario/outside';
import { initialProgress, updateProgress } from '../../../src/sim/scenario/progress';
import {
  activeMinimums,
  briefing,
  buildScenario,
  isCirclingOnly,
} from '../../../src/sim/scenario/scenario';

const kako = procedureById('kako-vor29')!;
/** KAKO VOR 29 as if it were circling-only (same MAP, circling MDA 5200, 1 SM). */
const circ: Procedure = parseProcedure(
  {
    ...kako,
    minimums: [
      {
        kind: 'CIRCLING',
        label: 'CIRCLING',
        A: { altFt: 5200, visibilitySm: 1 },
        B: { altFt: 5200, visibilitySm: 1 },
      },
    ],
  },
  'circling-test',
);
const build = (ceiling: 'above' | 'below') =>
  buildScenario(circ, NAVDATA, { startId: 'direct-ako', ceiling, gsOutOfService: false });

describe('circling-only procedures', () => {
  it('fly the circling MDA', () => {
    expect(isCirclingOnly(circ)).toBe(true);
    expect(isCirclingOnly(kako)).toBe(false);
    const m = activeMinimums(circ, false, 100);
    expect(m).toMatchObject({ kind: 'MDA', altFt: 5200, label: 'CIRCLING' });
  });

  it('"in sight" is the airport, not one runway threshold', () => {
    const sc = build('above');
    const arp = NAVDATA.airports[circ.airport]!.position;
    // Within the visibility of the airport reference point, below the clouds, but farther than
    // that from the landing threshold.
    const vis = sc.weather.visibilitySm * 0.868976;
    const p = destination(arp, 200, vis * 0.9);
    expect(distanceNm(p, sc.runway.threshold)).toBeGreaterThan(0);
    const s = {
      ...sc.initial,
      aircraft: { ...sc.initial.aircraft, position: p, altitudeFt: sc.thresholdElevationFt + 300 },
    };
    expect(runwayInSight(s, sc)).toBe(true);
    const far = { ...s, aircraft: { ...s.aircraft, position: destination(arp, 200, vis * 1.5) } };
    expect(runwayInSight(far, sc)).toBe(false);
  });

  it('continuing past the MAP with the airport in sight circles to land', () => {
    const sc = build('above');
    const map = sc.fixes[sc.final.map.fix]!;
    const faf = sc.fixes[sc.final.faf]!;
    let p = initialProgress();
    // Down the final course at the MDA, from just before the MAP to just past it.
    for (let i = 0; i <= 40; i++) {
      const f = i / 40;
      const pos = destination(map, sc.finalCourseTrueDeg + 180, 0.5 - f);
      p = updateProgress(
        p,
        {
          ...sc.initial,
          tick: 1000 + i,
          aircraft: {
            ...sc.initial.aircraft,
            position: pos,
            altitudeFt: 5200,
            headingTrueDeg: sc.finalCourseTrueDeg,
          },
        },
        sc,
      );
      if (p.phase === 'ended') break;
    }
    expect(distanceNm(faf, map)).toBeGreaterThan(0);
    expect(p.outcome).toBe('landed');
    expect(p.callout).toMatch(/Airport in sight: circling to land on runway 29/);
  });

  it('KSKX: the briefing weather reads in reportable visibilities (1¼ SM minimums)', () => {
    const sc = buildScenario(procedureById('kskx-vordme-b')!, NAVDATA, {
      startId: 'r353',
      ceiling: 'above',
      gsOutOfService: false,
    });
    expect(briefing(sc).weather).toMatch(/visibility ½–3 SM/);
  });
});
