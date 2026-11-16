/**
 * RNAV (GPS) rules (V3):
 * - gps-approach-active: the approach was loaded with the cleared transition (or vectors to
 *   final) and active before the FAF;
 * - gps-approach-mode: the FAF crossed with the CDI on the GPS in approach mode (APR scaling);
 * - glidepath: GP deviation within half scale inside the FAF, above the DA (LPV, LNAV/VNAV);
 * - missed-sequencing: after GA, the GPS sequenced into the missed approach (SUSP) within 30 s
 *   (steam only: on glass, GA does it);
 * - missed-hold: once at the missed-approach holding fix, the aircraft entered the hold and
 *   got established, without straying from the holding area (the GPS flies the entry, so
 *   `hold-entry` and `hold-timing` don't apply to RNAV holds).
 * None apply to a non-RNAV procedure.
 */
import { VTF } from '../../gps/flightplan';
import { activePlan, availableLine, gpsReading } from '../../gps/receiver';
import { GS_FULL_SCALE_DEG, gsIndication } from '../../nav/gs';
import { lineHasGlidepath } from '../../gps/flightplan';
import { activeMinimums, waasOf } from '../../scenario/scenario';
import { distanceNm } from '../../geo/geodesy';
import { clock, type Rule, type ScoreItem } from './types';

/** The transition a start is cleared for, as the GPS names it. */
const clearedTransition = (t: string | undefined) => t ?? VTF;

const transitionName = (id: string, names: Record<string, string>) =>
  id === VTF ? 'vectors to final' : (names[id] ?? id);

interface AtFaf {
  /** Checked once, when the FAF is crossed. */
  done: boolean;
  tick: number;
  loaded: string | null;
  active: boolean;
  /** CDI on the GPS and the GPS in approach mode throughout the last mile before the FAF. */
  cdiGps: boolean;
  phase: string;
  annunciation: string | null;
  /** First moment in that last mile when it was not. */
  badTick: number | null;
}

const atFafInit = (): AtFaf => ({
  done: false,
  tick: 0,
  loaded: null,
  active: false,
  cdiGps: true,
  phase: 'APR',
  annunciation: null,
  badTick: null,
});

/** Judged over the last mile before the FAF, so a quick switch across it still counts. */
const LAST_MILE_NM = 1;

/** Records the GPS situation approaching and crossing the FAF. */
function stepAtFaf(s: AtFaf, ctx: Parameters<Rule<AtFaf>['step']>[1]): AtFaf {
  if (s.done || !ctx.scenario.world.gps) return s;
  const { state, sensors, scenario } = ctx;
  let out = s;
  const faf = scenario.fixes[scenario.final.faf];
  // Only on the leg inbound to the FAF (an arrival may pass over the FAF the other way first).
  const cur = ctx.seq.route[ctx.seq.index]?.leg;
  const inbound = cur?.type === 'track' && cur.to === scenario.final.faf;
  if (faf && inbound && distanceNm(faf, state.aircraft.position) < LAST_MILE_NM) {
    const cdiGps = state.panel.cdiSource === 'GPS';
    const apr = sensors.gps.phase === 'APR';
    if ((!cdiGps || !apr) && s.badTick === null)
      out = { ...out, badTick: state.tick, cdiGps, phase: sensors.gps.phase };
    if (cdiGps && apr) out = { ...out, annunciation: sensors.gps.annunciation };
  }
  if (ctx.seq.fafTick === null) return out;
  return {
    ...out,
    done: true,
    tick: state.tick,
    loaded: state.gps.loaded?.transition ?? null,
    active: state.gps.active,
  };
}

