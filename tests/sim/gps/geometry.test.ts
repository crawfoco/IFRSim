import { describe, expect, it } from 'vitest';
import navdataJson from '../../../src/procedures/navdata.json';
import { destination, initialBearingTrueDeg } from '../../../src/sim/geo/geodesy';
import { normalize360 } from '../../../src/sim/geo/angles';
import { rnavLine, rnavCourseTrueDeg, trackPosition } from '../../../src/sim/gps/geometry';
import { rnavWaypoint } from '../../../src/sim/navdata/rnav';
import type { NavData } from '../../../src/sim/navdata/types';

const nav = navdataJson as unknown as NavData;
const OBOZU = rnavWaypoint(nav, 'OBOZU').position;
const LOLME = rnavWaypoint(nav, 'LOLME').position;
const line = { from: OBOZU, to: LOLME };
const crs = initialBearingTrueDeg(OBOZU, LOLME);

describe('trackPosition', () => {
  it('is on track, with along and to-go distances, at points along the leg', () => {
    const len = trackPosition(line, LOLME).legNm;
    expect(len).toBeCloseTo(6.1, 1); // charted 6.1 NM
    for (const f of [0, 0.25, 0.5, 0.9]) {
      const p = destination(OBOZU, crs, len * f);
      const t = trackPosition(line, p);
      expect(Math.abs(t.xtkNm)).toBeLessThan(0.001);
      expect(t.alongNm).toBeCloseTo(len * f, 3);
      expect(t.toGoNm).toBeCloseTo(len * (1 - f), 3);
    }
  });

  it('gives + cross-track when the aircraft is left of the track', () => {
    const mid = destination(OBOZU, crs, 3);
    const left = destination(mid, normalize360(crs - 90), 0.3);
    const right = destination(mid, normalize360(crs + 90), 0.3);
    expect(trackPosition(line, left).xtkNm).toBeCloseTo(0.3, 3);
    expect(trackPosition(line, right).xtkNm).toBeCloseTo(-0.3, 3);
  });

  it('gives the desired track along the leg and beyond its end', () => {
    const t = trackPosition(line, destination(OBOZU, crs, 3)).courseTrueHereDeg;
    expect(Math.abs(t - crs)).toBeLessThan(0.1);
    const past = trackPosition(line, destination(LOLME, crs, 2));
    expect(past.toGoNm).toBeCloseTo(-2, 2);
    expect(Math.abs(past.courseTrueHereDeg - crs)).toBeLessThan(0.1);
  });
});

describe('RNAV course references', () => {
  it('a TF reference is the great circle between its waypoints', () => {
    expect(rnavLine({ rnavFrom: 'OBOZU', rnavTo: 'LOLME' }, nav)).toEqual(line);
  });

  it('a course through a fix ends at the fix on that course (KLAA OBOZU hold, 182.7°)', () => {
    const ref = { rnavFix: 'OBOZU', courseMag: 182.7 };
    const l = rnavLine(ref, nav);
    expect(l.to).toEqual(OBOZU);
    expect(rnavCourseTrueDeg(ref, nav)).toBeCloseTo(182.7 + 6.2, 6);
    const t = trackPosition(l, destination(OBOZU, rnavCourseTrueDeg(ref, nav) + 180, 4));
    expect(Math.abs(t.xtkNm)).toBeLessThan(0.001);
    expect(t.toGoNm).toBeCloseTo(4, 3);
  });

  it('the KLAA final (LOLME → RW18) is on the charted course 183°', () => {
    const rw = rnavWaypoint(nav, 'RW18');
    const trueCrs = initialBearingTrueDeg(LOLME, rw.position);
    const magCrs = trueCrs - rnavWaypoint(nav, 'LOLME').magVarEastDeg;
    expect(Math.abs(magCrs - 183)).toBeLessThan(0.6);
  });
});
