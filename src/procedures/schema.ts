/**
 * Procedure encoding: one JSON file per approach, validated by this zod schema.
 * See docs/procedure-encoding.md for the guide. Fixes are defined the way the chart
 * defines them (navaid + radial + DME, localizer + DME); lat/lon is derived from navdata.
 *
 * Conventions: courses and radials are magnetic (the navaid's own variation),
 * altitudes are feet MSL, distances are NM.
 */
import { z } from 'zod';

const Deg = z.number().min(0).max(360);
const Ft = z.number().int().min(0).max(18_000);
const Nm = z.number().positive().max(60);
const Id = z.string().min(1);

// ---- Fixes and positions ----

/** The station itself (VOR, or a localizer antenna). */
const AtNavaid = z.object({ kind: z.literal('navaid'), navaid: Id }).strict();
/** On a VOR radial (or bearing from a localizer antenna) at a DME distance. */
const RadialDme = z
  .object({ kind: z.literal('radialDme'), navaid: Id, radialMag: Deg, dmeNm: Nm })
  .strict();
/**
 * On the localizer front course at a DME distance. `dmeFrom` names the DME used when it
 * is not the ILS's own (KMTJ: DME from the MTJ VOR).
 */
const LocDme = z
  .object({
    kind: z.literal('locDme'),
    loc: Id,
    dmeNm: z.number().min(0).max(60),
    dmeFrom: Id.optional(),
  })
  .strict();
/** The landing threshold of the procedure's runway. */
const Threshold = z.object({ kind: z.literal('threshold') }).strict();
/** An RNAV waypoint (or VOR, or runway "RW18") at its FAA CIFP coordinates. */
const Waypoint = z.object({ kind: z.literal('waypoint'), id: Id }).strict();

export const FixDefSchema = z.discriminatedUnion('kind', [
  AtNavaid,
  RadialDme,
  LocDme,
  Threshold,
  Waypoint,
]);
export type FixDef = z.infer<typeof FixDefSchema>;

