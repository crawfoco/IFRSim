/**
 * GPS flight plan for a loaded RNAV approach: the procedure's legs for one transition (or
 * vectors-to-final), turned into GPS legs with positions. Pure; built once per scenario for
 * every transition the learner could load (see `GpsDatabase`).
 */
import { navdataForProcedure } from '../navdata/rnav';
import { courseTrueDeg, resolveFixes, runwayEndFor } from '../../procedures/resolve';
import { isDaLine, type Leg, type MinimumsKind, type Procedure } from '../../procedures/schema';
import { DEG, normalize360 } from '../geo/angles';
import { destination, distanceNm, type LatLon } from '../geo/geodesy';
import { FT_PER_NM } from '../nav/common';
import type { GlidePath } from '../nav/gs';
import type { NavData } from '../navdata/types';

/** What the learner loads: a transition id, or vectors-to-final. */
export type ApproachChoice = { transition: string; hold?: boolean } | { transition: 'VTF' };

export const VTF = 'VTF';

export type GpsLeg =
  /** Direct to a fix from wherever the aircraft is when the leg becomes active. */
  | { kind: 'df'; to: string; toPos: LatLon; flyOver: boolean; altFt?: number }
  /** Great-circle track between two fixes. */
  | {
      kind: 'tf';
      from: string;
      fromPos: LatLon;
      to: string;
      toPos: LatLon;
      flyOver: boolean;
      altFt?: number;
    }
  /** Course (true) from the point the leg starts until reaching an altitude. */
  | { kind: 'ca'; courseTrueDeg: number; altFt: number }
  /** Racetrack hold at a fix; `inLieu` = hold-in-lieu (ends at the fix after one circuit). */
  | {
      kind: 'hold';
      fix: string;
      fixPos: LatLon;
      inboundTrueDeg: number;
      turn: 'L' | 'R';
      legNm: number;
      inLieu: boolean;
      minAltFt?: number;
      maxAltFt?: number;
    };

export interface GpsPlan {
  choice: ApproachChoice;
  legs: GpsLeg[];
  /** Index of the leg that ends at the FAF, and the one that ends at the MAP. */
  fafLeg: number;
  mapLeg: number;
  /** First missed-approach leg (after the MAP). */
  missedLeg: number;
}

/** The approach data the GPS holds for this scenario. */
export interface GpsDatabase {
  procedureId: string;
  name: string;
  airport: string;
  airportPos: LatLon;
  /** Transitions the learner can load, in chart order (plus VTF). */
  /**
   * `offersHold`: loading asks "Hold at <holdFix>?" (a hold-in-lieu on the transition, or the
   * TAA IAF's); the learner decides whether the course reversal is flown.
   */
  transitions: {
    id: string;
    name: string;
    fix: string;
    offersHold: boolean;
    holdFix: string | null;
  }[];
  /** Fix positions by name. */
  fixes: Record<string, LatLon>;
  /** Minimums lines the plate publishes, best first. */
  lines: GpsLine[];
  /** Vertical path for LPV and LNAV/VNAV (and +V advisory), or null. */
  glidePath: GlidePath | null;
  /** Lateral full scale at the LTP for angular lines, NM, and the distance LTP → GARP. */
  fas: { courseWidthNm: number; garpBeyondLtpNm: number; ltp: LatLon } | null;
  /** Final course (true), FAF → MAP. */
  finalCourseTrueDeg: number;
  /** Whether the GPS can show an advisory glidepath (+V) on the LNAV/LP lines. */
  advisoryVertical: boolean;
  /** Variation for magnetic courses on the display (the airport's). */
  magVarEastDeg: number;
  procedure: Procedure;
}

export type GpsLine = 'LPV' | 'LNAV/VNAV' | 'LP' | 'LNAV';
const LINE_ORDER: GpsLine[] = ['LPV', 'LNAV/VNAV', 'LP', 'LNAV'];
export const lineHasGlidepath = (l: GpsLine) => l === 'LPV' || l === 'LNAV/VNAV';
export const isAngularLine = (l: GpsLine) => l !== 'LNAV';
export const lineIsDa = (l: GpsLine) => isDaLine(l as MinimumsKind);

