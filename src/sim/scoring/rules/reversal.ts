/**
 * Course reversals:
 * - hold entry (direct / parallel / teardrop) matches the arrival heading (70° rule);
 * - barbed procedure turn on the charted side, within the charted distance, at or above
 *   its altitude;
 * - a course reversal flown on a NoPT route (informational).
 */
import { isRnavRef } from '../../../procedures/schema';
import type { Leg } from '../../../procedures/schema';
import { normalize360, signedAngleDiff, trueToMag } from '../../geo/angles';
import { distanceNm } from '../../geo/geodesy';
import { coursePosition } from '../geometry';
import { clock, fmtFt, type Rule, type ScoreItem, type StepContext } from './types';

type HoldLeg = Extract<Leg, { type: 'hold' }>;
type PtLeg = Extract<Leg, { type: 'procedureTurn' }>;
export type Entry = 'direct' | 'parallel' | 'teardrop';

/** Boundary tolerance: within this of a sector edge, either entry is accepted. */
const SECTOR_TOL_DEG = 5;

/**
 * Correct entry from the heading at the fix relative to the inbound course (true).
 * Right turns: direct −70…+110, teardrop +110…+180, parallel −180…−70; mirrored for left.
 */
export function correctEntries(
  arrivalTrueDeg: number,
  inboundTrueDeg: number,
  turn: 'L' | 'R',
): Entry[] {
  const d0 = signedAngleDiff(arrivalTrueDeg, inboundTrueDeg);
  const d = turn === 'R' ? d0 : -d0;
  const of = (x: number): Entry =>
    x >= -70 && x <= 110 ? 'direct' : x > 110 ? 'teardrop' : 'parallel';
  const out = new Set<Entry>([of(d)]);
  for (const t of [-SECTOR_TOL_DEG, SECTOR_TOL_DEG]) {
    const x = signedAngleDiff(normalize360(d + t), 0);
    out.add(of(x));
  }
  return [...out];
}

interface HoldWatch {
  fix: string;
  legIndex: number;
  arrivalTick: number;
  arrivalTrueDeg: number;
  inboundTrueDeg: number;
  steadyTicks: number;
  /** Outbound settled: teardrop (offset toward the holding side), or straight outbound. */
  outbound: { kind: 'teardrop' | 'straight'; tick: number } | null;
  /** Signed turn since the outbound settled (+ = right). */
  turnDeg: number;
  flown: Entry | null;
}

/** Turn that counts as the turn back inbound at the end of the outbound leg. */
const RETURN_TURN_DEG = 90;
/** If no return turn shows up by then, fall back to which side the aircraft is on. */
const RETURN_WAIT_S = 240;

interface HoldState {
  watches: HoldWatch[];
}

/** Which side of the inbound course line the aircraft is on (by the cross-track sign). */
function onHoldingSide(h: HoldLeg, ctx: StepContext): boolean {
  const ac = { position: ctx.state.aircraft.position, altitudeFt: ctx.state.aircraft.altitudeFt };
  const pos = coursePosition(h.course, ac, ctx.scenario.world.navdata);
  return h.turn === 'R' ? pos.xtkNm < 0 : pos.xtkNm > 0;
}

/** Outbound heading offset toward the holding side (teardrop) or not. */
function outboundKind(h: HoldLeg, ctx: StepContext): 'teardrop' | 'straight' {
  const ac = { position: ctx.state.aircraft.position, altitudeFt: ctx.state.aircraft.altitudeFt };
  const pos = coursePosition(h.course, ac, ctx.scenario.world.navdata);
  const outbound = normalize360(pos.courseTrueHereDeg + 180);
  const delta = signedAngleDiff(ctx.state.aircraft.headingTrueDeg, outbound);
  // Facing outbound, the holding side is on the left for right turns.
  const towardHolding = h.turn === 'R' ? -delta : delta;
  return towardHolding > 15 ? 'teardrop' : 'straight';
}

