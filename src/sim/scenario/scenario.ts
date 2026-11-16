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
import {
  isDaLine,
  type Leg,
  type Minimums,
  type Procedure,
  type Start,
} from '../../procedures/schema';
import { magToTrue, reciprocal } from '../geo/angles';
import { destination, type LatLon } from '../geo/geodesy';
import { initialState } from '../loop';
import type { NavData } from '../navdata/types';
import { navdataForProcedure } from '../navdata/rnav';
import type { SimState } from '../state';
import { buildWorld, type World } from '../world';
import { gpsDatabase } from '../gps/flightplan';
import { buildGpsWorld } from '../gps/receiver';

export type Ceiling = 'above' | 'below';

export interface ScenarioOptions {
  startId: string;
  /** Actual weather relative to the minimums (hidden from the learner): above → the runway
   *  comes into sight by DA/MDA; below → it does not. */
  ceiling: Ceiling;
  gsOutOfService: boolean;
  /**
   * What the learner chose on the briefing for the runway at minimums: random (default, the
   * outcome is hidden) or a fixed outcome. Restart keeps a fixed choice and re-rolls a random one.
   */
  weatherPick?: WeatherPick;
  /** Instrument panel flown (default steam). The sim does not depend on it; the debrief shows it. */
  panel?: PanelKind;
  /**
   * RNAV: WAAS service this flight (hidden like the weather): true (default) → LPV / LNAV/VNAV /
   * LP available; false → the GPS annunciates LNAV.
   */
  waasAvailable?: boolean;
  /** Briefing choice for WAAS: random (default), or a fixed outcome. */
  waasPick?: WaasPick;
}

export type WaasPick = 'random' | 'available' | 'unavailable';

/** WAAS this flight: a chosen outcome, or random from `rand` in [0, 1). */
export function pickWaas(pick: WaasPick | undefined, rand: number): boolean {
  if (pick === 'available') return true;
  if (pick === 'unavailable') return false;
  return rand < 0.5;
}

/** WAAS for a scenario's options (default available). */
export const waasOf = (o: ScenarioOptions): boolean => o.waasAvailable ?? true;

/** Briefing choice for the runway at minimums. */
export type WeatherPick = 'random' | Ceiling;

/** The actual ceiling for a flight: a chosen outcome, or random from `rand` in [0, 1). */
export function pickCeiling(pick: WeatherPick | undefined, rand: number): Ceiling {
  if (pick === 'above' || pick === 'below') return pick;
  return rand < 0.5 ? 'above' : 'below';
}

/** Steam gauges (V1) or the Glass PFD (V2). */
export type PanelKind = 'steam' | 'glass';

/** The panel a scenario is flown on. */
export const panelOf = (o: ScenarioOptions): PanelKind => o.panel ?? 'steam';

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
  /**
   * Circling-only procedure (VOR/DME-B): the airport reference point, against which "in
   * sight" is judged (any runway); continuing past the MAP circles to land on `runway`.
   */
  circlingTo: LatLon | null;
  weather: Weather;
}

export type Category = 'A' | 'B';
/** Approach category from the target airspeed (SPEC: A ≤ 90 KIAS, B 91–110). */
export const categoryFor = (iasKt: number): Category => (iasKt <= 90 ? 'A' : 'B');

export interface ActiveMinimums {
  label: string;
  /** DA for a precision approach with the glideslope, otherwise MDA. */
  kind: 'DA' | 'MDA';
  altFt: number;
  visibilitySm: number;
  category: Category;
}

/**
 * The minimums that apply: ILS when the GS is usable, else the LOC/VOR line. RNAV: the best
 * line the GPS can fly (LPV, LNAV/VNAV, LP, then LNAV), or LNAV without WAAS.
 */
/** A circling-only procedure (e.g. VOR/DME-B): every minimums line is a circling one. */
export const isCirclingOnly = (p: Procedure) => p.minimums.every((m) => m.kind === 'CIRCLING');

