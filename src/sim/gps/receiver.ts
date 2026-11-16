/**
 * Generic WAAS GPS receiver: flight-plan state, leg sequencing (fly-by turn anticipation,
 * fly-over, holds, SUSP at the MAP), CDI scaling, approach annunciation and the reading the
 * HSI and the autopilot use. Pure: `stepGps` advances the state after each sim step, and
 * `gpsReading` derives the instrument reading from the state.
 *
 * No position error, no wind, no integrity loss (deferred).
 */
import { clamp, DEG, normalize360, signedAngleDiff, trueToMag } from '../geo/angles';
import { destination, distanceNm, initialBearingTrueDeg, type LatLon } from '../geo/geodesy';
import { gsIndication, type GsIndication } from '../nav/gs';
import type { AircraftFix } from '../nav/common';
import { trackPosition, type TrackLine } from './geometry';
import {
  buildPlan,
  isAngularLine,
  lineHasGlidepath,
  VTF,
  type ApproachChoice,
  type GpsDatabase,
  type GpsLeg,
  type GpsLine,
  type GpsPlan,
} from './flightplan';
import type { NavData } from '../navdata/types';

// ---- World and state ----

/** What the GPS knows for a scenario: the approach database and the WAAS situation. */
export interface GpsWorld {
  db: GpsDatabase;
  /** Every plan the learner can load, keyed by `planKey`. */
  plans: Record<string, GpsPlan>;
  /** WAAS vertical/angular service available this flight (LPV, LNAV/VNAV, LP lines). */
  waasAvailable: boolean;
  /**
   * The GA (TOGA) switch also sequences the GPS into the missed approach, as on an integrated
   * (glass) installation. A panel-mount GPS (steam) can't see the switch: SUSP by hand.
   */
  goAroundSequencesMissed: boolean;
}

export const planKey = (c: ApproachChoice) =>
  c.transition === VTF
    ? VTF
    : `${c.transition}|${'hold' in c && c.hold !== undefined ? c.hold : ''}`;

export function buildGpsWorld(
  db: GpsDatabase,
  nav: NavData,
  waasAvailable: boolean,
  { goAroundSequencesMissed = false }: { goAroundSequencesMissed?: boolean } = {},
): GpsWorld {
  const plans: Record<string, GpsPlan> = {};
  const add = (c: ApproachChoice) => (plans[planKey(c)] = buildPlan(db, c, nav));
  add({ transition: VTF });
  for (const t of db.transitions) {
    add({ transition: t.id });
    if (t.offersHold) {
      add({ transition: t.id, hold: true });
      add({ transition: t.id, hold: false });
    }
  }
  return { db, plans, waasAvailable, goAroundSequencesMissed };
}

export type HoldSegment =
  'entry' | 'entry2' | 'outboundTurn' | 'outbound' | 'inboundTurn' | 'inbound';
export type HoldEntry = 'direct' | 'teardrop' | 'parallel';

export interface HoldProgress {
  entry: HoldEntry;
  seg: HoldSegment;
  /** Where the current straight segment started (entry legs). */
  segStart: LatLon;
  /** Turn radius used for the racetrack, NM. */
  radiusNm: number;
  /** Completed circuits (crossings of the fix inbound). */
  circuits: number;
  /** Angle swept so far on the current turn, degrees. */
  sweptDeg: number;
  /** Bearing from the turn centre at the previous step. */
  lastAngleDeg: number | null;
}

export interface GpsState {
  /** Loaded approach (null = nothing loaded). */
  loaded: ApproachChoice | null;
  /** Approach activated: the GPS sequences its legs. */
  active: boolean;
  leg: number;
  /** Start point of the active leg when it is flown from present position (DF, CA, Direct-To). */
  legStart: LatLon | null;
  /** Direct-To: the active leg is flown direct from `legStart` to its fix. */
  direct: boolean;
  /** Sequencing suspended at the MAP (SUSP). */
  suspended: boolean;
  /** SUSP pressed before the MAP: sequence straight into the missed approach there. */
  missedArmed: boolean;
  hold: HoldProgress | null;
  /**
   * Fly-by turn in progress: after sequencing early, the GPS guides along the arc that joins the
   * two legs (standard-rate radius), then on the new leg.
   */
  flyBy: { centre: LatLon; radiusNm: number; turn: 'L' | 'R'; toCourseTrueDeg: number } | null;
}

