/**
 * Leg sequencer (T20): tracks which procedure leg the learner is on, from fix passage,
 * course alignment and altitude, so that scoring judges each moment against the right
 * leg. Pure: `stepSequencer(prev, ctx)` once per sim step.
 *
 * The route is the start's transition (if any), then the approach, then (once a missed
 * approach starts) the missed approach. Completion of each leg type:
 * - track / direct: the leg's fix is crossed.
 * - arc: the leg's fix is crossed (arcs are often left on a lead radial: wider radius).
 * - heading: established on the intercept course.
 * - climb: the climb altitude is reached.
 * - hold (course reversal): crossing the fix inbound after the entry.
 * - procedure turn: outbound, turn, established inbound, then the fix crossed inbound.
 * - final: does not complete; the missed approach (or the end) takes over.
 * A fix belonging to a later leg that is crossed first moves the sequencer ahead, and the
 * legs in between are recorded as skipped.
 */
import type { Leg } from '../../procedures/schema';
import { distanceNm, type LatLon } from '../geo/geodesy';
import type { Scenario } from '../scenario/scenario';
import type { SimState } from '../state';
import {
  alongTrackBeforeFixNm,
  coursePosition,
  crossedInbound,
  established,
  inboundTrueAtFix,
} from './geometry';
import { signedAngleDiff } from '../geo/angles';

/** A fix is crossed when the closest approach was within this distance. */
export const PASSAGE_NM = 2.0;
const ARC_PASSAGE_NM = 3.0;
const REARM_NM = 2.5;

export type RoutePhase = 'transition' | 'approach' | 'missed';

export interface RouteLeg {
  index: number;
  phase: RoutePhase;
  leg: Leg;
  label: string;
  /** Fix that ends the leg (track/direct/arc), or the leg's own fix (hold/PT/final FAF). */
  fix: string | null;
}

function legLabel(leg: Leg): string {
  switch (leg.type) {
    case 'track':
      return `Track to ${leg.to}`;
    case 'arc':
      return `${leg.navaid} ${leg.radiusNm} DME arc to ${leg.to}`;
    case 'heading':
      return `Heading ${String(leg.headingMag).padStart(3, '0')}°`;
    case 'climb':
      return `Climb to ${leg.toAltFt}`;
    case 'direct':
      return `Direct ${leg.to}`;
    case 'hold':
      return `Hold at ${leg.fix}`;
    case 'procedureTurn':
      return `Procedure turn at ${leg.fix}`;
    case 'final':
      return `Final approach from ${leg.faf}`;
  }
}

function legFix(leg: Leg): string | null {
  switch (leg.type) {
    case 'track':
    case 'direct':
    case 'arc':
      return leg.to;
    case 'hold':
    case 'procedureTurn':
      return leg.fix;
    case 'final':
      return leg.faf;
    default:
      return null;
  }
}

/**
 * Transition legs from where the start joins it (`joinAt`), or all of them; without the course
 * reversal for a TAA straight-in arrival (`noReversal`).
 */
function joinTransition(all: Leg[], joinAt: string | undefined, noReversal = false): Leg[] {
  const legs = noReversal
    ? all.filter((l) => l.type !== 'hold' && l.type !== 'procedureTurn')
    : all;
  if (!joinAt) return legs;
  const reversal = legs.findIndex(
    (l) => (l.type === 'hold' || l.type === 'procedureTurn') && legFix(l) === joinAt,
  );
  if (reversal >= 0) return legs.slice(reversal);
  const ending = legs.findIndex((l) => legFix(l) === joinAt);
  if (ending < 0) throw new Error(`transition does not pass ${joinAt}`);
  return legs.slice(ending + 1);
}

export function buildRoute(sc: Scenario): RouteLeg[] {
  const t = sc.start.transition
    ? sc.procedure.transitions.find((x) => x.id === sc.start.transition)
    : undefined;
  const parts: [RoutePhase, Leg[]][] = [
    ['transition', joinTransition(t?.legs ?? [], sc.start.joinAt, sc.start.noReversal)],
    ['approach', sc.procedure.approach],
    ['missed', sc.procedure.missed],
  ];
  const route: RouteLeg[] = [];
  for (const [phase, legs] of parts)
    for (const leg of legs)
      route.push({ index: route.length, phase, leg, label: legLabel(leg), fix: legFix(leg) });
  return route;
}

export interface FixPassage {
  fix: string;
  tick: number;
  altitudeFt: number;
  headingTrueDeg: number;
  /** Closest approach. */
  distanceNm: number;
}