export const gpsApproachActive: Rule<AtFaf> = {
  init: atFafInit,
  step: stepAtFaf,
  finish(s, last): ScoreItem[] {
    const sc = last.scenario;
    if (!sc.world.gps) return [];
    const want = clearedTransition(sc.start.transition);
    const names = Object.fromEntries(sc.world.gps.db.transitions.map((t) => [t.id, t.name]));
    const title = `GPS approach loaded via ${transitionName(want, names)} and active before the FAF`;
    if (!s.done)
      return [
        {
          id: 'gps-approach-active',
          title,
          status: 'info',
          measured: 'The FAF was not reached.',
        },
      ];
    const ok = s.active && s.loaded === want;
    return [
      {
        id: 'gps-approach-active',
        title,
        status: ok ? 'pass' : 'fail',
        measured: ok
          ? `Loaded and active at the FAF (${clock(s.tick)})`
          : s.loaded === null
            ? `No approach loaded at the FAF (${clock(s.tick)})`
            : !s.active
              ? `Loaded but not activated at the FAF (${clock(s.tick)})`
              : `Loaded via ${transitionName(s.loaded, names)}, cleared via ${transitionName(want, names)}`,
        ...(ok ? {} : { tick: s.tick }),
      },
    ];
  },
};

export const gpsApproachMode: Rule<AtFaf> = {
  init: atFafInit,
  step: stepAtFaf,
  finish(s, last): ScoreItem[] {
    if (!last.scenario.world.gps || !s.done) return [];
    const ok = s.badTick === null;
    const at = clock(s.badTick ?? s.tick);
    return [
      {
        id: 'gps-approach-mode',
        title: 'FAF crossed on the GPS in approach mode (APR)',
        status: ok ? 'pass' : 'fail',
        measured: ok
          ? `CDI on GPS, ${s.annunciation ?? 'APR'} at ${clock(s.tick)}`
          : !s.cdiGps
            ? `The CDI was not on the GPS approaching the FAF (${at})`
            : `The GPS was in ${s.phase}, not approach mode, approaching the FAF (${at})`,
        ...(ok ? {} : { tick: s.badTick! }),
      },
    ];
  },
};

interface DevState {
  maxDeg: number;
  maxTick: number;
  samples: number;
}

export const glidepath: Rule<DevState> = {
  init: () => ({ maxDeg: 0, maxTick: 0, samples: 0 }),
  step(s, { seq, scenario, state }) {
    const w = scenario.world.gps;
    if (!w?.db.glidePath || seq.fafTick === null || seq.missedTick !== null) return s;
    const line = availableLine(w);
    if (!line || !lineHasGlidepath(line)) return s;
    const da = activeMinimums(
      scenario.procedure,
      false,
      state.panel.iasCmdKt,
      waasOf(scenario.options),
    ).altFt;
    if (state.aircraft.altitudeFt < da) return s;
    const ind = gsIndication(
      { position: state.aircraft.position, altitudeFt: state.aircraft.altitudeFt },
      w.db.glidePath,
    );
    const d = Math.abs(ind.offsetDeg);
    return d > s.maxDeg
      ? { maxDeg: d, maxTick: state.tick, samples: s.samples + 1 }
      : { ...s, samples: s.samples + 1 };
  },
  finish(s): ScoreItem[] {
    if (s.samples === 0) return [];
    const half = GS_FULL_SCALE_DEG / 2;
    const fail = s.maxDeg > half;
    return [
      {
        id: 'glidepath',
        title: 'GPS glidepath within half scale inside the FAF',
        status: fail ? 'fail' : 'pass',
        measured: `Largest deviation ${(s.maxDeg / half).toFixed(1)} dots (${s.maxDeg.toFixed(2)}°) at ${clock(s.maxTick)}`,
        ...(fail ? { tick: s.maxTick } : {}),
      },
    ];
  },
};

/** Time after GA within which the GPS must be sequencing the missed approach. */
const MISSED_SEQ_S = 30;

