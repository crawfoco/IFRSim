/**
 * Everything the Glass PFD shows, derived from the sim state and sensors. Pure, so the PFD's
 * values can be tested without rendering.
 */
import { displayPitchDeg, speedTrendKt } from '../../../sim/aircraft/attitude';
import { apNavSource } from '../../../sim/autopilot/autopilot';
import { bearingInfo, type BearingInfo } from '../../../sim/nav/bearing';
import type { BearingSource, NavSourceId } from '../../../sim/nav/source';
import type { ActiveMinimums } from '../../../sim/scenario/scenario';
import type { Sensors, SimState } from '../../../sim/state';
import type { World } from '../../../sim/world';
import { courseDeviation, glideslopeDeviation, gpsDeviation, gpsGlidepath } from '../geometry';
import type {
  AltTapeProps,
  AttitudeProps,
  GlassHsiProps,
  SpeedTapeProps,
  VsiProps,
} from './layout';

/** No altimeter-setting model: the BARO box shows standard pressure (SPEC V2 decision). */
export const BARO_IN_HG = 29.92;

export interface DmeInfo {
  source: NavSourceId;
  freqMHz: number;
  /** Paired station ident when received, else null (the window shows the frequency). */
  ident: string | null;
  /** Null: no DME (none paired, out of range or nothing tuned); the window shows dashes. */
  dmeNm: number | null;
}

export interface PfdData {
  attitude: AttitudeProps;
  speed: SpeedTapeProps;
  alt: AltTapeProps;
  vsi: VsiProps;
  hsi: GlassHsiProps;
  boxes: { headingBugDeg: number; courseDeg: number; baroInHg: number };
  /** DME window: the DME source radio (same setting the scoring checks), and its distance. */
  dme: DmeInfo;
  /** Info boxes for the bearing pointers; null when that pointer is off. */
  brg1: BearingInfo | null;
  brg2: BearingInfo | null;
}

export function pfdData(
  state: SimState,
  sensors: Sensors,
  world: Pick<World, 'serviceRangeNm'>,
  minimums: Pick<ActiveMinimums, 'kind' | 'altFt'> | null,
): PfdData {
  const ac = state.aircraft;
  const fix = { position: ac.position, altitudeFt: ac.altitudeFt };
  const cdi = apNavSource(state, sensors);
  const brg = (src: BearingSource): BearingInfo | null =>
    src === null
      ? null
      : src === 'GPS'
        ? {
            source: 'GPS',
            freqMHz: 0,
            ident: sensors.gps.activeWaypoint,
            bearingMagDeg: sensors.gps.flag ? null : sensors.gps.bearingMagDeg,
            dmeNm: sensors.gps.distanceNm,
          }
        : bearingInfo(src, src === 'NAV1' ? sensors.nav1 : sensors.nav2, fix, world);
  const dmeReading = state.radios.dmeSource === 1 ? sensors.nav1 : sensors.nav2;
  const brg1 = brg(state.panel.brg1);
  const brg2 = brg(state.panel.brg2);
  return {
    attitude: {
      pitchDeg: displayPitchDeg(ac.vsFpm, sensors.tasKt, ac.iasKt),
      bankDeg: ac.bankDeg,
    },
    speed: { iasKt: ac.iasKt, trendKt: speedTrendKt(ac.iasKt, state.panel.iasCmdKt) },
    alt: {
      altitudeFt: ac.altitudeFt,
      selectedAltFt: state.panel.altPreselectFt,
      minimums: minimums && { kind: minimums.kind, altFt: minimums.altFt },
    },
    vsi: {
      vsFpm: ac.vsFpm,
      selectedVsFpm: state.ap.engaged && state.ap.vertical === 'VS' ? state.ap.vsRefFpm : null,
    },
    hsi: {
      headingMagDeg: sensors.headingMagDeg,
      headingBugDeg: state.panel.headingBugDeg,
      courseDeg: cdi.obsDeg,
      cdiSource: state.panel.cdiSource,
      deviation: cdi.kind === 'GPS' ? gpsDeviation(cdi.gps) : courseDeviation(cdi.reading),
      glideslope: cdi.kind === 'GPS' ? gpsGlidepath(cdi.gps) : glideslopeDeviation(cdi.reading),
      gpsMode:
        cdi.kind === 'GPS' && !cdi.gps.flag
          ? [cdi.gps.annunciation ?? cdi.gps.phase, cdi.gps.suspended ? 'SUSP' : null]
              .filter(Boolean)
              .join(' ')
          : null,
      bearing1Deg: brg1?.bearingMagDeg ?? null,
      bearing2Deg: brg2?.bearingMagDeg ?? null,
    },
    boxes: {
      headingBugDeg: state.panel.headingBugDeg,
      courseDeg: cdi.obsDeg,
      baroInHg: BARO_IN_HG,
    },
    dme: {
      source: state.radios.dmeSource === 1 ? 'NAV1' : 'NAV2',
      freqMHz: dmeReading.freqMHz,
      ident: dmeReading.ident,
      dmeNm: sensors.dmeNm,
    },
    brg1,
    brg2,
  };
}