export const GPS_OFF: GpsState = {
  loaded: null,
  active: false,
  leg: 0,
  legStart: null,
  direct: false,
  suspended: false,
  missedArmed: false,
  hold: null,
  flyBy: null,
};

export function activePlan(gps: GpsState, world: GpsWorld | null): GpsPlan | null {
  if (!world || !gps.loaded) return null;
  return world.plans[planKey(gps.loaded)] ?? null;
}

// ---- Commands ----

export type GpsCommand =
  | { type: 'gpsLoad'; transition: string; hold?: boolean }
  | { type: 'gpsActivate' }
  | { type: 'gpsDirect'; fix: string }
  | { type: 'gpsSusp' };

export function applyGpsCommand(
  gps: GpsState,
  c: GpsCommand,
  world: GpsWorld | null,
  ac: AircraftFix,
): GpsState {
  if (!world) return gps;
  switch (c.type) {
    case 'gpsLoad': {
      // A hold choice counts only where loading offers one; elsewhere the transition loads as
      // published (as on the PROC page, which shows no choice there).
      const offers = world.db.transitions.find((t) => t.id === c.transition)?.offersHold;
      const choice: ApproachChoice =
        c.transition === VTF
          ? { transition: VTF }
          : c.hold === undefined || !offers
            ? { transition: c.transition }
            : { transition: c.transition, hold: c.hold };
      if (!world.plans[planKey(choice)]) return gps;
      return { ...GPS_OFF, loaded: choice };
    }
    case 'gpsActivate': {
      if (!gps.loaded) return gps;
      return {
        ...GPS_OFF,
        loaded: gps.loaded,
        active: true,
        leg: 0,
        legStart: ac.position,
      };
    }
    case 'gpsDirect': {
      const plan = activePlan(gps, world);
      if (!plan) return gps;
      // The first leg (from the current one on) that ends at the fix; else any.
      const ends = (l: GpsLeg) => (l.kind === 'hold' ? l.fix : l.kind === 'ca' ? null : l.to);
      let i = plan.legs.findIndex((l, k) => k >= gps.leg && ends(l) === c.fix);
      if (i < 0) i = plan.legs.findIndex((l) => ends(l) === c.fix);
      if (i < 0) return gps;
      // A hold is approached by its preceding leg to the same fix when there is one.
      const leg = plan.legs[i]!;
      if (leg.kind === 'hold' && i > 0 && ends(plan.legs[i - 1]!) === c.fix) i -= 1;
      return {
        ...gps,
        active: true,
        leg: i,
        legStart: ac.position,
        direct: true,
        suspended: false,
        hold: null,
      };
    }
    case 'gpsSusp': {
      const plan = activePlan(gps, world);
      if (!plan || !gps.active) return gps;
      if (gps.suspended) {
        // Unsuspend: sequence into the missed approach (at the MAP) from present position.
        if (gps.leg === plan.mapLeg && plan.missedLeg < plan.legs.length)
          return {
            ...gps,
            suspended: false,
            leg: plan.missedLeg,
            legStart: ac.position,
            direct: false,
            hold: null,
          };
        return { ...gps, suspended: false };
      }
      if (gps.leg <= plan.mapLeg) return { ...gps, missedArmed: !gps.missedArmed };
      return gps;
    }
  }
}

/**
 * GA (TOGA) pressed. On an integrated installation (`goAroundSequencesMissed`) it does what SUSP
 * would: before the MAP it arms the missed approach (it never disarms it), suspended at the MAP
 * it sequences into the missed approach. Otherwise, or with no approach active, nothing changes.
 */
