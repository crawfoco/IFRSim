/**
 * What the pilot sees out of the window (pure): in the clear above the overcast, in cloud,
 * or below the base, and whether the runway is in sight. Used by the outside view, the
 * decision at DA/MDA (progress.ts) and the debrief.
 */
import { signedAngleDiff } from '../geo/angles';
import { distanceNm, inverse, METRES_PER_NM } from '../geo/geodesy';
import type { SimState } from '../state';
import type { Scenario } from './scenario';

export const NM_PER_SM = 0.868976;

export type Layer = 'clear' | 'cloud' | 'below';

export interface OutsideView {
  layer: Layer;
  /** Below the base and within the visibility of the threshold. */
  runwayInSight: boolean;
  /** Where the threshold is: bearing relative to the nose (+ right), distance, and the angle
   *  below the horizon. Null unless the runway is in sight. */
  runway: {
    relBearingDeg: number;
    distanceNm: number;
    depressionDeg: number;
    /** Height above the threshold. */
    aglFt: number;
    /** Runway alignment relative to the nose (+ right). */
    relAlignmentDeg: number;
  } | null;
}

export function layerAt(altitudeFt: number, sc: Scenario): Layer {
  if (altitudeFt >= sc.weather.topsFtMsl) return 'clear';
  if (altitudeFt >= sc.weather.baseFtMsl) return 'cloud';
  return 'below';
}

export function runwayInSight(s: SimState, sc: Scenario): boolean {
  return (
    layerAt(s.aircraft.altitudeFt, sc) === 'below' &&
    distanceNm(s.aircraft.position, sc.runway.threshold) <= sc.weather.visibilitySm * NM_PER_SM
  );
}

export function outsideView(s: SimState, sc: Scenario): OutsideView {
  const layer = layerAt(s.aircraft.altitudeFt, sc);
  const inSight = runwayInSight(s, sc);
  if (!inSight) return { layer, runwayInSight: false, runway: null };
  const g = inverse(s.aircraft.position, sc.runway.threshold);
  const dNm = g.distanceM / METRES_PER_NM;
  const aglFt = s.aircraft.altitudeFt - sc.thresholdElevationFt;
  return {
    layer,
    runwayInSight: true,
    runway: {
      relBearingDeg: signedAngleDiff(g.initialBearingDeg, s.aircraft.headingTrueDeg),
      distanceNm: dNm,
      depressionDeg: (Math.atan2(aglFt, Math.max(dNm, 0.01) * 6076.12) * 180) / Math.PI,
      aglFt,
      relAlignmentDeg: signedAngleDiff(sc.runway.trueAlignmentDeg, s.aircraft.headingTrueDeg),
    },
  };
}
