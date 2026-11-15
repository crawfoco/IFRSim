/**
 * Scenario: a procedure, a start condition and the options (weather relative to minimums,
 * glideslope outage), turned into a world, an initial sim state and briefing text.
 *
 * The weather is hidden from the learner: the briefing reports a ceiling range that
 * straddles the minimums, and the app picks above or below at random. Every flight starts
 * above the cloud tops and descends into the overcast; whether the runway comes into sight
 * at DA/MDA is the learner's decision to make (see progress.ts and OutsideView).
 */
import { courseTrueDeg, resolveFixDef, resolveFixes, runwayEndFor } from '../../procedures/resolve';
import type { Leg, Minimums, Procedure, Start } from '../../procedures/schema';
import type { LatLon } from '../geo/geodesy';
import { initialState } from '../loop';
import type { NavData } from '../navdata/types';
import type { SimState } from '../state';
import { buildWorld, type World } from '../world';

export type Ceiling = 'above' | 'below';

export interface ScenarioOptions {
  startId: string;
  /** Actual weather relative to the minimums (hidden from the learner): above → the runway
   *  comes into sight by DA/MDA; below → it does not. */
  ceiling: Ceiling;
  gsOutOfService: boolean;
}

export interface Weather {
  /** Actual cloud base above the threshold, and visibility. */
  ceilingFtAgl: number;
  visibilitySm: number;
  /** Cloud base and tops, MSL. */
  baseFtMsl: number;
  topsFtMsl: number;
  /** What the briefing reports: a range that straddles the minimums either way. */
  reported: string;
}

type FinalLeg = Extract<Leg, { type: 'final' }>;
type HoldLeg = Extract<Leg, { type: 'hold' }>;

export interface Scenario {
  procedure: Procedure;
  start: Start;
  options: ScenarioOptions;
  world: World;
  initial: SimState;
  fixes: Record<string, LatLon>;
  final: FinalLeg;
  /** The hold at the end of the missed approach. */
  missedHold: HoldLeg;
  thresholdElevationFt: number;
  /** True course of the final approach. */
  finalCourseTrueDeg: number;
  /** Landing threshold (displaced if any) and runway true alignment, for the outside view. */
  runway: { threshold: LatLon; trueAlignmentDeg: number };
  weather: Weather;
}

export type Category = 'A' | 'B';
/** Approach category from the target airspeed (SPEC: A ≤ 90 KIAS, B 91–120). */
export const categoryFor = (iasKt: number): Category => (iasKt <= 90 ? 'A' : 'B');

export interface ActiveMinimums {
  label: string;
  /** DA for a precision approach with the glideslope, otherwise MDA. */
  kind: 'DA' | 'MDA';
  altFt: number;
  visibilitySm: number;
  category: Category;
}

/** The minimums that apply: ILS when the GS is usable, else the LOC/VOR line. */
export function activeMinimums(
  p: Procedure,
  gsOutOfService: boolean,
  iasKt: number,
): ActiveMinimums {
  const hasGs = p.approach.some((l) => l.type === 'final' && l.glideslope) && !gsOutOfService;
  const pick = (k: Minimums['kind'][]) => p.minimums.find((m) => k.includes(m.kind));
  const m = (hasGs ? pick(['ILS']) : pick(['LOC', 'VOR'])) ?? p.minimums[0]!;
  const category = categoryFor(iasKt);
  return {
    label: m.label,
    kind: m.kind === 'ILS' ? 'DA' : 'MDA',
    altFt: m[category].altFt,
    visibilitySm: m[category].visibilitySm,
    category,
  };
}

const roundUp100 = (ft: number) => Math.ceil(ft / 100) * 100;
const roundDown100 = (ft: number) => Math.floor(ft / 100) * 100;
const fmtFt = (ft: number) => ft.toLocaleString('en-US');

/** Ceiling and visibility either side of the minimums, so the outcome at DA/MDA is clear. */
function layers(min: ActiveMinimums, thresholdElevFt: number) {
  const hat = min.altFt - thresholdElevFt;
  return {
    above: { ceilingFtAgl: roundUp100(hat) + 300, visibilitySm: Math.max(3, min.visibilitySm * 2) },
    below: {
      ceilingFtAgl: Math.max(100, roundUp100(hat) - 300),
      visibilitySm: Math.max(0.25, min.visibilitySm / 2),
    },
  };
}

/**
 * The actual weather for the chosen option. The cloud tops are 500 ft below the start
 * altitude (every flight starts in the clear above the overcast), and at least 1,000 ft
 * above the base.
 */
