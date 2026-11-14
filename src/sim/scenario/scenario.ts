/**
 * Scenario: a procedure, a start condition and the options chosen on the briefing screen
 * (weather relative to minimums, glideslope outage), turned into a world, an initial
 * sim state and briefing text.
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
  /** Weather relative to the minimums: above → runway in sight at DA/MDA. */
  ceiling: Ceiling;
  gsOutOfService: boolean;
}

export interface Weather {
  ceilingFtAgl: number;
  visibilitySm: number;
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

/**
 * Weather consistent with the chosen option. Ceiling and visibility are both either
 * comfortably above minimums or below them, so the outcome at DA/MDA is unambiguous.
 */
export function weatherFor(
  min: ActiveMinimums,
  thresholdElevFt: number,
  ceiling: Ceiling,
): Weather {
  const hat = min.altFt - thresholdElevFt;
  if (ceiling === 'above')
    return { ceilingFtAgl: roundUp100(hat) + 300, visibilitySm: Math.max(2, min.visibilitySm * 2) };
  return {
    ceilingFtAgl: Math.max(100, roundUp100(hat) - 300),
    visibilitySm: Math.max(0.25, min.visibilitySm / 2),
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
    weather: weatherFor(min, thresholdElevationFt, options.ceiling),
  };
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
    weather: `Ceiling ${sc.weather.ceilingFtAgl.toLocaleString('en-US')} ft overcast, visibility ${fmtVis(sc.weather.visibilitySm)} SM`,
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