interface Watch {
  armed: boolean;
  minNm: number;
  lastNm: number;
  /** Distance when armed: a passage needs the aircraft to have closed in since then. */
  armNm: number;
}

/** Closing-in needed after arming before a passage counts (no passage while leaving). */
const APPROACH_NM = 0.2;

export interface LegRecord {
  index: number;
  startTick: number;
  endTick: number | null;
  status: 'flown' | 'skipped' | 'active';
}

/** Course reversal (hold or PT) progress on the current leg. */
export interface ReversalState {
  /** Fix crossed outbound (the hold entry or the PT started). */
  outboundTick: number | null;
  /** Hold: inbound fix crossing. PT: established on the inbound course. */
  inboundTick: number | null;
  /**
   * Fix crossed already heading inbound (within 45° of the inbound course): a direct hold
   * entry, or a straight-in that skips the reversal. Decided once the aircraft turns outbound
   * (flying it) or carries on past the fix (skipped).
   */
  straightInTick: number | null;
  /** Farthest out on the outbound side (before the fix along the inbound course), NM. */
  outboundNm: number;
}

/** Past the fix along the inbound course, still heading inbound: the reversal was skipped. */
const STRAIGHT_IN_NM = 2.0;
/** A course reversal goes at least this far out on the outbound side before coming back. */
const OUTBOUND_MIN_NM = 1.0;
/** Beyond the fix along the inbound course, heading inbound: maybe skipping the reversal. */
const BEYOND_FIX_NM = 0.3;
/** Turned this far from the inbound course after crossing: the reversal is being flown. */
const TURNED_OUTBOUND_DEG = 90;
const NO_REVERSAL: ReversalState = {
  outboundTick: null,
  inboundTick: null,
  straightInTick: null,
  outboundNm: 0,
};

export interface SequencerState {
  route: RouteLeg[];
  index: number;
  legs: LegRecord[];
  passages: FixPassage[];
  watches: Record<string, Watch>;
  reversal: ReversalState;
  /** Tick the FAF was crossed (final approach segment started). */
  fafTick: number | null;
  missedTick: number | null;
  /** Lowest altitude since the FAF (for detecting an early missed approach). */
  /** Aircraft position at the previous step (for along-track crossings). */
  prevPosition: LatLon;
}

export function initialSequencer(sc: Scenario): SequencerState {
  const route = buildRoute(sc);
  const watches: Record<string, Watch> = {};
  for (const name of Object.keys(sc.fixes))
    watches[name] = { armed: true, minNm: Infinity, lastNm: Infinity, armNm: Infinity };
  return {
    route,
    index: 0,
    legs: [{ index: 0, startTick: sc.initial.tick, endTick: null, status: 'active' }],
    passages: [],
    watches,
    reversal: NO_REVERSAL,
    fafTick: null,
    missedTick: null,
    prevPosition: sc.initial.aircraft.position,
  };
}

export const currentLeg = (s: SequencerState): RouteLeg => s.route[s.index]!;

export interface SequencerContext {
  state: SimState;
  scenario: Scenario;
  /** The learner has gone missed (GA pressed on the approach). */
  missedCalled: boolean;
}

function passageThreshold(fix: string, route: RouteLeg[]): number {
  return route.some((r) => r.leg.type === 'arc' && r.fix === fix) ? ARC_PASSAGE_NM : PASSAGE_NM;
}

/** Move to leg `to`, closing the current one and marking legs in between skipped. */
function advance(
  s: SequencerState,
  to: number,
  tick: number,
  current: 'flown' | 'skipped' = 'flown',
  /** When skipping ahead: this leg's fix was reached, so it counts as flown. */
  reached?: number,
): SequencerState {
  if (to <= s.index) return s;
  const legs = s.legs.map((l) =>
    l.status === 'active' ? { ...l, endTick: tick, status: current } : l,
  );
  for (let i = s.index + 1; i < to; i++)
    legs.push({
      index: i,
      startTick: tick,
      endTick: tick,
      status: i === reached ? 'flown' : 'skipped',
    });
  legs.push({ index: to, startTick: tick, endTick: null, status: 'active' });
  // The new leg's fix may have been crossed recently (e.g. the missed approach back to a
  // station passed on the final): watch it afresh, from here.
  const fix = s.route[to]!.fix;
  const watches = { ...s.watches };
  if (fix && watches[fix] && !watches[fix].armed)
    watches[fix] = {
      armed: true,
      minNm: Infinity,
      lastNm: watches[fix].lastNm,
      armNm: watches[fix].lastNm,
    };
  return { ...s, index: to, legs, watches, reversal: NO_REVERSAL };
}

