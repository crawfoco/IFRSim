/**
 * Procedure sequence:
 * - fixes flown in order, none skipped;
 * - missed approach flown as published: climb before turning, turn the charted way,
 *   reach the missed-approach holding fix.
 */
import { signedAngleDiff } from '../../geo/angles';
import { clock, type Rule, type ScoreItem } from './types';

export const fixOrder: Rule<null> = {
  init: () => null,
  step: (s) => s,
  finish(_s, last): ScoreItem[] {
    const { seq } = last;
    const skipped = seq.legs.filter((l) => l.status === 'skipped');
    const flownFixes = seq.legs
      .filter((l) => l.status !== 'skipped')
      .map((l) => seq.route[l.index]!.fix)
      .filter((f): f is string => !!f);
    const unique = flownFixes.filter((f, i) => flownFixes.indexOf(f) === i);
    return [
      {
        id: 'fix-order',
        title: 'Fixes flown in order',
        status: skipped.length ? 'fail' : 'pass',
        measured: skipped.length
          ? `Skipped: ${skipped.map((l) => seq.route[l.index]!.label).join(', ')}`
          : unique.length
            ? unique.join(' → ')
            : 'Vectors to final',
        ...(skipped.length ? { tick: skipped[0]!.startTick } : {}),
      },
    ];
  },
};

interface MissedState {
  startHeadingTrue: number | null;
  turnedBeforeClimbTick: number | null;
  /** Cumulative signed heading change after the climb altitude (+ = right). */
  turnDeg: number;
  firstTurn: 'L' | 'R' | null;
  firstTurnTick: number | null;
}

export const missedApproach: Rule<MissedState> = {
  init: () => ({
    startHeadingTrue: null,
    turnedBeforeClimbTick: null,
    turnDeg: 0,
    firstTurn: null,
    firstTurnTick: null,
  }),
  step(s, { seq, state, prev, scenario }) {
    if (seq.missedTick === null) return s;
    let n = s;
    if (n.startHeadingTrue === null) n = { ...n, startHeadingTrue: prev.aircraft.headingTrueDeg };
    const climb = scenario.procedure.missed.find((l) => l.type === 'climb');
    const alt = state.aircraft.altitudeFt;
    const climbed = !climb || alt >= climb.toAltFt - 100;
    if (!climbed) {
      const off = Math.abs(signedAngleDiff(state.aircraft.headingTrueDeg, n.startHeadingTrue!));
      if (off > 20 && n.turnedBeforeClimbTick === null)
        n = { ...n, turnedBeforeClimbTick: state.tick };
      return n;
    }
    if (n.firstTurn === null) {
      const turn =
        n.turnDeg + signedAngleDiff(state.aircraft.headingTrueDeg, prev.aircraft.headingTrueDeg);
      n = { ...n, turnDeg: turn };
      if (Math.abs(turn) > 20)
        n = { ...n, firstTurn: turn > 0 ? 'R' : 'L', firstTurnTick: state.tick };
    }
    return n;
  },
  finish(s, last): ScoreItem[] {
    const { seq, scenario } = last;
    if (seq.missedTick === null) return [];
    const p = scenario.procedure;
    const faults: string[] = [];
    const climb = p.missed.find((l) => l.type === 'climb');
    if (climb && s.turnedBeforeClimbTick !== null)
      faults.push(`turned before reaching ${climb.toAltFt} (${clock(s.turnedBeforeClimbTick)})`);
    const turnLeg = p.missed.find(
      (l): l is Extract<typeof l, { turn?: 'L' | 'R' }> =>
        (l.type === 'heading' || l.type === 'direct') && !!l.turn,
    );
    const charted = turnLeg && 'turn' in turnLeg ? turnLeg.turn : undefined;
    if (charted && s.firstTurn && s.firstTurn !== charted)
      faults.push(
        `turned ${s.firstTurn === 'L' ? 'left' : 'right'} (charted: ${charted === 'L' ? 'left' : 'right'})`,
      );
    if (charted && s.firstTurn === null)
      faults.push(`did not make the ${charted === 'L' ? 'left' : 'right'} turn`);
    // Reaching the hold = the sequencer got to the missed-approach hold leg (an overflight
    // straight ahead before the turn back, as at KSNY, does not count).
    const hold = scenario.missedHold;
    const holdIndex = seq.route.findIndex((r) => r.phase === 'missed' && r.leg === hold);
    if (seq.index < holdIndex) faults.push(`did not reach ${hold.fix}`);
    return [
      {
        id: 'missed-approach',
        title: 'Missed approach flown as published',
        status: faults.length ? 'fail' : 'pass',
        measured: faults.length ? faults.join('; ') : p.missedText,
        tick: seq.missedTick,
      },
    ];
  },
};
