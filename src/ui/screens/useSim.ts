/**
 * Runs the sim in the browser. A requestAnimationFrame loop feeds wall-clock time to the
 * fixed-step runner; React subscribes through useSyncExternalStore and re-renders when
 * steps have run. The view state includes queued commands, so fast knob turns between
 * steps build on each other.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { applyCommand } from '../../sim/commands';
import { initialState, type StartCondition } from '../../sim/loop';
import { SimRunner, type TimeScale } from '../../sim/recorder';
import { sense } from '../../sim/sensors';
import type { Sensors, SimState } from '../../sim/state';
import type { World } from '../../sim/world';
import type { Send } from '../panel/controls';

/** Longest frame gap fed to the sim: a backgrounded tab does not fast-forward on return. */
const MAX_FRAME_S = 0.25;

export class BrowserSim {
  private runner: SimRunner;
  private listeners = new Set<() => void>();
  private version = 0;
  private raf = 0;

  constructor(
    private readonly world: World,
    private readonly start: StartCondition,
    /** Checked after each batch of steps; true pauses the sim (e.g. at DA). */
    private readonly shouldPause?: (s: SimState) => boolean,
  ) {
    this.runner = new SimRunner(initialState(start, world), world);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;

  private changed() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  run(): () => void {
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, MAX_FRAME_S);
      last = now;
      if (this.runner.advance(dt) > 0) {
        if (this.shouldPause?.(this.runner.state)) this.runner.paused = true;
        this.changed();
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(this.raf);
  }

  send: Send = (c) => {
    this.runner.enqueue(typeof c === 'function' ? c(this.view()) : c);
    this.changed();
  };

  /** Current state with queued (not yet stepped) commands applied. */
  view(): SimState {
    let s = this.runner.state;
    for (const c of this.runner.pendingCommands) s = applyCommand(s, c, this.world);
    return s;
  }

  get paused() {
    return this.runner.paused;
  }
  setPaused(p: boolean) {
    this.runner.paused = p;
    this.changed();
  }
  get timeScale(): TimeScale {
    return this.runner.timeScale;
  }
  setTimeScale(t: TimeScale) {
    this.runner.timeScale = t;
    this.changed();
  }
  restart() {
    const { timeScale } = this.runner;
    this.runner = new SimRunner(initialState(this.start, this.world), this.world);
    this.runner.timeScale = timeScale;
    this.changed();
  }
}

export interface SimView {
  sim: BrowserSim;
  state: SimState;
  sensors: Sensors;
}

export function useSim(
  world: World,
  start: StartCondition,
  shouldPause?: (s: SimState) => boolean,
): SimView {
  const [sim] = useState(() => new BrowserSim(world, start, shouldPause));
  useSyncExternalStore(sim.subscribe, sim.getVersion);
  useEffect(() => sim.run(), [sim]);
  const state = sim.view();
  return { sim, state, sensors: sense(state, world) };
}