export function weatherFor(
  min: ActiveMinimums,
  thresholdElevFt: number,
  ceiling: Ceiling,
  startAltFt: number,
): Weather {
  const l = layers(min, thresholdElevFt);
  const actual = l[ceiling];
  const baseFtMsl = thresholdElevFt + actual.ceilingFtAgl;
  const highBase = thresholdElevFt + l.above.ceilingFtAgl;
  const topsFtMsl = Math.max(roundDown100(startAltFt - 500), roundUp100(highBase + 1000));
  return {
    ...actual,
    baseFtMsl,
    topsFtMsl,
    reported: `Overcast, ceiling variable ${fmtFt(l.below.ceilingFtAgl)}–${fmtFt(l.above.ceilingFtAgl)} ft, visibility ${fmtVis(l.below.visibilitySm)}–${fmtVis(l.above.visibilitySm)} SM; tops ${fmtFt(topsFtMsl)} ft`,
  };
}

export function buildScenario(
  procedure: Procedure,
  navdata: NavData,
  options: ScenarioOptions,
): Scenario {
  const start = procedure.starts.find((s) => s.id === options.startId);
  if (!start) throw new Error(`${procedure.id} has no start "${options.startId}"`);
  const final = procedure.approach.find((l): l is FinalLeg => l.type === 'final');
  if (!final) throw new Error(`${procedure.id} has no final`);
  const missedHold = [...procedure.missed].reverse().find((l): l is HoldLeg => l.type === 'hold');
  if (!missedHold) throw new Error(`${procedure.id} missed approach has no hold`);

  const airport = navdata.airports[procedure.airport];
  if (!airport) throw new Error(`unknown airport ${procedure.airport}`);
  const tchFt: Record<string, number> = {};
  if (final.glideslope && 'loc' in final.course) tchFt[final.course.loc] = final.glideslope.tchFt;
  const world = buildWorld(navdata, {
    magVarEastDeg: airport.magVarEastDeg,
    tchFt,
    gsOutOfService: options.gsOutOfService,
    ...(procedure.expandedServiceVolumeNm
      ? { expandedServiceVolumeNm: procedure.expandedServiceVolumeNm }
      : {}),
  });
  const rwy = runwayEndFor(navdata, procedure.airport, procedure.runway);
  const thresholdElevationFt = rwy.displacedThreshold?.elevationFt ?? rwy.elevationFt;
  const initial = initialState(
    {
      position: resolveFixDef(start.position, { navdata, procedure }),
      altitudeFt: start.altitudeFt,
      headingMagDeg: start.headingMag,
      iasKt: start.iasKt,
      nav1MHz: start.nav1MHz,
      nav2MHz: start.nav2MHz,
    },
    world,
  );
  const min = activeMinimums(procedure, options.gsOutOfService, start.iasKt);
  return {
    procedure,
    start,
    options,
    world,
    initial,
    fixes: resolveFixes(procedure, navdata),
    final,
    missedHold,
    thresholdElevationFt,
    finalCourseTrueDeg: courseTrueDeg(final.course, navdata),
    runway: {
      threshold: rwy.displacedThreshold?.position ?? rwy.threshold,
      trueAlignmentDeg: rwy.trueAlignmentDeg,
    },
    weather: weatherFor(min, thresholdElevationFt, options.ceiling, start.altitudeFt),
  };
}

/** The same scenario with the hidden weather picked again (`rand` in [0, 1)). */
export function rerollWeather(sc: Scenario, navdata: NavData, rand: number): Scenario {
  return buildScenario(sc.procedure, navdata, {
    ...sc.options,
    ceiling: rand < 0.5 ? 'above' : 'below',
  });
}

const fmtVis = (sm: number) => {
  const whole = Math.floor(sm);
  const frac = sm - whole;
  const f = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : '';
  return `${whole > 0 ? whole : ''}${f}` || '0';
};

export interface Briefing {
  title: string;
  startName: string;
  clearance: string;
  weather: string;
  glideslope: string;
  minimums: string;
  missedApproach: string;
  notes: string[];
}

export function briefing(sc: Scenario): Briefing {
  const p = sc.procedure;
  const min = activeMinimums(p, sc.options.gsOutOfService, sc.start.iasKt);
  const hasGs = !!sc.final.glideslope;
  return {
    title: `${p.airport} ${p.name}`,
    startName: sc.start.name,
    clearance: sc.start.clearance,
    weather: sc.weather.reported,
    glideslope: !hasGs
      ? 'Non-precision approach (no glideslope).'
      : sc.options.gsOutOfService
        ? 'Glideslope OUT OF SERVICE: fly the LOC-only approach to the MDA.'
        : 'Glideslope in service.',
    minimums: `${min.label}, category ${min.category} at ${sc.start.iasKt} KIAS: ${min.kind} ${min.altFt.toLocaleString('en-US')} ft, visibility ${fmtVis(min.visibilitySm)} SM`,
    missedApproach: p.missedText,
    notes: p.notes,
  };
}
