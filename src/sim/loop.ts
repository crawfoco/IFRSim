/**
 * Fixed-step simulation loop (20 Hz). `step` is a pure reducer: the same state, commands
 * and world always give the same next state, which makes replays exact.
 */
import { initialAircraft, stepAircraft } from './aircraft/model';
import { runAutopilot } from './autopilot/autopilot';
import { AP_OFF } from './autopilot/modes';
import { magToTrue } from './geo/angles';
import type { LatLon } from './geo/geodesy';
import { applyCommand } from './commands';
import { sense } from './sensors';
import type { Command, SimState } from './state';
import type { World } from './world';

export const STEP_HZ = 20;
export const DT = 1 / STEP_HZ;

export interface StartCondition {
  position: LatLon;
  altitudeFt: number;
  headingMagDeg: number;
  iasKt?: number;
  nav1MHz?: number;
  nav2MHz?: number;
  obs1Deg?: number;
  obs2Deg?: number;
}

export function initialState(start: StartCondition, world: World): SimState {
  const ias = start.iasKt ?? 100;
  const nav1 = start.nav1MHz ?? 108.0;
  const nav2 = start.nav2MHz ?? 108.0;
  return {
    tick: 0,
    aircraft: initialAircraft(
      start.position,
      start.altitudeFt,
      magToTrue(start.headingMagDeg, world.magVarEastDeg),
      ias,
    ),
    ap: { ...AP_OFF, holdAltFt: start.altitudeFt },
    panel: {
      headingBugDeg: start.headingMagDeg,
      altPreselectFt: start.altitudeFt,
      iasCmdKt: ias,
      mapOn: false,
      cdiSource: 'NAV1',
      brg1: null,
      brg2: null,
    },
    radios: {
      nav1: { activeMHz: nav1, standbyMHz: nav1, obsDeg: start.obs1Deg ?? 0 },
      nav2: { activeMHz: nav2, standbyMHz: nav2, obsDeg: start.obs2Deg ?? 0 },
      dmeSource: 1,
    },
    timer: { running: false, elapsedS: 0 },
    goAroundTick: null,
  };
}

export function step(state: SimState, commands: readonly Command[], world: World): SimState {
  let s = state;
  for (const c of commands) s = applyCommand(s, c, world);
  const sensors = sense(s, world);
  const { ap, controls } = runAutopilot(s, sensors, world);
  return {
    ...s,
    tick: s.tick + 1,
    ap,
    aircraft: stepAircraft(s.aircraft, controls, DT),
    timer: s.timer.running ? { ...s.timer, elapsedS: s.timer.elapsedS + DT } : s.timer,
  };
}
