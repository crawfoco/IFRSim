/**
 * Radio rules:
 * - every navaid is tuned and identified (Morse) before it is used, with a short grace
 *   after the leg that needs it starts;
 * - where the chart names the DME source (KMTJ: MTJ), the DME is read from it.
 */
import type { Leg } from '../../../procedures/schema';
import type { Scenario } from '../../scenario/scenario';
import { clock, type Rule, type ScoreItem } from './types';

/** Time allowed after a leg starts to tune and identify its navaid. */
export const IDENT_GRACE_S = 120;
/** Time on the wrong DME source that counts as a fault. */
const WRONG_DME_S = 30;

/** Navaids a leg is flown on (course station, arc station, direct-to station, named DME). */
export function legNavaids(leg: Leg, sc: Scenario): string[] {
  const out = new Set<string>();
  const ref = (r: { navaid: string } | { loc: string }) => ('loc' in r ? r.loc : r.navaid);
  switch (leg.type) {
    case 'track':
    case 'hold':
    case 'procedureTurn':
    case 'final':
      out.add(ref(leg.course));
      break;
    case 'heading':
      if (leg.intercept) out.add(ref(leg.intercept));
      break;
    case 'arc':
      out.add(leg.navaid);
      break;
    case 'direct': {
      const f = sc.procedure.fixes[leg.to];
      if (f?.def.kind === 'navaid') out.add(f.def.navaid);
      break;
    }
    case 'climb':
      break;
  }
  if ('dme' in leg && leg.dme) out.add(leg.dme);
  return [...out];
}

interface IdentState {
  /** First tick each navaid's leg became active. */
  firstUse: Record<string, number>;
  /** First tick each navaid was identified (ident pressed while tuned to it). */
  identified: Record<string, number>;
}

export const tuneAndIdentify: Rule<IdentState> = {
  init: () => ({ firstUse: {}, identified: {} }),
  step(s, { seq, prevSeq, scenario, commands, sensors, state }) {
    let next = s;
    if (seq.index !== prevSeq.index || state.tick === 1) {
      const leg = seq.route[seq.index]!;
      for (const id of legNavaids(leg.leg, scenario))
        if (!(id in next.firstUse))
          next = { ...next, firstUse: { ...next.firstUse, [id]: state.tick } };
    }
    for (const c of commands) {
      if (c.type !== 'ident') continue;
      const ident = (c.radio === 1 ? sensors.nav1 : sensors.nav2).ident;
      if (ident && !(ident in next.identified))
        next = { ...next, identified: { ...next.identified, [ident]: state.tick } };
    }
    return next;
  },
  finish(s): ScoreItem[] {
    return Object.entries(s.firstUse).map(([id, use]) => {
      const idTick = s.identified[id];
      const ok = idTick !== undefined && idTick <= use + IDENT_GRACE_S * 20;
      return {
        id: `ident:${id}`,
        title: `${id} tuned and identified before use`,
        status: ok ? 'pass' : 'fail',
        measured:
          idTick === undefined
            ? `Never identified (needed from ${clock(use)})`
            : `Identified at ${clock(idTick)} (needed from ${clock(use)})`,
        tick: idTick ?? use,
      };
    });
  },
};

interface DmeState {
  required: string | null;
  wrongTicks: number;
  firstWrongTick: number | null;
  wrongSource: string | null;
  checked: boolean;
}

export const dmeSource: Rule<DmeState> = {
  init: () => ({
    required: null,
    wrongTicks: 0,
    firstWrongTick: null,
    wrongSource: null,
    checked: false,
  }),
  step(s, { seq, sensors, state }) {
    const leg = seq.route[seq.index]!.leg;
    if (seq.missedTick !== null || !('dme' in leg) || !leg.dme) return s;
    const radio = state.radios.dmeSource;
    const ident = (radio === 1 ? sensors.nav1 : sensors.nav2).ident;
    const wrong = ident !== leg.dme;
    return {
      required: leg.dme,
      checked: true,
      wrongTicks: s.wrongTicks + (wrong ? 1 : 0),
      firstWrongTick: wrong && s.firstWrongTick === null ? state.tick : s.firstWrongTick,
      wrongSource: wrong ? `NAV${radio} (${ident ?? 'nothing tuned'})` : s.wrongSource,
    };
  },
  finish(s): ScoreItem[] {
    if (!s.checked) return [];
    const fail = s.wrongTicks / 20 > WRONG_DME_S;
    return [
      {
        id: 'dme-source',
        title: `DME read from ${s.required}`,
        status: fail ? 'fail' : 'pass',
        measured: fail
          ? `DME source was ${s.wrongSource} for ${Math.round(s.wrongTicks / 20)} s`
          : `DME source set to ${s.required}`,
        ...(fail && s.firstWrongTick !== null ? { tick: s.firstWrongTick } : {}),
      },
    ];
  },
};
