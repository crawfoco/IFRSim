import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../src/procedures';
import { destination } from '../../src/sim/geo/geodesy';
import { activeMinimums, buildScenario } from '../../src/sim/scenario/scenario';
import type { DebriefSample } from '../../src/sim/scoring/analyze';
import { buildRoute } from '../../src/sim/scoring/sequencer';
import {
  finalProfile,
  glidepathAltFt,
  glidepathDistNm,
  toThreshold,
} from '../../src/ui/map/finalProfile';
import { FinalProfileView } from '../../src/ui/map/FinalProfileView';

const thr = { latDeg: 40, lonDeg: -105 };

describe('final profile geometry', () => {
  it('measures along-track and cross-track distance to the threshold on the final course', () => {
    const course = 260;
    const onCourse = destination(thr, course + 180, 5);
    const a = toThreshold(onCourse, thr, course);
    expect(a.alongNm).toBeCloseTo(5, 2);
    expect(a.crossNm).toBeCloseTo(0, 2);
    // 1 NM right of course (looking along the final), 4 NM out.
    const off = destination(destination(thr, course + 180, 4), course + 90, 1);
    const b = toThreshold(off, thr, course);
    expect(b.alongNm).toBeCloseTo(4, 1);
    expect(Math.abs(b.crossNm)).toBeCloseTo(1, 1);
    // Past the threshold is negative.
    expect(toThreshold(destination(thr, course, 1), thr, course).alongNm).toBeCloseTo(-1, 2);
  });

  it('puts a 3° glidepath about 318 ft per NM above TCH', () => {
    expect(glidepathAltFt(5000, 50, 3, 0)).toBe(5050);
    expect(glidepathAltFt(5000, 50, 3, 1)).toBeCloseTo(5368.5, 0);
    expect(glidepathDistNm(5000, 50, 3, glidepathAltFt(5000, 50, 3, 2.5))).toBeCloseTo(2.5, 6);
  });

  it('lists the FAF and DA point for an ILS and keeps flown samples on the final only', () => {
    const p = procedureById('kcfo-ils26')!;
    const sc = buildScenario(p, NAVDATA, {
      startId: p.starts[0]!.id,
      ceiling: 'above',
      gsOutOfService: false,
    });
    const mins = activeMinimums(p, false, sc.start.iasKt);
    const route = buildRoute(sc);
    const finalIdx = route.findIndex((r) => r.leg.type === 'final');
    const sample = (nm: number, alt: number, legIndex = finalIdx): DebriefSample => {
      const pos = destination(sc.runway.threshold, sc.finalCourseTrueDeg + 180, nm);
      return { tick: 0, ...pos, altitudeFt: alt, headingTrueDeg: 0, legIndex, minAltFt: null };
    };
    const d = finalProfile(sc, mins, route, [sample(30, 9000), sample(4, 6500), sample(2, 6000)]);
    expect(d.fixes.map((f) => f.role)).toEqual(['FAF', 'MAP']);
    expect(d.fixes[0]!.minAltFt).toBe(7200);
    expect(d.maxNm).toBeGreaterThan(d.fixes[0]!.distNm);
    expect(d.path?.kind).toBe('GS');
    expect(d.flown).toHaveLength(1);
    expect(d.flown[0]!.map((x) => x.i)).toEqual([1, 2]);
  });

  it('draws step-downs, VDP, MAP and the descent angle for a VOR final, with the replay cursor', () => {
    const p = procedureById('klar-vor30')!;
    const sc = buildScenario(p, NAVDATA, {
      startId: 'direct-lar',
      ceiling: 'above',
      gsOutOfService: false,
    });
    const mins = activeMinimums(p, false, sc.start.iasKt);
    const route = buildRoute(sc);
    const finalIdx = route.findIndex((r) => r.leg.type === 'final');
    const missedIdx = route.findIndex((r) => r.phase === 'missed');
    const sample = (nm: number, alt: number, legIndex: number): DebriefSample => {
      const pos = destination(sc.runway.threshold, sc.finalCourseTrueDeg + 180, nm);
      return { tick: 0, ...pos, altitudeFt: alt, headingTrueDeg: 0, legIndex, minAltFt: null };
    };
    const d = finalProfile(sc, mins, route, [
      sample(5, 9900, finalIdx),
      sample(4, 9000, finalIdx),
      sample(3, 8300, finalIdx),
      sample(1, 9000, missedIdx), // climbing in the missed: not on the profile
    ]);
    expect(mins.kind).toBe('MDA');
    expect(d.fixes.map((f) => `${f.role}:${f.name}`)).toEqual([
      'FAF:HEMBI',
      'step:GARBE',
      'VDP:LAR 4',
      'MAP:LAR 3.1',
    ]);
    expect(d.path).toEqual({ angleDeg: 3, tchFt: 41, kind: 'VDA' });
    expect(d.flown.map((r) => r.map((x) => x.i))).toEqual([[0, 1, 2]]);

    const html = renderToStaticMarkup(<FinalProfileView data={d} minimums={mins} cursor={1} />);
    expect(html).toContain('data-testid="final-profile"');
    expect(html).toContain('data-testid="final-profile-cursor"');
    expect(html).toContain('<polyline');
    expect(html).toContain(`MDA ${mins.altFt.toLocaleString('en-US')}`);
    expect(html).toContain('VDA 3.00°');
  });
});
