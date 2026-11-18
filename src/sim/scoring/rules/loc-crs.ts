/**
 * HSI course on a localizer: informational only. The autopilot holds the CRS of its nav source
 * as the course datum, also on a localizer (SPEC story 3), so a CRS set well away from the
 * localizer course makes it intercept poorly, track with an offset, or turn away (reciprocal:
 * reverse sensing). Noted when the autopilot was armed or coupled on a localizer with CRS more
 * than 10° off for at least 5 s in total. Replaces the V1 briefing hint.
 */
import { apNavSource } from '../../autopilot/autopilot';
import { signedAngleDiff } from '../../geo/angles';
import { clock, type Rule, type ScoreItem } from './types';

const OFF_DEG = 10;
const MIN_TICKS = 5 * 20;

interface S {
  ticks: number;
  firstTick: number | null;
  /** The setting seen the most (first one when tied), with its localizer. */
  crsDeg: number;
  locId: string;
  locCourseDeg: number;
}

const pad3 = (deg: number) => String(Math.round(deg) % 360 || 360).padStart(3, '0');

export const locCourseSetting: Rule<S> = {
  init: () => ({ ticks: 0, firstTick: null, crsDeg: 0, locId: '', locCourseDeg: 0 }),
  step(s, { state, sensors }) {
    const ap = state.ap;
    const onNav =
      ap.engaged &&
      ap.navKind === 'LOC' &&
      (ap.lateral === 'NAV' || ap.lateral === 'APR' || ap.lateralArmed !== null);
    if (!onNav) return s;
    const src = apNavSource(state, sensors);
    if (src.kind !== 'VLOC') return s;
    const st = src.reading.station;
    if (st?.kind !== 'LOC') return s;
    if (Math.abs(signedAngleDiff(src.obsDeg, st.loc.courseMagDeg)) <= OFF_DEG) return s;
    if (s.firstTick === null)
      return {
        ticks: 1,
        firstTick: state.tick,
        crsDeg: src.obsDeg,
        locId: st.loc.id,
        locCourseDeg: st.loc.courseMagDeg,
      };
    return { ...s, ticks: s.ticks + 1 };
  },
  finish(s): ScoreItem[] {
    if (s.firstTick === null || s.ticks < MIN_TICKS) return [];
    const secs = Math.round(s.ticks / 20);
    const reciprocal = Math.abs(signedAngleDiff(s.crsDeg, s.locCourseDeg + 180)) <= OFF_DEG;
    const effect = reciprocal
      ? 'On the reciprocal the HSI shows reverse sensing and the autopilot turns away from the course.'
      : 'Set this far off, the autopilot intercepts poorly or tracks with an offset.';
    return [
      {
        id: 'loc-crs',
        title: 'HSI course on the localizer',
        status: 'info',
        measured: `CRS was ${pad3(s.crsDeg)}° while the autopilot was on the ${s.locId} localizer (course ${pad3(s.locCourseDeg)}°), for ${Math.floor(secs / 60)} min ${secs % 60} s from ${clock(s.firstTick)}. The autopilot holds the course you set: set CRS to the localizer course. ${effect}`,
        tick: s.firstTick,
      },
    ];
  },
};
