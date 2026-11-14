/** Shared types for scoring rules. Each rule is a pure accumulator over the replayed flight. */
import type { ScenarioProgress } from '../../scenario/progress';
import type { Scenario } from '../../scenario/scenario';
import type { Command, Sensors, SimState } from '../../state';
import type { SequencerState } from '../sequencer';

export type ItemStatus = 'pass' | 'fail' | 'info';

export interface ScoreItem {
  /** Stable id, e.g. "hold-entry:SKIPI". */
  id: string;
  title: string;
  status: ItemStatus;
  /** What was measured, in words the learner can act on. */
  measured: string;
  /** When it happened (for the timeline / replay), if it is a moment. */
  tick?: number;
}

/** Everything a rule may look at for one sim step (after the step ran). */
export interface StepContext {
  state: SimState;
  /** State before this step (headings, altitudes for rates). */
  prev: SimState;
  sensors: Sensors;
  seq: SequencerState;
  prevSeq: SequencerState;
  progress: ScenarioProgress;
  scenario: Scenario;
  /** Commands applied at the start of this step. */
  commands: readonly Command[];
}

export interface Rule<S> {
  init(sc: Scenario): S;
  step(s: S, ctx: StepContext): S;
  /** Items for the score table; called once at the end with the last context. */
  finish(s: S, last: StepContext): ScoreItem[];
}

/** mm:ss from a tick count (20 Hz). */
export function clock(tick: number): string {
  const t = Math.floor(tick / 20);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export const fmtFt = (ft: number) => `${Math.round(ft).toLocaleString('en-US')} ft`;
