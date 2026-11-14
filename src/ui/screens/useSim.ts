/**
 * Runs a scenario in the browser. A requestAnimationFrame loop feeds wall-clock time to
 * the fixed-step runner; React subscribes through useSyncExternalStore and re-renders
 * when steps have run. Scenario progress is updated after every step and the sim pauses
 * when the scenario ends. The view state includes queued commands, so fast knob turns
 * between steps build on each other.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { applyCommand } from '../../sim/commands';
import { SimRunner, type TimeScale } from '../../sim/recorder';
import {
  initialProgress,
  updateProgress,
  type ScenarioProgress,
} from '../../sim/scenario/progress';
import type { Scenario } from '../../sim/scenario/scenario';
import { sense } from '../../sim/sensors';
import type { Sensors, SimState } from '../../sim/state';
import type { Send } from '../panel/controls';

/** Longest frame gap fed to the sim: a backgrounded tab does not fast-forward on return. */
const MAX_FRAME_S = 0.25;

export class BrowserSim {
  private runner!: SimRunner;
  progress: ScenarioProgress = initialProgress();
  private listeners = new Set<() => void>();
  private version = 0;
  private raf = 0;

  constructor(readonly scenario: Scenario) {
    this.reset();
  }

  private reset() {
    this.progress = initialProgress();
    this.runner = new SimRunner(this.scenario.initial, this.scenario.world, (s) => {
      this.progress = updateProgress(this.progress, s, this.scenario);
    });
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
        if (this.progress.phase === 'ended') this.runner.paused = true;
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
    for (const c of this.runner.pendingCommands) s = applyCommand(s, c, this.scenario.world);
    return s;
  }

  get ended() {
    return this.progress.phase === 'ended';
  }
  get paused() {
    return this.runner.paused;
  }
  setPaused(p: boolean) {
    if (this.ended) return;
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
    this.reset();
    this.runner.timeScale = timeScale;
    this.changed();
  }
}

export interface SimView {
  sim: BrowserSim;
  state: SimState;
  sensors: Sensors;
  progress: ScenarioProgress;
}

export function useSim(scenario: Scenario): SimView {
  const [sim] = useState(() => new BrowserSim(scenario));
  useSyncExternalStore(sim.subscribe, sim.getVersion);
  useEffect(() => sim.run(), [sim]);
  const state = sim.view();
  return { sim, state, sensors: sense(state, scenario.world), progress: sim.progress };
}
