/**
 * Runner, input log and replay. The runner turns wall-clock time into fixed 20 Hz steps
 * (with pause and a time multiplier) and logs every command with the tick it applied on.
 * Replaying the log from the same initial state reproduces the flight exactly.
 */
import { DT, STEP_HZ, step } from './loop';
import type { Command, SimState } from './state';
import type { World } from './world';

export interface LoggedCommand {
  tick: number;
  command: Command;
}

/** One track sample per second, for the debrief and the map. */
export interface TrackSample {
  tick: number;
  latDeg: number;
  lonDeg: number;
  altitudeFt: number;
  headingTrueDeg: number;
}

export const TIME_SCALES = [1, 2, 4] as const;
export type TimeScale = (typeof TIME_SCALES)[number];

/** Never run more than this many steps per advance() (a backgrounded tab returning). */
const MAX_STEPS_PER_ADVANCE = 80; // 1 s of real time at 4×; longer gaps are dropped

const sampleOf = (s: SimState): TrackSample => ({
  tick: s.tick,
  latDeg: s.aircraft.position.latDeg,
  lonDeg: s.aircraft.position.lonDeg,
  altitudeFt: s.aircraft.altitudeFt,
  headingTrueDeg: s.aircraft.headingTrueDeg,
});

export class SimRunner {
  state: SimState;
  readonly initial: SimState;
  readonly log: LoggedCommand[] = [];
  readonly track: TrackSample[] = [];
  paused = false;
  timeScale: TimeScale = 1;
  private pending: Command[] = [];
  /** Pending sim time, in steps. */
  private accumulator = 0;

  constructor(
    initial: SimState,
    private readonly world: World,
    /** Called after every step (scenario progress, scoring). */
    private readonly onStep?: (s: SimState) => void,
  ) {
    this.initial = initial;
    this.state = initial;
    this.track.push(sampleOf(initial));
  }

  /** Commands queued for the next step (the UI previews their effect before it runs). */
  get pendingCommands(): readonly Command[] {
    return this.pending;
  }

  /** Queue a command; it applies at the start of the next step. */
  enqueue(command: Command): void {
    this.pending.push(command);
  }

  /** Run one step now, applying queued commands (also works while paused). */
  stepOnce(): void {
    const cmds = this.pending;
    this.pending = [];
    for (const command of cmds) this.log.push({ tick: this.state.tick, command });
    this.state = step(this.state, cmds, this.world);
    if (this.state.tick % 20 === 0) this.track.push(sampleOf(this.state));
    this.onStep?.(this.state);
  }

  /** Advance by real elapsed seconds; returns the number of steps run. */
  advance(realSeconds: number): number {
    if (this.paused) return 0;
    this.accumulator += realSeconds * this.timeScale * STEP_HZ;
    let n = 0;
    // The epsilon absorbs float error so 0.5 s at 4× is exactly 40 steps.
    while (this.accumulator >= 1 - 1e-9 && n < MAX_STEPS_PER_ADVANCE) {
      this.stepOnce();
      this.accumulator -= 1;
      n++;
    }
    if (n === MAX_STEPS_PER_ADVANCE) this.accumulator = 0;
    return n;
  }

  /** Run a whole number of sim seconds immediately (tests, fast-forward). */
  runSeconds(seconds: number): void {
    for (let i = 0; i < Math.round(seconds / DT); i++) this.stepOnce();
  }
}

/** Re-run a logged flight from its initial state for `ticks` steps. */
export function replay(
  initial: SimState,
  log: readonly LoggedCommand[],
  ticks: number,
  world: World,
  onStep?: (s: SimState) => void,
): SimState {
  let s = initial;
  let i = 0;
  while (s.tick < ticks) {
    const cmds: Command[] = [];
    while (i < log.length && log[i]!.tick === s.tick) cmds.push(log[i++]!.command);
    s = step(s, cmds, world);
    onStep?.(s);
  }
  return s;
}