export function gpsGoAround(gps: GpsState, world: GpsWorld | null, ac: AircraftFix): GpsState {
  if (!world?.goAroundSequencesMissed) return gps;
  const plan = activePlan(gps, world);
  if (!plan || !gps.active || gps.leg > plan.mapLeg) return gps;
  if (gps.suspended) return applyGpsCommand(gps, { type: 'gpsSusp' }, world, ac);
  return gps.missedArmed ? gps : { ...gps, missedArmed: true };
}

// ---- Geometry of the active leg ----

/** Standard-rate turn radius, NM, at a ground speed. */
export const turnRadiusNm = (gsKt: number) => gsKt / (3600 * 3 * DEG);

export interface Guidance {
  /** Desired track (true) where the aircraft is. */
  dtkTrueDeg: number;
  /** + = desired path to the right. */
  xtkNm: number;
  /** Distance still to go along the leg to its fix (Infinity for CA / holds in a turn). */
  toGoNm: number;
  /** The waypoint the GPS is flying to, with its position. */
  wpt: string | null;
  wptPos: LatLon | null;
  toFrom: 'TO' | 'FROM';
}

function lineGuidance(line: TrackLine, p: LatLon, wpt: string | null): Guidance {
  const t = trackPosition(line, p);
  return {
    dtkTrueDeg: t.courseTrueHereDeg,
    xtkNm: t.xtkNm,
    toGoNm: t.toGoNm,
    wpt,
    wptPos: line.to,
    toFrom: t.toGoNm >= 0 ? 'TO' : 'FROM',
  };
}

/** Guidance on a turn arc (centre, radius, direction). */
function arcGuidance(
  centre: LatLon,
  radiusNm: number,
  turn: 'L' | 'R',
  p: LatLon,
  wpt: string,
  wptPos: LatLon,
): Guidance {
  const s = turn === 'R' ? 1 : -1;
  const d = distanceNm(centre, p);
  const a = d === 0 ? 0 : initialBearingTrueDeg(centre, p);
  return {
    dtkTrueDeg: normalize360(a + 90 * s),
    xtkNm: s * (d - radiusNm),
    toGoNm: Infinity,
    wpt,
    wptPos,
    toFrom: 'TO',
  };
}

const LONG_LINE_NM = 60;

/** The hold's racetrack points. */
function holdGeometry(leg: Extract<GpsLeg, { kind: 'hold' }>, r: number) {
  const s = leg.turn === 'R' ? 1 : -1;
  const th = leg.inboundTrueDeg;
  const out = normalize360(th + 180);
  const side = normalize360(th + 90 * s);
  const F = leg.fixPos;
  const C1 = destination(F, side, r); // outbound turn centre
  const F2 = destination(F, side, 2 * r); // end of the outbound turn
  const O = destination(F2, out, leg.legNm); // end of the outbound leg
  const C2 = destination(O, normalize360(side + 180), r); // inbound turn centre
  const I = destination(O, normalize360(side + 180), 2 * r); // start of the inbound leg
  return { s, th, out, F, C1, F2, O, C2, I };
}

function holdGuidance(
  leg: Extract<GpsLeg, { kind: 'hold' }>,
  h: HoldProgress,
  p: LatLon,
): Guidance {
  const g = holdGeometry(leg, h.radiusNm);
  switch (h.seg) {
    case 'entry': {
      const crs = h.entry === 'teardrop' ? normalize360(g.out - 30 * g.s) : g.out; // parallel: outbound course
      return lineGuidance(
        { from: h.segStart, to: destination(h.segStart, crs, leg.legNm) },
        p,
        leg.fix,
      );
    }
    case 'entry2': {
      const crs = normalize360(g.th + 45 * g.s);
      return lineGuidance({ from: h.segStart, to: destination(h.segStart, crs, 1) }, p, leg.fix);
    }
    case 'outboundTurn':
      return arcGuidance(g.C1, h.radiusNm, leg.turn, p, leg.fix, leg.fixPos);
    case 'outbound':
      return lineGuidance({ from: g.F2, to: g.O }, p, leg.fix);
    case 'inboundTurn':
      return arcGuidance(g.C2, h.radiusNm, leg.turn, p, leg.fix, leg.fixPos);
    case 'inbound':
      return lineGuidance(
        { from: destination(g.F, normalize360(g.th + 180), LONG_LINE_NM), to: g.F },
        p,
        leg.fix,
      );
  }
}

