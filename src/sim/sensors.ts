/** Derive instrument readings from the sim state. Pure. */
import { tasKt } from './aircraft/model';
import { trueToMag } from './geo/angles';
import { readDme, readNav } from './nav/radios';
import type { Sensors, SimState } from './state';
import type { World } from './world';

/** What the instruments read in this state. */
export function sense(state: SimState, world: World): Sensors {
  const ac = { position: state.aircraft.position, altitudeFt: state.aircraft.altitudeFt };
  const { nav1, nav2, dmeSource } = state.radios;
  const r1 = readNav(world, nav1.activeMHz, nav1.obsDeg, ac);
  const r2 = readNav(world, nav2.activeMHz, nav2.obsDeg, ac);
  return {
    nav1: r1,
    nav2: r2,
    dmeNm: readDme((dmeSource === 1 ? r1 : r2).station, ac, world),
    headingMagDeg: trueToMag(state.aircraft.headingTrueDeg, world.magVarEastDeg),
    tasKt: tasKt(state.aircraft.iasKt, state.aircraft.altitudeFt),
  };
}