export function stepSequencer(prev: SequencerState, ctx: SequencerContext): SequencerState {
  const { state, scenario: sc } = ctx;
  const ac = { position: state.aircraft.position, altitudeFt: state.aircraft.altitudeFt };
  const nav = sc.world.navdata;
  const tick = state.tick;
  let s = prev;

  // 1. Fix passages.
  const crossed: FixPassage[] = [];
  const watches: Record<string, Watch> = {};
  for (const [name, w] of Object.entries(s.watches)) {
    const d = distanceNm(ac.position, sc.fixes[name]!);
    if (!w.armed) {
      const rearm = d > REARM_NM;
      watches[name] = { armed: rearm, minNm: Infinity, lastNm: d, armNm: rearm ? d : Infinity };
      continue;
    }
    if (
      d > w.lastNm &&
      w.minNm <= passageThreshold(name, s.route) &&
      w.armNm - w.minNm >= APPROACH_NM
    ) {
      crossed.push({
        fix: name,
        tick,
        altitudeFt: ac.altitudeFt,
        headingTrueDeg: state.aircraft.headingTrueDeg,
        distanceNm: w.minNm,
      });
      watches[name] = { armed: false, minNm: Infinity, lastNm: d, armNm: Infinity };
    } else if (d > w.armNm)
      // Moving out past the arming distance: closing-in is measured from the farthest point.
      watches[name] = { ...w, armNm: d, minNm: d, lastNm: d };
    else watches[name] = { ...w, minNm: Math.min(w.minNm, d), lastNm: d };
  }
  s = { ...s, watches, passages: crossed.length ? [...s.passages, ...crossed] : s.passages };
  const crossedNow = (fix: string | null) => fix !== null && crossed.some((c) => c.fix === fix);

  // 2. Missed approach: the learner pressed GA.
  if (s.missedTick === null && ctx.missedCalled) {
    const firstMissed = s.route.findIndex((r) => r.phase === 'missed');
    // Missed-approach fixes may have been crossed on the approach (KAKO: AKO is the FAF).
    const watches = { ...s.watches };
    for (const r of s.route)
      if (r.phase === 'missed' && r.fix && watches[r.fix]) {
        const w = watches[r.fix]!;
        watches[r.fix] = { armed: true, minNm: Infinity, lastNm: w.lastNm, armNm: w.lastNm };
      }
    s = {
      ...advance({ ...s, watches }, firstMissed, tick),
      missedTick: tick,
      prevPosition: ac.position,
    };
    return s;
  }

  // 3. Current leg completion.
  const cur = currentLeg(s);
  const L = cur.leg;
  const legStart = s.legs.at(-1)!.startTick;
  let done = false;
  let skippedReversal = false;
  /** Tick the reversal fix was crossed straight in (for a reversal at the FAF). */
  let straightInAt = tick;
  switch (L.type) {
    case 'track':
    case 'direct':
    case 'arc':
      done = crossedNow(L.to);
      break;
    case 'climb':
      done = ac.altitudeFt >= L.toAltFt - 50;
      break;
    case 'heading':
      done = L.intercept
        ? established(coursePosition(L.intercept, ac, nav), state.aircraft.headingTrueDeg)
        : false;
      break;
    case 'hold':
    case 'procedureTurn': {
      if (L.type === 'hold' && cur.phase === 'missed') break; // ends the scenario instead
      const fixPos = sc.fixes[L.fix]!;
      const r = s.reversal;
      if (r.outboundTick === null) {
        const p = crossedNow(L.fix)
          ? crossed.find((c) => c.fix === L.fix)
          : s.passages.findLast((x) => x.fix === L.fix && x.tick >= legStart - 20 * 30);
        if (!p) break;
        // Arriving already inbound on the course: a direct entry, or the course reversal
        // skipped; decided by what the aircraft does next.
        const inbound = inboundTrueAtFix(L.course, fixPos, nav);
        const straightIn = Math.abs(signedAngleDiff(p.headingTrueDeg, inbound)) <= 45;
        s = {
          ...s,
          reversal: { ...r, outboundTick: tick, straightInTick: straightIn ? p.tick : null },
        };
        break;
      }
      if (r.straightInTick !== null) {
        const inbound = inboundTrueAtFix(L.course, fixPos, nav);
        if (Math.abs(signedAngleDiff(state.aircraft.headingTrueDeg, inbound)) > TURNED_OUTBOUND_DEG)
          s = { ...s, reversal: { ...r, straightInTick: null } };
        else if (
          -alongTrackBeforeFixNm(fixPos, inbound, ac.position) > STRAIGHT_IN_NM ||
          // Descending below the reversal's minimum: going down the final (a PT fix may be the
          // FAF with the MAP under 2 NM beyond).
          (L.minAltFt !== undefined && ac.altitudeFt < L.minAltFt - 100)
        ) {
          skippedReversal = true;
          straightInAt = r.straightInTick;
        }
        break;
      }
      const inbound = inboundTrueAtFix(L.course, fixPos, nav);
      const beforeNm = alongTrackBeforeFixNm(fixPos, inbound, ac.position);
      if (beforeNm > r.outboundNm) s = { ...s, reversal: { ...s.reversal, outboundNm: beforeNm } };
      // Crossed from another direction, then heading inbound beyond the fix (e.g. turned
      // straight onto the next leg): judged like a straight-in crossing from here.
      if (
        r.inboundTick === null &&
        Math.abs(signedAngleDiff(state.aircraft.headingTrueDeg, inbound)) <= 45 &&
        -beforeNm > BEYOND_FIX_NM
      ) {
        s = { ...s, reversal: { ...s.reversal, straightInTick: tick } };
        break;
      }
      const pos = coursePosition(L.course, ac, nav);
      if (
        L.type === 'procedureTurn' &&
        r.inboundTick === null &&
        tick - r.outboundTick > 20 * 60 &&
        established(pos, state.aircraft.headingTrueDeg, 1.0, 30)
      )
        s = { ...s, reversal: { ...s.reversal, inboundTick: tick } };
      // Done when the fix is crossed inbound (along-track, so a tight hold still counts), after
      // going out on the outbound side (not just a turn back over the fix).
      if (
        tick - r.outboundTick > 20 * 30 &&
        s.reversal.outboundNm >= OUTBOUND_MIN_NM &&
        crossedInbound(
          L.course,
          fixPos,
          s.prevPosition,
          ac.position,
          state.aircraft.headingTrueDeg,
          nav,
        )
      ) {
        s = { ...s, reversal: { ...s.reversal, inboundTick: s.reversal.inboundTick ?? tick } };
        done = true;
      }
      break;
    }
    case 'final':
      break;
  }
  const next = s.index + 1 < s.route.length ? s.index + 1 : s.index;
  if (done) s = advance(s, next, tick);
  else if (skippedReversal) {
    s = advance(s, next, tick, 'skipped');
    // Straight in over the FAF: the final approach segment starts here.
    const n = currentLeg(s).leg;
    if (n.type === 'final' && n.faf === (L as { fix: string }).fix && s.fafTick === null)
      s = { ...s, fafTick: straightInAt };
  } else if (s.missedTick === null) {
    // 4. Skipping ahead: a later leg's fix crossed first (not in the missed approach,
    //    which re-crosses fixes legitimately). The current leg was not flown either.
    for (const c of crossed) {
      const j = s.route.findIndex(
        (r, i) =>
          i > s.index &&
          r.phase !== 'missed' &&
          r.fix === c.fix &&
          (r.leg.type === 'track' || r.leg.type === 'direct' || r.leg.type === 'arc') &&
          // Crossed going that leg's way (a feeder may pass a later fix head-on).
          (r.leg.type !== 'track' ||
            established(coursePosition(r.leg.course, ac, nav), c.headingTrueDeg, 2.0, 60)),
      );
      if (j > s.index) {
        s = advance(s, Math.min(j + 1, s.route.length - 1), tick, 'skipped', j);
        break;
      }
    }
  }

  // 5. FAF passage: the final approach segment starts when the FAF is crossed inbound
  //    while (or just as) the final is the current leg.
  const now = currentLeg(s);
  if (
    s.fafTick === null &&
    s.missedTick === null &&
    now.leg.type === 'final' &&
    (s.passages.some(
      (x) =>
        x.fix === (now.leg as { faf: string }).faf &&
        x.tick >= tick - 20 * 30 &&
        x.tick >= s.legs.at(-1)!.startTick - 20 * 30,
    ) ||
      crossedInbound(
        now.leg.course,
        sc.fixes[now.leg.faf]!,
        s.prevPosition,
        ac.position,
        state.aircraft.headingTrueDeg,
        nav,
        2.0,
        60,
      ))
  )
    s = { ...s, fafTick: tick };
  return { ...s, prevPosition: ac.position };
}
