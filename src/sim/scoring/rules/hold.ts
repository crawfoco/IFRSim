/**
 * Flying the hold:
 * - outbound leg timing (entry outbound legs and racetrack outbound legs) against the
 *   charted leg length in minutes;
 * - the hold's maximum altitude, while the hold is the current leg;
 * - "climb in hold" on the missed-approach hold: the hold altitude reached by the end of
 *   the circuit.
 */
import { isRnavRef } from '../../../procedures/schema';
import type { Leg } from '../../../procedures/schema';
import { normalize360, signedAngleDiff } from '../../geo/angles';
import { alongTrackBeforeFixNm, inboundTrueAtFix } from '../geometry';
import { fmtFt, type Rule, type ScoreItem, type StepContext } from './types';

type HoldLeg = Extract<Leg, { type: 'hold' }>;

/** Heading within this of the outbound course counts as outbound (teardrop is ~30° off the
 *  charted course; station declination can add a few degrees). */
const OUTBOUND_WINDOW_DEG = 45;
/** Wings level: bank below this. */
const LEVEL_BANK_DEG = 5;
/** Level, outbound and abeam for this long before an outbound leg counts as started. */
const SETTLE_TICKS = 20 * 3;
/** Allowed deviation from the charted outbound time. */
const TIMING_TOL_S = 15;
/** Allowance above the hold's maximum altitude. */
const MAX_ALT_TOL_FT = 100;
/** Allowance below the climb-in-hold altitude. */
const CLIMB_TOL_FT = 100;

const isSkipped = (last: StepContext, i: number) =>
  last.seq.legs.some((l) => l.index === i && l.status === 'skipped');

