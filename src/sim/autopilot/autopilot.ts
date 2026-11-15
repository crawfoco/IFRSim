/** Autopilot: update modes from capture signals, then run the laws for the active modes. */
import type { AircraftControls } from '../aircraft/model';
import { magToTrue } from '../geo/angles';
import type { NavReading } from '../nav/radios';
import type { Sensors, SimState } from '../state';
import type { World } from '../world';
import {
  altCaptureReady,
  altitudeVs,
  glideslopeVs,
  gsCaptureReady,
  headingBank,
  lateralCaptureReady,
  trackCommand,
} from './laws';
import { updateModes, type ApModes, type ModeContext } from './modes';

/** Mode-logic view of the current situation. NAV1 is the autopilot's nav source. */
export function modeContext(state: SimState, sensors: Sensors): ModeContext {
  const st = sensors.nav1.station;
  return {
    navKind: st?.kind ?? null,
    hasGs: st?.kind === 'LOC' && st.glidePath !== null,
    altitudeFt: state.aircraft.altitudeFt,
    vsFpm: state.aircraft.vsFpm,
    altPreselectFt: state.panel.altPreselectFt,
  };
}

/**
 * Course datum for NAV/APR: the HSI course pointer (NAV1's CRS), as on an HSI-coupled
 * autopilot. On a VOR it is the selected radial (station declination). On a localizer the
 * needle comes from the signal alone, but the autopilot still holds the CRS as its course:
 * set a few degrees off, it tracks with a small offset; far off, it intercepts poorly or
 * not at all; on the reciprocal it turns away. Setting CRS to the localizer course is the
 * pilot's job.
 */
export function navCourseTrue(reading: NavReading, obsDegMag: number): number | null {
  const st = reading.station;
  if (!st) return null;
  if (st.kind === 'VOR') return magToTrue(obsDegMag, st.navaid.declinationEastDeg);
  return magToTrue(obsDegMag, st.loc.magVarEastDeg);
}

export function runAutopilot(
  state: SimState,
  sensors: Sensors,
  world: World,
): { ap: ApModes; controls: AircraftControls } {
  const ac = state.aircraft;
  const iasCmdKt = state.panel.iasCmdKt;
  if (!state.ap.engaged) {
    // Hands off: wings level, trimmed for the current vertical speed.
    return { ap: state.ap, controls: { bankCmdDeg: 0, vsCmdFpm: ac.vsFpm, iasCmdKt } };
  }

  const nav = sensors.nav1.indication;
  const course = navCourseTrue(sensors.nav1, state.radios.nav1.obsDeg);
  const gs = sensors.nav1.gs;
  const gp = sensors.nav1.station?.kind === 'LOC' ? sensors.nav1.station.glidePath : null;
  const gsAngle = gp?.angleDeg ?? 3;

  const ap = updateModes(
    state.ap,
    {
      navValid: !!nav && !nav.flag,
      lateralCapture:
        !!nav && course !== null && lateralCaptureReady(nav, ac.headingTrueDeg, course),
      gsValid: !!gs && !gs.flag,
      gsCapture: !!gs && gsCaptureReady(gs, gsAngle, sensors.tasKt),
      altCapture: altCaptureReady(state.panel.altPreselectFt, ac.altitudeFt, ac.vsFpm),
    },
    modeContext(state, sensors),
  );

  let bankCmdDeg = 0;
  switch (ap.lateral) {
    case 'ROL':
      bankCmdDeg = 0;
      break;
    case 'HDG':
      bankCmdDeg = headingBank(
        ac.headingTrueDeg,
        magToTrue(state.panel.headingBugDeg, world.magVarEastDeg),
      );
      break;
    case 'NAV':
    case 'APR':
      // A flagged needle (overhead, abeam) holds the current heading until it comes back.
      bankCmdDeg =
        nav && !nav.flag && course !== null
          ? headingBank(ac.headingTrueDeg, trackCommand(nav, course))
          : 0;
      break;
  }

  let vsCmdFpm = ap.vsRefFpm;
  if (ap.vertical === 'ALT') vsCmdFpm = altitudeVs(ap.holdAltFt, ac.altitudeFt);
  else if (ap.vertical === 'GS')
    vsCmdFpm = gs && !gs.flag ? glideslopeVs(gs, gsAngle, sensors.tasKt) : ac.vsFpm;

  return { ap, controls: { bankCmdDeg, vsCmdFpm, iasCmdKt } };
}