/** Guidance for the active leg. Null when there is no active leg. */
export function guidance(gps: GpsState, plan: GpsPlan, p: LatLon): Guidance | null {
  if (!gps.active) return null;
  const leg = plan.legs[gps.leg];
  if (!leg) return null;
  const start = gps.legStart ?? p;
  if (gps.flyBy) {
    const fix = leg.kind === 'ca' ? null : leg.kind === 'hold' ? leg.fix : leg.to;
    const fixPos = leg.kind === 'ca' ? null : leg.kind === 'hold' ? leg.fixPos : leg.toPos;
    if (fix && fixPos)
      return arcGuidance(gps.flyBy.centre, gps.flyBy.radiusNm, gps.flyBy.turn, p, fix, fixPos);
  }
  switch (leg.kind) {
    case 'tf':
      return gps.direct
        ? lineGuidance({ from: start, to: leg.toPos }, p, leg.to)
        : lineGuidance({ from: leg.fromPos, to: leg.toPos }, p, leg.to);
    case 'df':
      return lineGuidance({ from: start, to: leg.toPos }, p, leg.to);
    case 'ca':
      return {
        ...lineGuidance(
          { from: start, to: destination(start, leg.courseTrueDeg, LONG_LINE_NM) },
          p,
          null,
        ),
        toGoNm: Infinity,
        wptPos: null,
      };
    case 'hold':
      if (!gps.hold) return lineGuidance({ from: start, to: leg.fixPos }, p, leg.fix);
      return holdGuidance(leg, gps.hold, p);
  }
}

// ---- Sequencing ----

/** Course of a leg at its start (true), for turn anticipation; null if not known. */
function legStartCourse(leg: GpsLeg, from: LatLon): number | null {
  switch (leg.kind) {
    case 'tf':
      return initialBearingTrueDeg(leg.fromPos, leg.toPos);
    case 'df':
      return distanceNm(from, leg.toPos) > 0.01 ? initialBearingTrueDeg(from, leg.toPos) : null;
    case 'ca':
      return leg.courseTrueDeg;
    case 'hold':
      return null;
  }
}

/** Fly-by lead distance: R·tan(Δ/2), for course changes up to 120°. */
function anticipationNm(dtk: number, next: number | null, gsKt: number): number {
  if (next === null) return 0;
  const delta = Math.abs(signedAngleDiff(next, dtk));
  if (delta < 1 || delta > 120) return 0;
  return turnRadiusNm(gsKt) * Math.tan((delta / 2) * DEG);
}

function entryFor(arrivalTrueDeg: number, inboundTrueDeg: number, turn: 'L' | 'R'): HoldEntry {
  const d0 = signedAngleDiff(arrivalTrueDeg, inboundTrueDeg);
  const d = turn === 'R' ? d0 : -d0;
  return d >= -70 && d <= 110 ? 'direct' : d > 110 ? 'teardrop' : 'parallel';
}

function startHold(
  leg: Extract<GpsLeg, { kind: 'hold' }>,
  p: LatLon,
  trackTrueDeg: number,
  gsKt: number,
): HoldProgress {
  const entry = entryFor(trackTrueDeg, leg.inboundTrueDeg, leg.turn);
  return {
    entry,
    seg: entry === 'direct' ? 'outboundTurn' : 'entry',
    segStart: p,
    radiusNm: Math.max(0.3, turnRadiusNm(gsKt)),
    circuits: 0,
    sweptDeg: 0,
    lastAngleDeg: null,
  };
}

