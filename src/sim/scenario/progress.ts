/**
 * Scenario progress and end conditions, updated once per sim step (pure).
 *
 * - On final (inside the FAF, tracking toward the runway), reaching the DA, or the MDA,
 *   decides the outcome. With the ceiling above minimums the runway is in sight and the
 *   scenario ends. Otherwise the missed approach is required: at the DA (ILS), or at the
 *   MAP (non-precision; the learner may level at the MDA until then).
 * - After a missed approach the scenario ends once the aircraft has entered the
 *   missed-approach hold and flown one full circuit: two crossings of the holding fix
 *   on the inbound course (the first means established, the second completes the lap).
 */
import { magToTrue, signedAngleDiff } from '../geo/angles';
import { distanceNm } from '../geo/geodesy';
import type { NavData } from '../navdata/types';
import type { SimState } from '../state';
import { activeMinimums, type Scenario } from './scenario';

/** A fix counts as crossed when the closest approach was within this distance. */
const PASSAGE_NM = 1.0;
/** Distance that must be exceeded before the same fix can be crossed again. */
const REARM_NM = 1.5;
/** Heading tolerance for "on the inbound course" at the holding fix. */
const INBOUND_TOL_DEG = 30;

export type Phase = 'approach' | 'missed' | 'ended';
export type Outcome = 'runwayInSight' | 'missedComplete';

export interface ScenarioEvent {
  tick: number;
  kind:
    | 'minimums'
    | 'runwayInSight'
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
}

export interface ScenarioProgress {
  phase: Phase;
  outcome: Outcome | null;
  /** The most recent message for the learner, e.g. "Minimums — runway in sight". */
  callout: string | null;
  events: ScenarioEvent[];
  map: FixWatch;
  hold: FixWatch;
  inboundCrossings: number;
}

const watch = (): FixWatch => ({ armed: true, minNm: Infinity, lastNm: Infinity });

export function initialProgress(): ScenarioProgress {
  return {
    phase: 'approach',
    outcome: null,
    callout: null,
    events: [],
    map: watch(),
    hold: watch(),
    inboundCrossings: 0,
  };
}

/** Advance a fix watch; returns the new watch and whether the fix was just crossed. */
function crossing(w: FixWatch, dNm: number): [FixWatch, boolean] {
  if (!w.armed) return [{ ...w, armed: dNm > REARM_NM, lastNm: dNm, minNm: Infinity }, false];
  const crossed = dNm > w.lastNm && w.minNm <= PASSAGE_NM;
  if (crossed) return [{ armed: false, minNm: Infinity, lastNm: dNm }, true];
  return [{ armed: true, minNm: Math.min(w.minNm, dNm), lastNm: dNm }, false];
}

/** Inside the FAF and heading roughly down the final approach course. */
export function onFinal(s: SimState, sc: Scenario): boolean {
  const thr = sc.fixes[sc.final.map.fix]!;
  const faf = sc.fixes[sc.final.faf]!;
  const ac = s.aircraft.position;
  const inside = distanceNm(ac, thr) < distanceNm(faf, thr) + 0.2;
  const aligned = Math.abs(signedAngleDiff(s.aircraft.headingTrueDeg, sc.finalCourseTrueDeg)) < 45;
  return inside && aligned;
}

function holdInboundTrueDeg(sc: Scenario, navdata: NavData): number {
  const h = sc.missedHold;
  const v =
    'loc' in h.course
      ? navdata.localizers[h.course.loc]!.magVarEastDeg
      : navdata.navaids[h.course.navaid]!.declinationEastDeg;
  return magToTrue(h.inboundCourseMag, v);
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
    const final = onFinal(s, sc);
    const atMinimums = final && s.aircraft.altitudeFt <= min.altFt + (min.kind === 'MDA' ? 50 : 0);
    const label = `${min.kind} ${min.altFt.toLocaleString('en-US')}`;

    if (atMinimums && sc.options.ceiling === 'above') {
      const text = `Minimums (${label}): runway in sight.`;
      return {
        ...next,
        phase: 'ended',
        outcome: 'runwayInSight',
        callout: text,
        events: [...p.events, ev('minimums', `Reached ${label}`), ev('runwayInSight', text)],
      };
    }
    if (atMinimums && min.kind === 'DA') {
      const text = `Minimums (${label}): no runway in sight. Go missed: ${sc.procedure.missedText}`;
      return {
        ...next,
        phase: 'missed',
        callout: text,
        events: [...p.events, ev('minimums', `Reached ${label}`), ev('goMissed', text)],
      };
    }
    if (atMinimums && !p.events.some((e) => e.kind === 'minimums')) {
      return {
        ...next,
        callout: `${label}: no runway in sight yet. Level off; the MAP is ${sc.final.map.fix}.`,
        events: [...p.events, ev('minimums', `Reached ${label}`)],
      };
    }
    if (mapCrossed && final) {
      const text = `Missed approach point ${sc.final.map.fix}: no runway in sight. Go missed: ${sc.procedure.missedText}`;
      return {
        ...next,
        phase: 'missed',
        callout: text,
        events: [...p.events, ev('mapPassed', `Crossed ${sc.final.map.fix}`), ev('goMissed', text)],
      };
    }
    return next;
  }

  // Missed approach: watch the holding fix.
  const fix = sc.missedHold.fix;
  const [hold, crossed] = crossing(p.hold, distanceNm(s.aircraft.position, sc.fixes[fix]!));
  if (!crossed) return { ...p, hold };
  const inbound =
    Math.abs(
      signedAngleDiff(s.aircraft.headingTrueDeg, holdInboundTrueDeg(sc, sc.world.navdata)),
    ) <= INBOUND_TOL_DEG;
  const events = [...p.events, ev('holdFixCrossed', `Crossed ${fix}`)];
  if (!inbound) return { ...p, hold, events };
  const n = p.inboundCrossings + 1;
  if (n === 1) {
    const text = `Established in the ${fix} hold. Fly one more circuit.`;
    return {
      ...p,
      hold,
      inboundCrossings: n,
      callout: text,
      events: [...events, ev('established', text)],
    };
  }
  const text = `Hold circuit complete at ${fix}. End of scenario.`;
  return {
    ...p,
    hold,
    inboundCrossings: n,
    phase: 'ended',
    outcome: 'missedComplete',
    callout: text,
    events: [...events, ev('lapComplete', text)],
  };
}
