/** Simulation state, commands and sensor readings. Plain serialisable data. */
import type { AircraftState } from './aircraft/model';
import type { ApButton, ApModes } from './autopilot/modes';
import type { NavReading } from './nav/radios';

export interface NavRadio {
  activeMHz: number;
  standbyMHz: number;
  /** Course selected on this radio's HSI/OBS, magnetic. */
  obsDeg: number;
}

export interface SimState {
  /** Steps since the start (20 per second). */
  tick: number;
  aircraft: AircraftState;
  ap: ApModes;
  panel: {
    headingBugDeg: number; // magnetic
    altPreselectFt: number;
    /** Power selector target airspeed. */
    iasCmdKt: number;
  };
  radios: { nav1: NavRadio; nav2: NavRadio; dmeSource: 1 | 2 };
  timer: { running: boolean; elapsedS: number };
}

export type RadioId = 1 | 2;

/** Everything the UI (or a test script) can do. */
export type Command =
  | { type: 'button'; button: ApButton }
  | { type: 'headingBug'; deg: number }
  | { type: 'altPreselect'; ft: number }
  | { type: 'vsTarget'; fpm: number }
  | { type: 'speed'; kt: number }
  | { type: 'course'; radio: RadioId; deg: number }
  | { type: 'standby'; radio: RadioId; mhz: number }
  | { type: 'swap'; radio: RadioId }
  | { type: 'dmeSource'; radio: RadioId }
  | { type: 'timer'; action: 'startStop' | 'reset' };

/** What the instruments show this step, derived from state + world. */
export interface Sensors {
  nav1: NavReading;
  nav2: NavReading;
  /** DME readout for the selected source, NM slant range, or null (no DME / out of range). */
  dmeNm: number | null;
  headingMagDeg: number;
  tasKt: number;
}