export const holdEntry: Rule<HoldState> = {
  init: () => ({ watches: [] }),
  step(s, ctx) {
    const { seq, state, scenario } = ctx;
    const cur = seq.route[seq.index]!;
    let watches = s.watches;
    // A new hold: its first crossing of the fix while the hold is the current leg.
    // GPS-flown holds (RNAV course) are flown by the GPS, entry included: not scored here.
    if (
      cur.leg.type === 'hold' &&
      !isRnavRef(cur.leg.course) &&
      !watches.some((w) => w.legIndex === cur.index)
    ) {
      const hold = cur.leg;
      const legStart = seq.legs.at(-1)!.startTick;
      const p = seq.passages.find((x) => x.fix === hold.fix && x.tick >= legStart - 20 * 30);
      if (p) {
        const fixPos = scenario.fixes[hold.fix]!;
        const inbound = coursePosition(
          hold.course,
          { position: fixPos, altitudeFt: p.altitudeFt },
          scenario.world.navdata,
        );
        watches = [
          ...watches,
          {
            fix: hold.fix,
            legIndex: cur.index,
            arrivalTick: p.tick,
            arrivalTrueDeg: p.headingTrueDeg,
            inboundTrueDeg: inbound.courseTrueHereDeg,
            steadyTicks: 0,
            outbound: null,
            turnDeg: 0,
            flown: null,
          },
        ];
      }
    }
    // Classify each pending entry: once the aircraft is steady outbound, note whether it is
    // offset toward the holding side (teardrop); then the direction of the turn back tells
    // direct (turn in the holding direction) from parallel (turn the other way).
    watches = watches.map((w) => {
      if (w.flown) return w;
      const leg = seq.route[w.legIndex]!.leg as HoldLeg;
      const since = state.tick - w.arrivalTick;
      if (!w.outbound) {
        const steady = Math.abs(state.aircraft.bankDeg) < 3 ? w.steadyTicks + 1 : 0;
        const far = distanceNm(state.aircraft.position, scenario.fixes[w.fix]!) > 0.5;
        if ((since > 20 * 15 && steady >= 20 * 5 && far) || since >= 20 * 90)
          return {
            ...w,
            steadyTicks: steady,
            outbound: { kind: outboundKind(leg, ctx), tick: state.tick },
          };
        return { ...w, steadyTicks: steady };
      }
      if (w.outbound.kind === 'teardrop') return { ...w, flown: 'teardrop' };
      const turnDeg =
        w.turnDeg +
        signedAngleDiff(state.aircraft.headingTrueDeg, ctx.prev.aircraft.headingTrueDeg);
      if (Math.abs(turnDeg) >= RETURN_TURN_DEG) {
        const dir = turnDeg > 0 ? 'R' : 'L';
        return { ...w, turnDeg, flown: dir === leg.turn ? 'direct' : 'parallel' };
      }
      if (state.tick - w.outbound.tick > RETURN_WAIT_S * 20)
        return { ...w, turnDeg, flown: onHoldingSide(leg, ctx) ? 'direct' : 'parallel' };
      return { ...w, turnDeg };
    });
    return watches === s.watches ? s : { watches };
  },
  finish(s, last): ScoreItem[] {
    const mv = last.scenario.world.magVarEastDeg;
    const skipped = (i: number) =>
      last.seq.legs.some((l) => l.index === i && l.status === 'skipped');
    return s.watches
      .filter((w) => !skipped(w.legIndex) && (w.flown || w.outbound))
      .map((w) => {
        const leg = last.seq.route[w.legIndex]!.leg as HoldLeg;
        // The flight ended on the outbound leg: judge by the side of the course instead.
        if (!w.flown && w.outbound)
          w = {
            ...w,
            flown:
              w.outbound.kind === 'teardrop'
                ? 'teardrop'
                : onHoldingSide(leg, last)
                  ? 'direct'
                  : 'parallel',
          };
        const ok = correctEntries(w.arrivalTrueDeg, w.inboundTrueDeg, leg.turn);
        const hdg = String(Math.round(trueToMag(w.arrivalTrueDeg, mv)) % 360 || 360).padStart(
          3,
          '0',
        );
        const flown = w.flown ?? 'not flown';
        return {
          id: `hold-entry:${w.fix}:${w.legIndex}`,
          title: `Hold entry at ${w.fix}`,
          status: w.flown && ok.includes(w.flown) ? 'pass' : 'fail',
          measured: `Flew ${flown}; arriving on heading ${hdg}° calls for ${ok.join(' or ')}`,
          tick: w.arrivalTick,
        };
      });
  },
};

interface PtWatch {
  fix: string;
  legIndex: number;
  startTick: number;
  maxDistNm: number;
  minAltFt: number;
  wrongSideNm: number;
  done: boolean;
}