/** m:ss from seconds. */
function mss(seconds: number): string {
  const t = Math.round(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** First crossing of the hold fix while the hold is the current leg (as for the entry). */
function holdArrival(ctx: StepContext, hold: HoldLeg) {
  const legStart = ctx.seq.legs.at(-1)!.startTick;
  return ctx.seq.passages.find((x) => x.fix === hold.fix && x.tick >= legStart - 20 * 30);
}

// ---- Outbound timing ----

interface Segment {
  startTick: number;
  endTick: number;
}

interface TimingWatch {
  fix: string;
  legIndex: number;
  inboundTrueDeg: number;
  /** Tick the current candidate (level, outbound, abeam) run began. */
  candidate: number | null;
  /** Outbound leg in progress: started, and the last wings-level tick (turn start). */
  active: { startTick: number; lastLevelTick: number } | null;
  segments: Segment[];
  closed: boolean;
}

export const holdTiming: Rule<{ watches: TimingWatch[] }> = {
  init: () => ({ watches: [] }),
  step(s, ctx) {
    const { seq, state, scenario } = ctx;
    const cur = seq.route[seq.index]!;
    let watches = s.watches;
    // GPS-flown holds (RNAV course) are flown by the GPS, entry included: not scored here.
    if (
      cur.leg.type === 'hold' &&
      !isRnavRef(cur.leg.course) &&
      !watches.some((w) => w.legIndex === cur.index)
    ) {
      const hold = cur.leg;
      if (holdArrival(ctx, hold))
        watches = [
          ...watches,
          {
            fix: hold.fix,
            legIndex: cur.index,
            inboundTrueDeg: inboundTrueAtFix(
              hold.course,
              scenario.fixes[hold.fix]!,
              scenario.world.navdata,
            ),
            candidate: null,
            active: null,
            segments: [],
            closed: false,
          },
        ];
    }
    const tick = state.tick;
    const ac = state.aircraft;
    const next = watches.map((w): TimingWatch => {
      if (w.closed) return w;
      // The hold leg is over: an outbound leg still in progress was not completed.
      if (seq.index !== w.legIndex) return { ...w, closed: true, active: null, candidate: null };
      const outbound = normalize360(w.inboundTrueDeg + 180);
      const inWindow =
        Math.abs(signedAngleDiff(ac.headingTrueDeg, outbound)) <= OUTBOUND_WINDOW_DEG;
      const level = Math.abs(ac.bankDeg) < LEVEL_BANK_DEG;
      if (w.active) {
        // Heading out of the window: the turn back inbound started at the last level tick.
        if (!inWindow)
          return {
            ...w,
            active: null,
            candidate: null,
            segments: [
              ...w.segments,
              { startTick: w.active.startTick, endTick: w.active.lastLevelTick },
            ],
          };
        return level ? { ...w, active: { ...w.active, lastLevelTick: tick } } : w;
      }
      const abeam =
        alongTrackBeforeFixNm(scenario.fixes[w.fix]!, w.inboundTrueDeg, ac.position) >= 0;
      if (!(inWindow && level && abeam))
        return w.candidate === null ? w : { ...w, candidate: null };
      const candidate = w.candidate ?? tick;
      if (tick - candidate >= SETTLE_TICKS)
        return { ...w, candidate, active: { startTick: candidate, lastLevelTick: tick } };
      return w.candidate === candidate ? w : { ...w, candidate };
    });
    const changed = next.some((w, i) => w !== watches[i]);
    return changed || watches !== s.watches ? { watches: next } : s;
  },
  finish(s, last): ScoreItem[] {
    return s.watches
      .filter((w) => !isSkipped(last, w.legIndex) && w.segments.length > 0)
      .flatMap((w): ScoreItem[] => {
        const leg = last.seq.route[w.legIndex]!.leg as HoldLeg;
        if (leg.legMinutes === undefined) return []; // DME/distance legs: not timed
        const expected = leg.legMinutes * 60;
        const secs = w.segments.map((g) => (g.endTick - g.startTick) / 20);
        const bad = secs.filter((t) => Math.abs(t - expected) > TIMING_TOL_S);
        const all = secs.map(mss).join(', ');
        const label = secs.length > 1 ? 'Outbound legs' : 'Outbound leg';
        return [
          {
            id: `hold-timing:${w.fix}:${w.legIndex}`,
            title: `Hold outbound timing at ${w.fix} (${leg.legMinutes} min)`,
            status: bad.length ? 'fail' : 'pass',
            measured: bad.length
              ? `Outbound leg ${bad.map(mss).join(', ')} (expected ${mss(expected)} ±${TIMING_TOL_S} s)` +
                (secs.length > 1 ? `; outbound legs ${all}` : '')
              : `${label} ${all}`,
            tick: w.segments[0]!.startTick,
          },
        ];
      });
  },
};

// ---- Maximum altitude ----

interface MaxAltWatch {
  fix: string;
  legIndex: number;
  maxAltFt: number;
  highestFt: number;
  tick: number;
}

export const holdMaxAltitude: Rule<{ watches: MaxAltWatch[] }> = {
  init: () => ({ watches: [] }),
  step(s, { seq, state }) {
    const cur = seq.route[seq.index]!;
    if (cur.leg.type !== 'hold' || cur.leg.maxAltFt === undefined) return s;
    // The maximum applies in the hold: from crossing the fix (a descent on the way in is fine).
    const legStart = seq.legs.at(-1)!.startTick;
    const atFix =
      seq.reversal.outboundTick !== null ||
      // The missed-approach hold has no entry tracking: from its fix passage.
      (cur.phase === 'missed' && seq.passages.some((p) => p.fix === cur.fix && p.tick >= legStart));
    if (!atFix) return s;
    const alt = state.aircraft.altitudeFt;
    const w = s.watches.find((x) => x.legIndex === cur.index);
    if (!w)
      return {
        watches: [
          ...s.watches,
          {
            fix: cur.leg.fix,
            legIndex: cur.index,
            maxAltFt: cur.leg.maxAltFt,
            highestFt: alt,
            tick: state.tick,
          },
        ],
      };
    if (alt <= w.highestFt) return s;
    return {
      watches: s.watches.map((x) => (x === w ? { ...x, highestFt: alt, tick: state.tick } : x)),
    };
  },
  finish(s, last): ScoreItem[] {
    return s.watches
      .filter((w) => !isSkipped(last, w.legIndex))
      .map((w) => ({
        id: `hold-max-altitude:${w.fix}:${w.legIndex}`,
        title: `Hold maximum altitude at ${w.fix}`,
        status: w.highestFt > w.maxAltFt + MAX_ALT_TOL_FT ? 'fail' : 'pass',
        measured: `Highest ${fmtFt(w.highestFt)} (maximum ${fmtFt(w.maxAltFt)})`,
        tick: w.tick,
      }));
  },
};

// ---- Climb in hold ----

interface ClimbState {
  arrivalTick: number | null;
  highestFt: number;
  /** The circuit is complete (or the hold left): stop measuring. */
  ended: boolean;
}

/** The missed-approach hold with a "climb in hold" note, if any. */
function climbHold(sc: StepContext['scenario']): HoldLeg | null {
  const h = sc.missedHold;
  return h.climbInHold && h.minAltFt !== undefined ? h : null;
}

export const climbInHold: Rule<ClimbState> = {
  init: () => ({ arrivalTick: null, highestFt: -Infinity, ended: false }),
  step(s, { seq, state, progress, scenario }) {
    if (s.ended || seq.missedTick === null || !climbHold(scenario)) return s;
    const alt = state.aircraft.altitudeFt;
    return {
      arrivalTick: s.arrivalTick ?? progress.holdArrivalTick,
      highestFt: Math.max(s.highestFt, alt),
      ended: progress.outcome === 'missedComplete',
    };
  },
  finish(s, last): ScoreItem[] {
    const h = climbHold(last.scenario);
    if (!h || s.arrivalTick === null) return [];
    const target = h.minAltFt!;
    const ok = s.highestFt >= target - CLIMB_TOL_FT;
    return [
      {
        id: `climb-in-hold:${h.fix}`,
        title: `Climb in hold at ${h.fix}`,
        status: ok ? 'pass' : 'fail',
        measured: ok
          ? `Highest ${fmtFt(s.highestFt)} by the end of the hold circuit (climb in hold to ${fmtFt(target)})`
          : `Highest ${fmtFt(s.highestFt)} by the end of the hold circuit; the chart calls for a climb to ${fmtFt(target)} in the hold`,
        tick: s.arrivalTick,
      },
    ];
  },
};