/** Build the GPS database for an RNAV procedure; null for a non-RNAV one. */
export function gpsDatabase(
  p: Procedure,
  allNav: NavData,
  magVarEastDeg: number,
): GpsDatabase | null {
  if (!p.rnav) return null;
  const nav = navdataForProcedure(allNav, p);
  const fixes = resolveFixes(p, nav);
  const final = p.approach.find((l) => l.type === 'final');
  if (!final || final.type !== 'final') throw new Error(`${p.id} has no final`);
  const airport = nav.airports[p.airport];
  if (!airport) throw new Error(`unknown airport ${p.airport}`);
  const rwy = runwayEndFor(nav, p.airport, p.runway);
  const finalTrue = courseTrueDeg(final.course, nav);
  const vert = final.gp ?? final.descentAngle;
  let glidePath: GlidePath | null = null;
  if (vert) {
    const landing = rwy.displacedThreshold ?? {
      position: rwy.threshold,
      elevationFt: rwy.elevationFt,
    };
    const ltp = nav.cifp?.approaches[p.rnav.cifp]?.pathPoint?.ltp ?? landing.position;
    const gpiNm = vert.tchFt / Math.tan(vert.angleDeg * DEG) / FT_PER_NM;
    glidePath = {
      gpi: destination(ltp, finalTrue, gpiNm),
      elevationFt: landing.elevationFt,
      angleDeg: vert.angleDeg,
      courseTrueDeg: finalTrue,
    };
  }
  const pp = nav.cifp?.approaches[p.rnav.cifp]?.pathPoint;
  const fas = pp
    ? {
        courseWidthNm: pp.courseWidthM / 1852,
        // GARP: 305 m beyond the FPAP.
        garpBeyondLtpNm: distanceNm(pp.ltp, pp.fpap) + 305 / 1852,
        ltp: pp.ltp,
      }
    : null;
  const lines = LINE_ORDER.filter((l) => p.minimums.some((m) => m.kind === l));
  return {
    procedureId: p.id,
    name: `${p.airport} ${p.name}`,
    airport: p.airport,
    airportPos: airport.position,
    transitions: p.transitions.map((t) => {
      const first = t.legs[0]!;
      const fix =
        first.type === 'track' && 'rnavFrom' in first.course
          ? first.course.rnavFrom
          : first.type === 'hold'
            ? first.fix
            : (legTo(first) ?? t.id);
      const inLieu = t.legs.find((l) => l.type === 'hold');
      const holdFix =
        inLieu?.type === 'hold' ? inLieu.fix : p.taa && p.taa.iaf === fix ? p.taa.iaf : null;
      return { id: t.id, name: t.name, fix, offersHold: holdFix !== null, holdFix };
    }),
    fixes,
    lines,
    glidePath,
    fas,
    finalCourseTrueDeg: finalTrue,
    advisoryVertical: !!vert && !!p.rnav.waas,
    magVarEastDeg,
    procedure: p,
  };
}

function legTo(l: Leg): string | null {
  switch (l.type) {
    case 'track':
    case 'direct':
    case 'arc':
      return l.to;
    case 'hold':
    case 'procedureTurn':
      return l.fix;
    case 'final':
      return l.map.fix;
    default:
      return null;
  }
}

/** Distance of the VTF line's start before the FAF. */
const VTF_EXTENSION_NM = 30;