export const procedureTurn: Rule<{ watches: PtWatch[] }> = {
  init: () => ({ watches: [] }),
  step(s, { seq, state, scenario }) {
    const cur = seq.route[seq.index]!;
    let watches = s.watches;
    // Not while a straight-in crossing is undecided (it may be a skipped PT, not one flown).
    if (
      cur.leg.type === 'procedureTurn' &&
      seq.reversal.outboundTick !== null &&
      seq.reversal.straightInTick === null
    ) {
      const pt: PtLeg = cur.leg;
      const ac = { position: state.aircraft.position, altitudeFt: state.aircraft.altitudeFt };
      const pos = coursePosition(pt.course, ac, scenario.world.navdata);
      // Side L of the outbound course is right of the inbound course (course to the left).
      const wrong = pt.side === 'L' ? Math.max(0, pos.xtkNm) : Math.max(0, -pos.xtkNm);
      const d = distanceNm(ac.position, scenario.fixes[pt.fix]!);
      const existing = watches.find((w) => w.legIndex === cur.index);
      const before = seq.reversal.inboundTick === null; // PT altitude applies until inbound
      const upd = (w: PtWatch): PtWatch => ({
        ...w,
        maxDistNm: Math.max(w.maxDistNm, d),
        minAltFt: before ? Math.min(w.minAltFt, ac.altitudeFt) : w.minAltFt,
        wrongSideNm: Math.max(w.wrongSideNm, wrong),
      });
      watches = existing
        ? watches.map((w) => (w === existing ? upd(w) : w))
        : [
            ...watches,
            upd({
              fix: pt.fix,
              legIndex: cur.index,
              startTick: seq.reversal.outboundTick,
              maxDistNm: 0,
              minAltFt: Infinity,
              wrongSideNm: 0,
              done: false,
            }),
          ];
    }
    return watches === s.watches ? s : { watches };
  },
  finish(s, last): ScoreItem[] {
    // A skipped PT is `fix-order`'s finding, not a procedure turn flown.
    const skipped = (i: number) =>
      last.seq.legs.some((l) => l.index === i && l.status === 'skipped');
    return s.watches
      .filter((w) => !skipped(w.legIndex))
      .map((w) => {
        const pt = last.seq.route[w.legIndex]!.leg as PtLeg;
        const faults: string[] = [];
        if (w.wrongSideNm > 1.0)
          faults.push(`turned on the wrong side (${w.wrongSideNm.toFixed(1)} NM)`);
        if (w.maxDistNm > pt.maxDistanceNm)
          faults.push(
            `went ${w.maxDistNm.toFixed(1)} NM from ${w.fix} (limit ${pt.maxDistanceNm})`,
          );
        if (w.minAltFt < pt.minAltFt - 100)
          faults.push(
            `descended to ${fmtFt(w.minAltFt)} before inbound (minimum ${fmtFt(pt.minAltFt)})`,
          );
        return {
          id: `procedure-turn:${w.fix}:${w.legIndex}`,
          title: `Procedure turn at ${w.fix}`,
          status: faults.length ? 'fail' : 'pass',
          measured: faults.length
            ? faults.join('; ')
            : `${pt.side === 'L' ? 'Left' : 'Right'} side, within ${w.maxDistNm.toFixed(1)} NM, lowest ${fmtFt(w.minAltFt)}`,
          tick: w.startTick,
        };
      });
  },
};

/** NoPT: a reversal (≥ 300° of turn in one direction before the FAF) is noted, not penalised. */
export const noPtReversal: Rule<{ turnDeg: number; maxAbs: number; tick: number | null }> = {
  init: () => ({ turnDeg: 0, maxAbs: 0, tick: null }),
  step(s, { seq, state, prev, scenario }) {
    const t = scenario.start.transition
      ? scenario.procedure.transitions.find((x) => x.id === scenario.start.transition)
      : undefined;
    const noPT = !!t?.noPT || !!scenario.start.noReversal;
    if (!noPT || seq.fafTick !== null || seq.missedTick !== null) return s;
    const turn =
      s.turnDeg + signedAngleDiff(state.aircraft.headingTrueDeg, prev.aircraft.headingTrueDeg);
    const abs = Math.abs(turn);
    return {
      turnDeg: turn,
      maxAbs: Math.max(s.maxAbs, abs),
      tick: s.tick === null && abs >= 300 ? state.tick : s.tick,
    };
  },
  finish(s): ScoreItem[] {
    if (s.tick === null) return [];
    return [
      {
        id: 'nopt-reversal',
        title: 'Course reversal on a NoPT route',
        status: 'info',
        measured: `A course reversal was flown at ${clock(s.tick)} on a route marked NoPT. That needs ATC approval: the NoPT route is designed to be flown straight in.`,
        tick: s.tick,
      },
    ];
  },
};