export function activeMinimums(
  p: Procedure,
  gsOutOfService: boolean,
  iasKt: number,
  waasAvailable = true,
): ActiveMinimums {
  const hasGs = p.approach.some((l) => l.type === 'final' && l.glideslope) && !gsOutOfService;
  const pick = (k: Minimums['kind'][]) => p.minimums.find((m) => k.includes(m.kind));
  const rnav = (waasAvailable ? (['LPV', 'LNAV/VNAV', 'LP', 'LNAV'] as const) : (['LNAV'] as const))
    .map((k) => pick([k]))
    .find((m) => m !== undefined);
  const m =
    (p.rnav ? rnav : hasGs ? pick(['ILS']) : pick(['LOC', 'VOR', 'CIRCLING'])) ?? p.minimums[0]!;
  const category = categoryFor(iasKt);
  return {
    label: m.label,
    kind: isDaLine(m.kind) ? 'DA' : 'MDA',
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
      // Half the minimum visibility, as a reportable value (down to a quarter mile).
      visibilitySm: Math.max(0.25, Math.floor((min.visibilitySm / 2) * 4) / 4),
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
  allNavdata: NavData,
  options: ScenarioOptions,
): Scenario {
  // This airport's view: runway and terminal waypoint idents shared with other airports
  // (RW03 at KCPR and KCNY) resolve to this airport's.
  const navdata = navdataForProcedure(allNavdata, procedure);
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
  const db = gpsDatabase(procedure, navdata, airport.magVarEastDeg);
  const world = buildWorld(navdata, {
    magVarEastDeg: airport.magVarEastDeg,
    tchFt,
    gps: db
      ? buildGpsWorld(db, navdata, waasOf(options), {
          goAroundSequencesMissed: panelOf(options) === 'glass',
        })
      : null,
    gsOutOfService: options.gsOutOfService,
    ...(procedure.expandedServiceVolumeNm
      ? { expandedServiceVolumeNm: procedure.expandedServiceVolumeNm }
      : {}),
  });
  const rwy = runwayEndFor(navdata, procedure.airport, procedure.runway);
  const thresholdElevationFt = rwy.displacedThreshold?.elevationFt ?? rwy.elevationFt;
  // A lead-in starts the aircraft short of the start fix, on the reciprocal of its heading;
  // an offset starts it off to one side of the fix, on its own heading.
  const startFix = resolveFixDef(start.position, { navdata, procedure });
  const startPosition = start.offset
    ? destination(
        startFix,
        magToTrue(start.offset.bearingMag, airport.magVarEastDeg),
        start.offset.distanceNm,
      )
    : start.leadInNm
      ? destination(
          startFix,
          magToTrue(reciprocal(start.headingMag), airport.magVarEastDeg),
          start.leadInNm,
        )
      : startFix;
  const initial = initialState(
    {
      position: startPosition,
      altitudeFt: start.altitudeFt,
      headingMagDeg: start.headingMag,
      iasKt: start.iasKt,
      nav1MHz: start.nav1MHz,
      nav2MHz: start.nav2MHz,
    },
    world,
  );
  const min = activeMinimums(procedure, options.gsOutOfService, start.iasKt, waasOf(options));
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
    circlingTo: isCirclingOnly(procedure) ? airport.position : null,
    weather: weatherFor(min, thresholdElevationFt, options.ceiling, start.altitudeFt),
  };
}

/**
 * The same scenario for Restart / Fly again: a random weather choice is picked again (`rand` in
 * [0, 1)); an outcome chosen on the briefing is kept.
 */
export function rerollWeather(sc: Scenario, navdata: NavData, rand: number): Scenario {
  return buildScenario(sc.procedure, navdata, {
    ...sc.options,
    ceiling: pickCeiling(sc.options.weatherPick, rand),
    ...(sc.procedure.rnav
      ? { waasAvailable: pickWaas(sc.options.waasPick, (rand * 7.31) % 1) }
      : {}),
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
  /** Trainer hints: how to set up this approach in the sim. */
  hints: string[];
  notes: string[];
}

export function briefing(sc: Scenario): Briefing {
  const p = sc.procedure;
  const min = activeMinimums(p, sc.options.gsOutOfService, sc.start.iasKt, waasOf(sc.options));
  const hasGs = !!sc.final.glideslope;
  return {
    title: `${p.airport} ${p.name}`,
    startName: sc.start.name,
    clearance: sc.start.clearance,
    weather: sc.weather.reported,
    glideslope: p.rnav
      ? rnavEquipmentText(p)
      : !hasGs
        ? 'Non-precision approach (no glideslope).'
        : sc.options.gsOutOfService
          ? 'Glideslope OUT OF SERVICE: fly the LOC-only approach to the MDA.'
          : 'Glideslope in service.',
    minimums: `${min.label}, category ${min.category} at ${sc.start.iasKt} KIAS: ${min.kind} ${min.altFt.toLocaleString('en-US')} ft, visibility ${fmtVis(min.visibilitySm)} SM`,
    missedApproach: p.missedText,
    hints: briefingHints(sc),
    notes: p.notes,
  };
}

/** Briefing equipment line for an RNAV approach. */
function rnavEquipmentText(p: Procedure): string {
  const r = p.rnav!;
  const lines = p.minimums.map((m) => m.label).join(', ');
  const waas = r.waas ? `WAAS channel ${r.waas.channel}, ${r.waas.id}.` : 'No WAAS: LNAV only.';
  return `${r.equipment.replace(/\.$/, '')}. ${waas} Minimums lines: ${lines}. The GPS annunciates the line it can fly about 2 NM before the FAF.`;
}

function briefingHints(sc: Scenario): string[] {
  // The CRS-on-the-localizer advice is given in the debrief when it matters (rules/course-setting).
  // TAA areas and altitudes are not repeated here: the learner reads them from the plate.
  const hints: string[] = [];
  if (sc.final.map.timing)
    hints.push(
      `This trainer identifies the MAP by DME (${sc.final.map.fix}). The chart's timing table is a backup.`,
    );
  return hints;
}
