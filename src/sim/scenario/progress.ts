/**
 * Scenario progress and end conditions, updated once per sim step (pure).
 *
 * - Going missed is the learner's positive decision: pressing GA (TOGA) at any point on
 *   the approach starts the missed approach.
 * - Without GA, the decision point is the DA (precision), or descending below the MDA or
 *   passing the MAP (non-precision), with a 50 ft allowance below DA/MDA. Passing it means
 *   the learner is landing: fine with the runway in sight (the scenario ends, landed), a
 *   failure without it (the scenario ends there).
 * - After a missed approach the scenario ends once the aircraft has entered the
 *   missed-approach hold and flown one full circuit: the arrival at the holding fix (the
 *   entry, at least 45 s after the missed approach starts), then two inbound crossings of
 *   the fix along the inbound course (established, then the lap complete).
 */
import { signedAngleDiff } from '../geo/angles';
import { distanceNm, type LatLon } from '../geo/geodesy';
import { crossedInbound } from '../scoring/geometry';
import type { SimState } from '../state';
import { runwayInSight } from './outside';
import { activeMinimums, type Scenario } from './scenario';

/** A fix counts as crossed when the closest approach was within this distance. */
const PASSAGE_NM = 1.0;
/** Distance that must be exceeded before the same fix can be crossed again. */
const REARM_NM = 1.5;

export type Phase = 'approach' | 'missed' | 'ended';
export type Outcome = 'landed' | 'belowMinimums' | 'missedComplete';

export interface ScenarioEvent {
  tick: number;
  kind:
    | 'minimums'
    | 'runwayInSight'
    | 'landed'
    | 'belowMinimums'
    | 'goMissed'
    | 'mapPassed'
    | 'holdFixCrossed'
    | 'established'
    | 'lapComplete';
  text: string;
}

interface FixWatch {
  armed: boolean;
  minNm: number;
  lastNm: number;
  /** Distance when armed: a crossing needs the aircraft to have closed in since then. */
  armNm: number;
}

export interface ScenarioProgress {
  phase: Phase;
  outcome: Outcome | null;
  /** The most recent message for the learner, e.g. "Minimums — runway in sight". */
  callout: string | null;
  events: ScenarioEvent[];
  map: FixWatch;
  hold: FixWatch;
  /** Missed approach: when it started, and when the aircraft arrived at the holding fix. */
  missedTick: number | null;
  holdArrivalTick: number | null;
  inboundCrossings: number;
  prevPosition: LatLon | null;
}

const watch = (): FixWatch => ({ armed: true, minNm: Infinity, lastNm: Infinity, armNm: Infinity });

export function initialProgress(): ScenarioProgress {
  return {
    phase: 'approach',
    outcome: null,
    callout: null,
    events: [],
    map: watch(),
    hold: watch(),
    missedTick: null,
    holdArrivalTick: null,
    inboundCrossings: 0,
    prevPosition: null,
  };
}

/** Advance a fix watch; returns the new watch and whether the fix was just crossed. */
function crossing(w: FixWatch, dNm: number): [FixWatch, boolean] {
  if (!w.armed) {
    const rearm = dNm > REARM_NM;
    return [{ armed: rearm, lastNm: dNm, minNm: Infinity, armNm: rearm ? dNm : Infinity }, false];
  }
  const crossed = dNm > w.lastNm && w.minNm <= PASSAGE_NM && w.armNm - w.minNm >= 0.2;
  if (crossed) return [{ armed: false, minNm: Infinity, lastNm: dNm, armNm: Infinity }, true];
  // Moving out past the arming distance: the closing-in is measured from the farthest point.
  if (dNm > w.armNm) return [{ ...w, armNm: dNm, minNm: dNm, lastNm: dNm }, false];
  return [{ ...w, minNm: Math.min(w.minNm, dNm), lastNm: dNm }, false];
}

/** Ignore holding-fix crossings this soon after the missed approach starts (KSNY flies
 *  straight over the station before turning back to it). */
const ARRIVAL_AFTER_S = 45;
/** Allowance below DA/MDA before the learner is taken to be landing. */
export const DECISION_ALLOWANCE_FT = 50;

/** Inside the FAF and heading roughly down the final approach course. */
export function onFinal(s: SimState, sc: Scenario): boolean {
  const thr = sc.fixes[sc.final.map.fix]!;
  const faf = sc.fixes[sc.final.faf]!;
  const ac = s.aircraft.position;
  const inside = distanceNm(ac, thr) < distanceNm(faf, thr) + 0.2;
  const aligned = Math.abs(signedAngleDiff(s.aircraft.headingTrueDeg, sc.finalCourseTrueDeg)) < 45;
  return inside && aligned;
}