/** Advance a hold's progress; returns null when a hold-in-lieu is complete. */
function stepHold(
  leg: Extract<GpsLeg, { kind: 'hold' }>,
  h: HoldProgress,
  p: LatLon,
): HoldProgress | null {
  const g = holdGeometry(leg, h.radiusNm);
  const turnSeg = (centre: LatLon, next: HoldSegment): HoldProgress => {
    const a = initialBearingTrueDeg(centre, p);
    const swept =
      h.lastAngleDeg === null ? 0 : h.sweptDeg + g.s * signedAngleDiff(a, h.lastAngleDeg);
    if (swept >= 175) return { ...h, seg: next, sweptDeg: 0, lastAngleDeg: null, segStart: p };
    return { ...h, sweptDeg: Math.max(0, swept), lastAngleDeg: a };
  };
  const gd = holdGuidance(leg, h, p);
  switch (h.seg) {
    case 'entry':
      if (gd.toGoNm <= 0)
        return h.entry === 'teardrop'
          ? { ...h, seg: 'inbound', segStart: p }
          : { ...h, seg: 'entry2', segStart: p };
      return h;
    case 'entry2':
      return gd.toGoNm <= 0 ? { ...h, seg: 'inbound', segStart: p } : h;
    case 'outboundTurn':
      return turnSeg(g.C1, 'outbound');
    case 'outbound':
      return gd.toGoNm <= 0 ? { ...h, seg: 'inboundTurn', segStart: p } : h;
    case 'inboundTurn':
      return turnSeg(g.C2, 'inbound');
    case 'inbound':
      if (gd.toGoNm <= 0) {
        const circuits = h.circuits + 1;
        if (leg.inLieu) return null;
        return {
          ...h,
          circuits,
          seg: 'outboundTurn',
          sweptDeg: 0,
          lastAngleDeg: null,
          segStart: p,
        };
      }
      return h;
  }
}

/**
 * Advance sequencing after the aircraft moved. `trackTrueDeg` and `gsKt` are the aircraft's
 * ground track and speed (no wind: heading and TAS).
 */
export function stepGps(
  gps: GpsState,
  world: GpsWorld | null,
  ac: AircraftFix,
  trackTrueDeg: number,
  gsKt: number,
): GpsState {
  const plan = activePlan(gps, world);
  if (!plan || !gps.active) return gps;
  const p = ac.position;
  const leg = plan.legs[gps.leg];
  if (!leg) return gps;

  const advance = (to: number): GpsState => {
    const nextLeg = plan.legs[to];
    if (!nextLeg) return gps;
    const base: GpsState = {
      ...gps,
      leg: to,
      legStart: p,
      direct: false,
      hold: null,
      flyBy: null,
    };
    if (nextLeg.kind === 'hold')
      return { ...base, hold: startHold(nextLeg, p, trackTrueDeg, gsKt) };
    return base;
  };

  if (gps.flyBy) {
    // The turn is done once the track is within a few degrees of the new leg's course.
    if (Math.abs(signedAngleDiff(trackTrueDeg, gps.flyBy.toCourseTrueDeg)) < 2)
      return { ...gps, flyBy: null, legStart: p };
    return gps;
  }

  if (leg.kind === 'hold') {
    if (!gps.hold) {
      // Proceeding to the holding fix (Direct-To): enter on arrival.
      const g = guidance(gps, plan, p)!;
      if (g.toGoNm <= 0)
        return { ...gps, direct: false, hold: startHold(leg, p, trackTrueDeg, gsKt) };
      return gps;
    }
    const h = stepHold(leg, gps.hold, p);
    if (h === null) return advance(gps.leg + 1);
    return { ...gps, hold: h };
  }

  if (leg.kind === 'ca') {
    if (ac.altitudeFt >= leg.altFt - 50) return advance(gps.leg + 1);
    return gps;
  }

  const g = guidance(gps, plan, p);
  if (!g) return gps;
  if (gps.leg === plan.mapLeg) {
    if (g.toGoNm <= 0 && !gps.suspended) {
      if (gps.missedArmed && plan.missedLeg < plan.legs.length)
        return { ...advance(plan.missedLeg), missedArmed: false };
      return { ...gps, suspended: true };
    }
    return gps;
  }
  const next = plan.legs[gps.leg + 1];
  const flyBy = !leg.flyOver && next && next.kind !== 'hold' && next.kind !== 'ca';
  const nextCourse = flyBy ? legStartCourse(next, leg.toPos) : null;
  const lead = flyBy ? anticipationNm(g.dtkTrueDeg, nextCourse, gsKt) : 0;
  if (g.toGoNm <= lead) {
    const out = advance(gps.leg + 1);
    if (lead > 0 && nextCourse !== null) {
      const s = signedAngleDiff(nextCourse, g.dtkTrueDeg) >= 0 ? 1 : -1;
      const r = turnRadiusNm(gsKt);
      // The arc starts here, tangent to the current leg.
      const abeam = destination(p, normalize360(g.dtkTrueDeg + 90), g.xtkNm);
      return {
        ...out,
        flyBy: {
          centre: destination(abeam, normalize360(g.dtkTrueDeg + 90 * s), r),
          radiusNm: r,
          turn: s > 0 ? 'R' : 'L',
          toCourseTrueDeg: nextCourse,
        },
      };
    }
    return out;
  }
  return gps;
}