export const missedSequencing: Rule<{ tick: number | null }> = {
  init: () => ({ tick: null }),
  step(s, { scenario, state }) {
    if (s.tick !== null || !scenario.world.gps || state.goAroundTick === null) return s;
    // Glass: GA itself sequences the GPS; the rule is for the hand SUSP on steam.
    if (scenario.world.gps.goAroundSequencesMissed) return s;
    const plan = activePlan(state.gps, scenario.world.gps);
    if (!plan) return s;
    const sequencing = state.gps.missedArmed || state.gps.leg >= plan.missedLeg;
    return sequencing ? { tick: state.tick } : s;
  },
  finish(s, last): ScoreItem[] {
    const { scenario, state } = last;
    if (!scenario.world.gps || state.goAroundTick === null) return [];
    if (scenario.world.gps.goAroundSequencesMissed) return [];
    const ga = state.goAroundTick;
    const ok = s.tick !== null && s.tick - ga <= MISSED_SEQ_S * 20;
    return [
      {
        id: 'missed-sequencing',
        title: `GPS sequenced into the missed approach (SUSP) within ${MISSED_SEQ_S} s of GA`,
        status: ok ? 'pass' : 'fail',
        measured:
          s.tick === null
            ? 'The GPS never sequenced into the missed approach (SUSP not pressed).'
            : `${Math.round((s.tick - ga) / 20)} s after GA (${clock(s.tick)})`,
        ...(ok ? {} : { tick: s.tick ?? ga }),
      },
    ];
  },
};

/** Holding area: the hold's leg length plus this margin, NM from the fix. */
const HOLD_AREA_MARGIN_NM = 3;
/** A timed leg's length for the holding area, NM per minute (about 100 kt). */
const NM_PER_MIN = 1.8;

interface MissedHold {
  arrivalTick: number | null;
  /** Farthest from the fix after the arrival, before established. */
  maxNm: number;
  maxTick: number | null;
  established: boolean;
}

export const missedHold: Rule<MissedHold> = {
  init: () => ({ arrivalTick: null, maxNm: 0, maxTick: null, established: false }),
  step(s, { scenario, state, progress }) {
    if (!scenario.world.gps || s.established) return s;
    if (progress.holdArrivalTick === null) return s;
    if (progress.inboundCrossings >= 1) return { ...s, established: true };
    const nm = distanceNm(state.aircraft.position, scenario.fixes[scenario.missedHold.fix]!);
    const arrivalTick = s.arrivalTick ?? progress.holdArrivalTick;
    return nm > s.maxNm
      ? { ...s, arrivalTick, maxNm: nm, maxTick: state.tick }
      : { ...s, arrivalTick };
  },
  finish(s, last): ScoreItem[] {
    const sc = last.scenario;
    // Not reaching the fix is `missed-approach`'s "did not reach".
    if (!sc.world.gps || s.arrivalTick === null) return [];
    const h = sc.missedHold;
    const limitNm = (h.legNm ?? (h.legMinutes ?? 1) * NM_PER_MIN) + HOLD_AREA_MARGIN_NM;
    const strayed = s.maxNm > limitNm;
    const title = `Entered and established in the ${h.fix} hold`;
    if (strayed)
      return [
        {
          id: 'missed-hold',
          title,
          status: 'fail',
          measured: `Flew ${s.maxNm.toFixed(1)} NM from ${h.fix} without entering the hold (the holding area is about ${limitNm.toFixed(0)} NM).`,
          tick: s.maxTick ?? s.arrivalTick,
        },
      ];
    if (!s.established)
      return [
        {
          id: 'missed-hold',
          title,
          status: 'fail',
          measured: `The flight ended before the aircraft was established in the ${h.fix} hold (crossed ${h.fix} at ${clock(s.arrivalTick)}).`,
          tick: s.arrivalTick,
        },
      ];
    return [
      {
        id: 'missed-hold',
        title,
        status: 'pass',
        measured: `Entered at ${clock(s.arrivalTick)} and established inbound.`,
        tick: s.arrivalTick,
      },
    ];
  },
};

/** GPS full scale on the final where the aircraft is (for `final-course` on RNAV finals). */
export function gpsFinalFullScaleNm(ctx: Parameters<Rule<unknown>['step']>[1]): number | null {
  const w = ctx.scenario.world.gps;
  if (!w) return null;
  // Read the scale the GPS would show on the final leg, whatever the learner has loaded.
  const state = ctx.state;
  const plan = w.plans[VTF];
  if (!plan) return null;
  const r = gpsReading(
    { ...state.gps, loaded: { transition: VTF }, active: true, leg: plan.mapLeg, flyBy: null },
    w,
    { position: state.aircraft.position, altitudeFt: state.aircraft.altitudeFt },
    100,
    0,
  );
  return r.fullScaleNm;
}