/** Build the flight plan for a loaded approach. */
export function buildPlan(db: GpsDatabase, choice: ApproachChoice, allNav: NavData): GpsPlan {
  const p = db.procedure;
  const nav = navdataForProcedure(allNav, p);
  const pos = (name: string) => {
    const f = db.fixes[name];
    if (!f) throw new Error(`${p.id}: unknown fix ${name}`);
    return f;
  };
  const legs: GpsLeg[] = [];
  let prevFix: string | null = null;

  const addProcLeg = (l: Leg, inLieu: boolean) => {
    switch (l.type) {
      case 'track': {
        const from = 'rnavFrom' in l.course ? l.course.rnavFrom : prevFix;
        if (from === null) throw new Error(`${p.id}: track to ${l.to} has no start`);
        legs.push({
          kind: 'tf',
          from,
          fromPos: pos(from),
          to: l.to,
          toPos: pos(l.to),
          flyOver: !!l.flyOver,
          ...(l.minAltFt !== undefined ? { altFt: l.minAltFt } : {}),
        });
        prevFix = l.to;
        break;
      }
      case 'direct':
        legs.push({
          kind: 'df',
          to: l.to,
          toPos: pos(l.to),
          flyOver: !!l.flyOver,
          ...(l.climbToFt !== undefined ? { altFt: l.climbToFt } : {}),
        });
        prevFix = l.to;
        break;
      case 'hold':
        legs.push({
          kind: 'hold',
          fix: l.fix,
          fixPos: pos(l.fix),
          inboundTrueDeg: courseTrueDeg(l.course, nav),
          turn: l.turn,
          legNm: l.legNm ?? ((l.legMinutes ?? 1) * 100) / 60,
          inLieu,
          ...(l.minAltFt !== undefined ? { minAltFt: l.minAltFt } : {}),
          ...(l.maxAltFt !== undefined ? { maxAltFt: l.maxAltFt } : {}),
        });
        prevFix = l.fix;
        break;
      case 'final': {
        if (prevFix !== l.faf) throw new Error(`${p.id}: the final must start at the FAF`);
        let from: string = l.faf;
        // Step-downs are fixes on the final track.
        for (const s of l.stepDowns) {
          legs.push({
            kind: 'tf',
            from,
            fromPos: pos(from),
            to: s.fix,
            toPos: pos(s.fix),
            flyOver: false,
            altFt: s.minAltFt,
          });
          from = s.fix;
        }
        legs.push({
          kind: 'tf',
          from,
          fromPos: pos(from),
          to: l.map.fix,
          toPos: pos(l.map.fix),
          flyOver: true,
        });
        prevFix = l.map.fix;
        break;
      }
      case 'climb':
        legs.push({ kind: 'ca', courseTrueDeg: db.finalCourseTrueDeg, altFt: l.toAltFt });
        break;
      default:
        throw new Error(`${p.id}: leg type ${l.type} is not supported on the GPS`);
    }
  };

  const final = p.approach.find((l) => l.type === 'final');
  if (!final || final.type !== 'final') throw new Error(`${p.id} has no final`);

  if (choice.transition === VTF) {
    // Vectors-to-final: an extended final course ending at the FAF.
    const fafPos = pos(final.faf);
    const start = destination(fafPos, normalize360(db.finalCourseTrueDeg + 180), VTF_EXTENSION_NM);
    legs.push({
      kind: 'tf',
      from: 'VTF',
      fromPos: start,
      to: final.faf,
      toPos: fafPos,
      flyOver: false,
      altFt: final.fafAltFt,
    });
    prevFix = final.faf;
    addProcLeg(final, false);
  } else {
    const t = p.transitions.find((x) => x.id === choice.transition);
    if (!t) throw new Error(`${p.id} has no transition ${choice.transition}`);
    const first = t.legs[0]!;
    const iaf =
      first.type === 'track' && 'rnavFrom' in first.course ? first.course.rnavFrom : legTo(first);
    if (!iaf) throw new Error(`${p.id}: transition ${t.id} has no initial fix`);
    // Activating the approach goes direct to the initial fix.
    legs.push({ kind: 'df', to: iaf, toPos: pos(iaf), flyOver: false });
    prevFix = iaf;
    const wantHold = 'hold' in choice ? choice.hold : undefined;
    for (const l of t.legs) {
      if (l.type === 'hold' && wantHold === false) continue;
      addProcLeg(l, true);
    }
    // TAA: "Hold at <IAF>?" adds the approach's own hold-in-lieu, if the transition has none.
    if (wantHold && !t.legs.some((l) => l.type === 'hold')) {
      const h = p.transitions
        .flatMap((x) => x.legs)
        .find((l) => l.type === 'hold' && l.fix === iaf);
      if (h) addProcLeg(h, true);
    }
    for (const l of p.approach) addProcLeg(l, false);
  }
  const mapLeg = legs.length - 1;
  const fafLeg = legs.findIndex((l) => (l.kind === 'tf' || l.kind === 'df') && l.to === final.faf);
  for (const l of p.missed) addProcLeg(l, false);
  return { choice, legs, fafLeg, mapLeg, missedLeg: mapLeg + 1 };
}

/** The fix a GPS leg ends at, if any. */
export function legFix(l: GpsLeg): string | null {
  return l.kind === 'ca' ? null : l.kind === 'hold' ? l.fix : l.to;
}