// ---- Reading ----

export type GpsPhase = 'ENR' | 'TERM' | 'APR' | 'MAPR';

export interface GpsReading {
  kind: 'GPS';
  /** No guidance (nothing active). */
  flag: boolean;
  /** + = desired path to the right. */
  xtkNm: number;
  /** Full-scale deflection, NM. */
  fullScaleNm: number;
  /** Needle, −1…+1 of full scale (+ = right). */
  deviation: number;
  dtkTrueDeg: number;
  dtkMagDeg: number;
  toFrom: 'TO' | 'FROM' | 'OFF';
  activeWaypoint: string | null;
  distanceNm: number | null;
  bearingMagDeg: number | null;
  /** Bearing to the active waypoint, true (for the BRG pointer). */
  bearingTrueDeg: number | null;
  groundSpeedKt: number;
  phase: GpsPhase;
  /** Approach annunciation once in approach mode: LPV, LNAV/VNAV, LP, LP+V, LNAV, LNAV+V. */
  annunciation: string | null;
  /** The minimums line the GPS is flying (from 2 NM before the FAF). */
  line: GpsLine | null;
  suspended: boolean;
  missedArmed: boolean;
  /** Vertical deviation for LPV / LNAV/VNAV (coupled) and +V (advisory). */
  gp: GsIndication | null;
  gpAdvisory: boolean;
  /** The active approach will have a coupled glidepath (LPV or LNAV/VNAV): APR arms GP. */
  vnavAvailable: boolean;
  /** Active leg index, for the flight-plan display. */
  leg: number;
}

const ENR_SCALE = 2;
const TERM_SCALE = 1;
const LNAV_SCALE = 0.3;
const TERMINAL_AREA_NM = 30;
const RAMP_NM = 2;

/** The best line the plate publishes that the GPS can fly in this scenario. */
export function availableLine(world: GpsWorld): GpsLine | null {
  const lines = world.db.lines.filter((l) => world.waasAvailable || l === 'LNAV');
  return lines[0] ?? null;
}

function angularScaleNm(world: GpsWorld, p: LatLon): number {
  const fas = world.db.fas;
  if (!fas) return LNAV_SCALE;
  // Distance from the GARP along the final, roughly: LTP distance + LTP→GARP.
  const d = distanceNm(fas.ltp, p) + fas.garpBeyondLtpNm;
  return Math.min(TERM_SCALE, (fas.courseWidthNm * d) / fas.garpBeyondLtpNm);
}

