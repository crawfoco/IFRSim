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

export const FixDefSchema = z.discriminatedUnion('kind', [AtNavaid, RadialDme, LocDme, Threshold]);
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
export const CourseRefSchema = z.union([VorCourse, LocCourse]);
export type CourseRef = z.infer<typeof CourseRefSchema>;

const Altitude = {
  /** At or above. */
  minAltFt: Ft.optional(),
  /** At or below. */
  maxAltFt: Ft.optional(),
};

// ---- Legs ----

/** Track a course to a fix (feeder, initial, intermediate, missed). */
const TrackLeg = z
  .object({ type: z.literal('track'), to: Id, course: CourseRefSchema, ...Altitude })
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
const DirectLeg = z.object({ type: z.literal('direct'), to: Id, ...Altitude }).strict();

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
    minAltFt: Ft,
  })
  .strict();

const StepDown = z
  .object({
    fix: Id,
    minAltFt: Ft,
    /** Applies only to the LOC/VOR (non-precision) final. */
    locOnly: z.boolean().optional(),
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
    stepDowns: z.array(StepDown).default([]),
    vdp: Id.optional(),
    map: Map,
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
    /** ILS → DA; LOC / VOR → MDA. */
    kind: z.enum(['ILS', 'LOC', 'VOR']),
    label: z.string(),
    A: CatMin,
    B: CatMin,
  })
  .strict();
export type Minimums = z.infer<typeof MinimumsSchema>;

// ---- Start conditions ----

export const StartSchema = z
  .object({
    id: Id,
    name: z.string(),
    /** ATC clearance as the controller would say it. */
    clearance: z.string(),
    /** Where the aircraft starts (chart-style position). */
    position: FixDefSchema,
    altitudeFt: Ft,
    headingMag: Deg,
    iasKt: z.number().min(90).max(120).default(100),
    /** Entry route flown from here; omit for radar vectors to final. */
    transition: Id.optional(),
    /** Radios as the learner finds them (usually still on the previous station). */
    nav1MHz: z.number().min(108).max(117.95),
    nav2MHz: z.number().min(108).max(117.95),
  })
  .strict();
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
    /** Navaids the procedure is flown on (used for tuning/ident checks). */
    navaids: z.array(Id).min(1),
    fixes: z.record(z.string(), FixSchema),
    /** Feeder / initial routes into the approach, each ending at the first fix of `approach`. */
    transitions: z.array(TransitionSchema),
    /** Course reversal (if any) and the final approach, flown by everyone. */
    approach: z.array(LegSchema).min(1),
    missed: z.array(LegSchema).min(1),
    /** Missed approach instructions as printed. */
    missedText: z.string(),
    minimums: z.array(MinimumsSchema).min(1),
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
