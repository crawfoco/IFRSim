/** Simulation state, commands and sensor readings. Plain serialisable data. */
import type { AircraftState } from './aircraft/model';
import type { ApButton, ApModes } from './autopilot/modes';
import type { NavReading } from './nav/radios';
import type { BearingSource, CdiSource } from './nav/source';
import type { GpsCommand, GpsReading, GpsState } from './gps/receiver';

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
    /** Moving map shown (a training aid; its use is noted in the debrief). */
    mapOn: boolean;
    /** HSI nav source, which the autopilot follows (glass panel; steam stays on NAV1). */
    cdiSource: CdiSource;
    /** Bearing pointer sources (glass panel); null = off. */
    brg1: BearingSource;
    brg2: BearingSource;
  };
  radios: { nav1: NavRadio; nav2: NavRadio; dmeSource: 1 | 2 };
  timer: { running: boolean; elapsedS: number };
  /** Tick of the first GA (TOGA) press: the learner's go-around decision. */
  goAroundTick: number | null;
  /** GPS flight plan and sequencing (V3). */
  gps: GpsState;
}

export type RadioId = 1 | 2;

/** Everything the UI (or a test script) can do. */
export type Command =
  | { type: 'button'; button: ApButton }
  | { type: 'headingBug'; deg: number }
  /** Push the HDG knob: heading bug to the current magnetic heading. */
  | { type: 'syncHeadingBug' }
  | { type: 'altPreselect'; ft: number }
  | { type: 'vsTarget'; fpm: number }
  | { type: 'speed'; kt: number }
  | { type: 'course'; radio: RadioId; deg: number }
  | { type: 'standby'; radio: RadioId; mhz: number }
  | { type: 'swap'; radio: RadioId }
  | { type: 'dmeSource'; radio: RadioId }
  | { type: 'timer'; action: 'startStop' | 'reset' }
  /** Learner listened to a radio's Morse ident. No state change; logged for scoring. */
  | { type: 'ident'; radio: RadioId }
  | { type: 'map'; on: boolean }
  /** Glass panel: the CDI button (next HSI nav source). */
  | { type: 'cdi' }
  /** Glass panel: a BRG button (next source for that bearing pointer). */
  | { type: 'bearing'; pointer: 1 | 2 }
  /** Steam panel NAV/GPS button: set the HSI (and autopilot) source directly. */
  | { type: 'cdiSet'; source: CdiSource }
  /** GPS: load an approach, activate it, Direct-To, SUSP. */
  | GpsCommand;

/** What the instruments show this step, derived from state + world. */
export interface Sensors {
  nav1: NavReading;
  nav2: NavReading;
  /** DME readout for the selected source, NM slant range, or null (no DME / out of range). */
  dmeNm: number | null;
  headingMagDeg: number;
  tasKt: number;
  /** GPS reading (flagged when nothing is active). */
  gps: GpsReading;
}