export function gpsReading(
  gps: GpsState,
  world: GpsWorld | null,
  ac: AircraftFix,
  gsKt: number,
  magVarEastDeg: number,
): GpsReading {
  const p = ac.position;
  const plan = activePlan(gps, world);
  const g = plan ? guidance(gps, plan, p) : null;
  const destNm = world ? distanceNm(world.db.airportPos, p) : Infinity;
  const base = destNm <= TERMINAL_AREA_NM ? TERM_SCALE : ENR_SCALE;
  let phase: GpsPhase = destNm <= TERMINAL_AREA_NM ? 'TERM' : 'ENR';
  let fullScaleNm = base;
  let line: GpsLine | null = null;
  if (plan && world && gps.active) {
    const best = availableLine(world);
    const target = (pos: LatLon) =>
      best && isAngularLine(best) ? angularScaleNm(world, pos) : LNAV_SCALE;
    if (gps.leg >= plan.missedLeg) {
      phase = 'MAPR';
      fullScaleNm = TERM_SCALE;
    } else if (gps.leg > plan.fafLeg && plan.fafLeg >= 0) {
      phase = 'APR';
      line = best;
      fullScaleNm = target(p);
    } else if (gps.leg === plan.fafLeg && g && g.toGoNm <= RAMP_NM) {
      phase = 'APR';
      line = best;
      const f = clamp(g.toGoNm / RAMP_NM, 0, 1);
      const atFaf = target(g.wptPos ?? p);
      fullScaleNm = atFaf + (base - atFaf) * f;
    }
  }
  const adv = !!world?.db.advisoryVertical && world.waasAvailable;
  const best = world ? availableLine(world) : null;
  const vnavAvailable =
    !!plan && gps.active && gps.leg < plan.missedLeg && !!best && lineHasGlidepath(best);
  const annunciation =
    line === null ? null : (line === 'LNAV' || line === 'LP') && adv ? `${line}+V` : line;
  // The coupled glidepath is available as soon as the approach is active (APR arms GP; it
  // captures near the FAF); the advisory +V only once the GPS annunciates it.
  const vertical =
    world?.db.glidePath && (vnavAvailable || annunciation?.endsWith('+V'))
      ? gsIndication(ac, world.db.glidePath)
      : null;
  if (!g) {
    return {
      kind: 'GPS',
      flag: true,
      xtkNm: 0,
      fullScaleNm,
      deviation: 0,
      dtkTrueDeg: 0,
      dtkMagDeg: 0,
      toFrom: 'OFF',
      activeWaypoint: null,
      distanceNm: null,
      bearingMagDeg: null,
      bearingTrueDeg: null,
      groundSpeedKt: gsKt,
      phase,
      annunciation: null,
      line: null,
      suspended: false,
      missedArmed: false,
      gp: null,
      gpAdvisory: false,
      vnavAvailable: false,
      leg: gps.leg,
    };
  }
  const brgTrue = g.wptPos ? initialBearingTrueDeg(p, g.wptPos) : null;
  return {
    kind: 'GPS',
    flag: false,
    xtkNm: g.xtkNm,
    fullScaleNm,
    deviation: clamp(g.xtkNm / fullScaleNm, -1, 1),
    dtkTrueDeg: normalize360(g.dtkTrueDeg),
    dtkMagDeg: normalize360(trueToMag(g.dtkTrueDeg, magVarEastDeg)),
    toFrom: g.toFrom,
    activeWaypoint: g.wpt,
    distanceNm: g.wptPos ? distanceNm(p, g.wptPos) : null,
    bearingMagDeg: brgTrue === null ? null : normalize360(trueToMag(brgTrue, magVarEastDeg)),
    bearingTrueDeg: brgTrue,
    groundSpeedKt: gsKt,
    phase,
    annunciation,
    line,
    suspended: gps.suspended,
    missedArmed: gps.missedArmed,
    gp: vertical,
    gpAdvisory: !!annunciation?.endsWith('+V'),
    vnavAvailable,
    leg: gps.leg,
  };
}