export const FixSchema = z
  .object({
    def: FixDefSchema,
    /** FAA fix identifier when the fix is a named waypoint; checked against NASR (≤ 0.1 NM). */
    faaId: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();

// ---- Navigation references ----

/** A course flown on a VOR radial, TO or FROM the station. */
const VorCourse = z.object({ navaid: Id, courseMag: Deg, toFrom: z.enum(['TO', 'FROM']) }).strict();
/** The localizer front course. */
const LocCourse = z.object({ loc: Id }).strict();
/** RNAV track (ARINC TF leg): the great circle from one waypoint to the next. */
const RnavTrack = z.object({ rnavFrom: Id, rnavTo: Id }).strict();
/**
 * RNAV course through a waypoint (holds, course-to-fix): magnetic course at the fix, using
 * the waypoint's CIFP magnetic variation.
 */
const RnavCourse = z.object({ rnavFix: Id, courseMag: Deg }).strict();
export const CourseRefSchema = z.union([VorCourse, LocCourse, RnavTrack, RnavCourse]);
export type CourseRef = z.infer<typeof CourseRefSchema>;
export type RnavCourseRef = z.infer<typeof RnavTrack> | z.infer<typeof RnavCourse>;
export const isRnavRef = (r: CourseRef): r is RnavCourseRef => 'rnavFrom' in r || 'rnavFix' in r;

/**
 * DME the learner should read on a leg, when the chart names one (KMTJ: MTJ VOR/DME, not
 * the localizer). Optional; `expectedDmeSource()` infers it from the leg's fixes otherwise.
 */
const DmeSource = { dme: Id.optional() };

const Altitude = {
  /** At or above. */
  minAltFt: Ft.optional(),
  /** At or below. */
  maxAltFt: Ft.optional(),
};

// ---- Legs ----

/** Track a course to a fix (feeder, initial, intermediate, missed). */
const TrackLeg = z
  .object({
    type: z.literal('track'),
    to: Id,
    course: CourseRefSchema,
    /** RNAV: sequence the waypoint only once over it (no turn anticipation). */
    flyOver: z.boolean().optional(),
    ...DmeSource,
    ...Altitude,
  })
  .strict();

/** Fly a DME arc to a fix. The autopilot has no arc mode: flown in HDG. */
const ArcLeg = z
  .object({
    type: z.literal('arc'),
    to: Id,
    navaid: Id,
    radiusNm: Nm,
    fromRadialMag: Deg,
    toRadialMag: Deg,
    turn: z.enum(['L', 'R']),
    /** Lead radial where the turn onto the next course starts, if charted. */
    leadRadialMag: Deg.optional(),
    ...Altitude,
  })
  .strict();

/** Fly a heading until intercepting a course (chart "hdg 337° to DMYIH"). */
const HeadingLeg = z
  .object({
    type: z.literal('heading'),
    headingMag: Deg,
    /** Turn direction when it is specified ("climbing left turn"). */
    turn: z.enum(['L', 'R']).optional(),
    intercept: CourseRefSchema.optional(),
    /** Climb (missed approach) to this altitude while on the heading. */
    climbToFt: Ft.optional(),
    ...Altitude,
  })
  .strict();

/** Missed approach: climb straight ahead to an altitude before the first turn. */
const ClimbLeg = z.object({ type: z.literal('climb'), toAltFt: Ft }).strict();

/** Direct to a fix (e.g. "direct AKO"). */
const DirectLeg = z
  .object({
    type: z.literal('direct'),
    to: Id,
    flyOver: z.boolean().optional(),
    /** Turn direction when charted ("climbing right turn … direct AKO"). */
    turn: z.enum(['L', 'R']).optional(),
    /** Climb (missed approach) to this altitude while proceeding direct. */
    climbToFt: Ft.optional(),
    ...Altitude,
  })
  .strict();

/** A hold: course reversal (hold-in-lieu of PT) or the missed-approach hold. */
const HoldLeg = z
  .object({
    type: z.literal('hold'),
    fix: Id,
    inboundCourseMag: Deg,
    course: CourseRefSchema,
    turn: z.enum(['L', 'R']),
    legMinutes: z.number().positive().max(3).optional(),
    legNm: Nm.optional(),
    /** Chart "climb in hold" note: climb to minAltFt in the hold before leaving. */
    climbInHold: z.boolean().optional(),
    ...Altitude,
  })
  .strict()
  .refine((h) => (h.legMinutes === undefined) !== (h.legNm === undefined), {
    message: 'a hold needs exactly one of legMinutes or legNm',
  });

/** Barbed procedure turn: outbound, 45° turn, timed leg, 180° turn back to intercept. */
const ProcedureTurnLeg = z
  .object({
    type: z.literal('procedureTurn'),
    fix: Id,
    course: CourseRefSchema,
    outboundCourseMag: Deg,
    /** The barb: heading of the 45° leg, as charted (e.g. 254°). */
    barbHeadingMag: Deg,
    inboundCourseMag: Deg,
    /** Side of the outbound course the turn is made on. */
    side: z.enum(['L', 'R']),
    /** "Remain within 10 NM". */
    maxDistanceNm: Nm,
    /** Procedure-turn altitude (outbound, barb and turn). */
    minAltFt: Ft,
    /** Lower altitude charted on the inbound leg once established (KMTJ: 12500 → 9400). */
    inboundMinAltFt: Ft.optional(),
    ...DmeSource,
  })
  .strict();

const StepDown = z
  .object({
    fix: Id,
    minAltFt: Ft,
    /** Applies only to the LOC/VOR (non-precision) final. */
    locOnly: z.boolean().optional(),
    /** RNAV: applies only to the LNAV (and LP) lines, not to lines with a glidepath. */
    lnavOnly: z.boolean().optional(),
  })
  .strict();

/** Missed approach point: a fix (DME / threshold) and, where charted, a timing table. */
const Map = z
  .object({
    fix: Id,
    timing: z
      .array(
        z.object({ groundspeedKt: z.number().positive(), seconds: z.number().positive() }).strict(),
      )
      .optional(),
  })
  .strict();

/** Final approach from the FAF. */
const FinalLeg = z
  .object({
    type: z.literal('final'),
    faf: Id,
    course: CourseRefSchema,
    /** Altitude at (non-precision) or glideslope intercept altitude (precision) at the FAF. */
    fafAltFt: Ft,
    glideslope: z
      .object({ angleDeg: z.number().min(2).max(4), tchFt: z.number().positive() })
      .strict()
      .optional(),
    /**
     * Charted descent angle and TCH for a non-precision final (advisory: there is no
     * glideslope). Not used when `glideslope` is present.
     */
    descentAngle: z
      .object({ angleDeg: z.number().min(2).max(4.5), tchFt: z.number().positive() })
      .strict()
      .optional(),
    /**
     * RNAV glidepath (FAS data) flown on the LPV and LNAV/VNAV lines: angle and TCH as
     * charted (checked against the CIFP path point).
     */
    gp: z
      .object({ angleDeg: z.number().min(2).max(4), tchFt: z.number().positive() })
      .strict()
      .optional(),
    stepDowns: z.array(StepDown).default([]),
    vdp: Id.optional(),
    map: Map,
    ...DmeSource,
  })
  .strict();

export const LegSchema = z.discriminatedUnion('type', [
  TrackLeg,
  ArcLeg,
  HeadingLeg,
  ClimbLeg,
  DirectLeg,
  HoldLeg,
  ProcedureTurnLeg,
  FinalLeg,
]);
export type Leg = z.infer<typeof LegSchema>;

// ---- Minimums ----

const CatMin = z.object({ altFt: Ft, visibilitySm: z.number().positive() }).strict();
export const MinimumsSchema = z
  .object({
    /** ILS, LPV, LNAV/VNAV → DA; LOC, VOR, LP, LNAV → MDA. */
    kind: z.enum(['ILS', 'LOC', 'VOR', 'LPV', 'LNAV/VNAV', 'LP', 'LNAV', 'CIRCLING']),
    label: z.string(),
    /** Shown in the briefing with the line (e.g. a remote-altimeter or climb-gradient note). */
    note: z.string().optional(),
    A: CatMin,
    B: CatMin,
  })
  .strict();
export type Minimums = z.infer<typeof MinimumsSchema>;
export type MinimumsKind = Minimums['kind'];
/** Minimums lines flown to a decision altitude (the others are an MDA). */
export const isDaLine = (k: MinimumsKind) => k === 'ILS' || k === 'LPV' || k === 'LNAV/VNAV';

// ---- RNAV and TAA ----

export const RnavSchema = z
  .object({
    /** "KLAA R18": the CIFP approach the encoding is cross-checked against. */
    cifp: z.string(),
    /** WAAS channel and approach id from the plate, or null for a GPS-only approach. */
    waas: z.object({ channel: z.string(), id: z.string() }).strict().nullable(),
    /** Chart equipment note, e.g. "RNP APCH - GPS". */
    equipment: z.string(),
  })
  .strict();

const TaaRing = z.object({ withinNm: Nm, minAltFt: Ft }).strict();
/**
 * A TAA area: the courses TO the IAF that bound it (clockwise from `fromCourseMag` to
 * `toCourseMag`), whether it is NoPT (straight-in) or needs the course reversal, and its rings
 * from the inside out.
 */
const TaaArea = z
  .object({
    name: z.string(),
    fromCourseMag: Deg,
    toCourseMag: Deg,
    noPT: z.boolean(),
    rings: z.array(TaaRing).min(1),
  })
  .strict();
export const TaaSchema = z.object({ iaf: Id, areas: z.array(TaaArea).min(1) }).strict();
export type Taa = z.infer<typeof TaaSchema>;

// ---- Start conditions ----

export const StartSchema = z
  .object({
    id: Id,
    name: z.string(),
    /** ATC clearance as the controller would say it. */
    clearance: z.string(),
    /** Where the aircraft starts (chart-style position). */
    position: FixDefSchema,
    /**
     * Start this far before `position`, flying `headingMag` toward it (so the aircraft
     * arrives over the fix on that heading, with time to set up first).
     */
    leadInNm: z.number().positive().max(30).optional(),
    /**
     * Start off to one side instead (as after ATC vectors): `distanceNm` from `position` on
     * the magnetic bearing `bearingMag` from it, flying `headingMag`, which need not point at
     * the fix. The learner turns toward the fix and works out the arrival and any course
     * reversal. Not with `leadInNm`.
     */
    offset: z
      .object({ bearingMag: Deg, distanceNm: z.number().positive().max(40) })
      .strict()
      .optional(),
    /**
     * The aircraft joins the transition at this fix (e.g. cleared direct to the holding fix):
     * the route starts at the course reversal there, or at the leg after the one ending there.
     */
    joinAt: Id.optional(),
    altitudeFt: Ft,
    /**
     * The altitude ATC assigns in the clearance ("descend and maintain N", "maintain N until
     * established"): kept until `until` is passed, or without it until established on the
     * route's first leg (the arc, the feeder course, the final for vectors). Scored by
     * `assigned-altitude`: not below it before then, and down to it by then.
     */
    assigned: z.object({ altFt: Ft, until: Id.optional() }).strict(),
    headingMag: Deg,
    iasKt: z.number().min(80).max(110).default(100),
    /** Entry route flown from here; omit for radar vectors to final. */
    transition: Id.optional(),
    /**
     * TAA straight-in arrival (V3): the transition's course reversal is not part of the route
     * (the GPS asks "Hold at <IAF>?" and the answer is No).
     */
    noReversal: z.boolean().optional(),
  })
  .strict()
  .refine((s) => !(s.leadInNm && s.offset), {
    message: 'a start has leadInNm or offset, not both',
  });
export type Start = z.infer<typeof StartSchema>;

// ---- Procedure ----

export const TransitionSchema = z
  .object({
    id: Id,
    name: z.string(),
    /** NoPT: a course reversal on this route needs ATC approval. */
    noPT: z.boolean().default(false),
    legs: z.array(LegSchema).min(1),
  })
  .strict();

export const ProcedureSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    airport: Id,
    runway: z.string(),
    name: z.string(),
    chart: z
      .object({
        number: z.string(),
        amendment: z.string(),
        /** Chart cycle validity, ISO dates. */
        validFrom: z.iso.date(),
        validTo: z.iso.date(),
        image: z.string(),
      })
      .strict(),
    /** Navaids the procedure is flown on (used for tuning/ident checks); empty for RNAV. */
    navaids: z.array(Id),
    /**
     * Expanded service volume: a charted route uses a VOR or localizer beyond its standard
     * service volume (KMTJ: the HAQHY feeder on JNC R-098 out to 46 NM, and the procedure
     * turn at BRUUK on the I-MTJ localizer beyond 18 NM). Range in NM by navaid id.
     */
    expandedServiceVolumeNm: z.record(z.string(), z.number().positive().max(130)).optional(),
    fixes: z.record(z.string(), FixSchema),
    /** Feeder / initial routes into the approach, each ending at the first fix of `approach`. */
    transitions: z.array(TransitionSchema),
    /** Course reversal (if any) and the final approach, flown by everyone. */
    approach: z.array(LegSchema).min(1),
    missed: z.array(LegSchema).min(1),
    /** Missed approach instructions as printed. */
    missedText: z.string(),
    minimums: z.array(MinimumsSchema).min(1),
    /** RNAV (GPS) approach data (V3). */
    rnav: RnavSchema.optional(),
    /** Terminal arrival area (V3, KOGA). */
    taa: TaaSchema.optional(),
    starts: z.array(StartSchema).min(1),
    notes: z.array(z.string()).default([]),
  })
  .strict()
  .superRefine((p, ctx) => {
    const fixNames = new Set(Object.keys(p.fixes));
    const checkFix = (name: string | undefined, path: (string | number)[]) => {
      if (name !== undefined && !fixNames.has(name))
        ctx.addIssue({ code: 'custom', message: `unknown fix "${name}"`, path });
    };
    const checkLegs = (legs: Leg[], base: (string | number)[]) =>
      legs.forEach((leg, i) => {
        const at = [...base, i];
        switch (leg.type) {
          case 'track':
          case 'arc':
          case 'direct':
            checkFix(leg.to, [...at, 'to']);
            break;
          case 'hold':
          case 'procedureTurn':
            checkFix(leg.fix, [...at, 'fix']);
            break;
          case 'final':
            checkFix(leg.faf, [...at, 'faf']);
            checkFix(leg.vdp, [...at, 'vdp']);
            checkFix(leg.map.fix, [...at, 'map', 'fix']);
            leg.stepDowns.forEach((s, j) => checkFix(s.fix, [...at, 'stepDowns', j, 'fix']));
            break;
        }
      });
    p.transitions.forEach((t, i) => checkLegs(t.legs, ['transitions', i, 'legs']));
    checkLegs(p.approach, ['approach']);
    checkLegs(p.missed, ['missed']);
    if (p.navaids.length === 0 && !p.rnav)
      ctx.addIssue({
        code: 'custom',
        message: 'a non-RNAV procedure needs navaids',
        path: ['navaids'],
      });
    if (!p.approach.some((l) => l.type === 'final'))
      ctx.addIssue({ code: 'custom', message: 'approach has no final leg', path: ['approach'] });
    const transitionIds = new Set(p.transitions.map((t) => t.id));
    p.starts.forEach((s, i) => {
      if (s.transition !== undefined && !transitionIds.has(s.transition))
        ctx.addIssue({
          code: 'custom',
          message: `unknown transition "${s.transition}"`,
          path: ['starts', i, 'transition'],
        });
    });
  });

export type Procedure = z.infer<typeof ProcedureSchema>;
export type ProcedureInput = z.input<typeof ProcedureSchema>;

/** Parse a procedure file; throws with a readable, path-annotated message. */
export function parseProcedure(json: unknown, source = 'procedure'): Procedure {
  const r = ProcedureSchema.safeParse(json);
  if (!r.success) throw new Error(`${source} is invalid:\n${z.prettifyError(r.error)}`);
  return r.data;
}