export function updateProgress(p: ScenarioProgress, s: SimState, sc: Scenario): ScenarioProgress {
  if (p.phase === 'ended') return p;
  const ev = (kind: ScenarioEvent['kind'], text: string): ScenarioEvent => ({
    tick: s.tick,
    kind,
    text,
  });

  if (p.phase === 'approach') {
    const min = activeMinimums(sc.procedure, sc.options.gsOutOfService, s.panel.iasCmdKt);
    const [map, mapCrossed] = crossing(
      p.map,
      distanceNm(s.aircraft.position, sc.fixes[sc.final.map.fix]!),
    );
    const next = { ...p, map };
    const alt = s.aircraft.altitudeFt;
    const label = `${min.kind} ${min.altFt.toLocaleString('en-US')}`;
    const inSight = runwayInSight(s, sc);
    let events = p.events;
    if (inSight && !events.some((e) => e.kind === 'runwayInSight'))
      events = [...events, ev('runwayInSight', `Runway in sight at ${Math.round(alt)} ft`)];

    // The learner's go-around decision.
    if (s.goAroundTick !== null) {
      const text = `Going missed. ${sc.procedure.missedText}`;
      return {
        ...next,
        phase: 'missed',
        callout: text,
        events: [
          ...events,
          ev(
            'goMissed',
            `Go-around (GA) at ${Math.round(alt)} ft${inSight ? ', runway in sight' : ''}`,
          ),
        ],
      };
    }

    const final = onFinal(s, sc);
    // Levelling at the MDA (ALT capture) counts as reaching it.
    const reachedMinimums = final && alt <= min.altFt + (min.kind === 'MDA' ? 50 : 0);
    if (reachedMinimums && !events.some((e) => e.kind === 'minimums'))
      return {
        ...next,
        callout: 'Minimums.',
        events: [...events, ev('minimums', `Reached ${label}`)],
      };

    // Past the decision point without GA: the learner is landing.
    const belowDecision = final && alt < min.altFt - DECISION_ALLOWANCE_FT;
    const pastMap = final && mapCrossed && min.kind === 'MDA';
    if (belowDecision || pastMap) {
      const where = belowDecision
        ? `Descended below the ${label}`
        : `Passed the missed approach point (${sc.final.map.fix})`;
      if (inSight) {
        const text = `Runway in sight: landing. ${where} with the runway in sight.`;
        return {
          ...next,
          phase: 'ended',
          outcome: 'landed',
          callout: text,
          events: [...events, ev('landed', text)],
        };
      }
      const text = `${where} without the runway in sight. A missed approach (GA) was required. Flight ended.`;
      return {
        ...next,
        phase: 'ended',
        outcome: 'belowMinimums',
        callout: text,
        events: [...events, ev('belowMinimums', text)],
      };
    }
    return events === p.events ? next : { ...next, events };
  }

  // Missed approach: arrival at the holding fix (the entry), then inbound crossings.
  const fix = sc.missedHold.fix;
  const fixPos = sc.fixes[fix]!;
  const pos = s.aircraft.position;
  const prevPos = p.prevPosition ?? pos;
  const missedTick = p.missedTick ?? s.tick;
  const base = { ...p, missedTick, prevPosition: pos };
  if (p.holdArrivalTick === null) {
    const [w, crossed] = crossing(p.hold, distanceNm(pos, fixPos));
    if (!crossed) return { ...base, hold: w };
    if (s.tick - missedTick < ARRIVAL_AFTER_S * 20)
      // Too early to be the arrival: watch again, from here.
      return { ...base, hold: { ...watch(), lastNm: w.lastNm, armNm: w.lastNm } };
    const text = `Crossed ${fix}: hold entry.`;
    return {
      ...base,
      hold: w,
      holdArrivalTick: s.tick,
      callout: text,
      events: [...p.events, ev('holdFixCrossed', text)],
    };
  }
  const inbound =
    s.tick - p.holdArrivalTick > 30 * 20 &&
    crossedInbound(
      sc.missedHold.course,
      fixPos,
      prevPos,
      pos,
      s.aircraft.headingTrueDeg,
      sc.world.navdata,
    );
  if (!inbound) return base;
  const n = p.inboundCrossings + 1;
  const events = [...p.events, ev('holdFixCrossed', `Crossed ${fix} inbound`)];
  if (n === 1) {
    const text = `Established in the ${fix} hold. Fly one more circuit.`;
    return {
      ...base,
      inboundCrossings: n,
      callout: text,
      events: [...events, ev('established', text)],
    };
  }
  const text = `Hold circuit complete at ${fix}. End of scenario.`;
  return {
    ...base,
    inboundCrossings: n,
    phase: 'ended',
    outcome: 'missedComplete',
    callout: text,
    events: [...events, ev('lapComplete', text)],
  };
}
