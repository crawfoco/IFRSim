/**
 * Radio rules:
 * - every navaid is tuned and identified (Morse) before it is used, with a short grace
 *   after the leg that needs it starts, and stays tuned while a leg that needs it is flown;
 * - where the chart names the DME source (KMTJ: MTJ), the DME is read from it.
 */
import type { Leg } from '../../../procedures/schema';
import { panelOf, type Scenario } from '../../scenario/scenario';
import { clock, type Rule, type ScoreItem } from './types';

/** Time allowed after a leg starts to tune and identify its navaid. */
export const IDENT_GRACE_S = 120;
/** Continuous time a needed navaid may be off both radios (e.g. a quick swap to check something). */
export const TUNE_LAPSE_S = 10;
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

interface OffTune {
  /** First tick of the continuous spell with the navaid on neither radio. */
  since: number;
  /** Label of the leg being flown when the spell started. */
  leg: string;
}

interface IdentState {
  /** First tick each navaid's leg became active. */
  firstUse: Record<string, number>;
  /** First tick each navaid was identified (ident pressed while tuned to it). */
  identified: Record<string, number>;
  /**
   * Radio that last had each navaid active while it was needed. Present once the navaid has
   * been tuned (the tune watch is armed).
   */
  lastRadio: Record<string, 1 | 2>;
  /** Ongoing spells with a needed navaid tuned on neither radio. */
  offTune: Record<string, OffTune>;
  /** Longest spell per navaid that went beyond TUNE_LAPSE_S (ticks). */
  lapse: Record<string, OffTune & { ticks: number }>;
}

const sameFreq = (a: number, b: number) => Math.abs(a - b) < 0.005;

function navaidFreq(id: string, sc: Scenario): number | null {
  const nd = sc.world.navdata;
  return nd.navaids[id]?.freqMHz ?? nd.localizers[id]?.freqMHz ?? null;
}

/** mm:ss duration from a tick count, e.g. 0:25. */
const span = (ticks: number) => {
  const t = Math.round(ticks / 20);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * Each navaid a leg is flown on is identified within IDENT_GRACE_S of the leg starting, and
 * stays tuned (active frequency, either radio) while a leg that needs it is current: more
 * than TUNE_LAPSE_S continuously on neither radio fails. The watch starts once the navaid is
 * first tuned (or the ident grace runs out); re-tuning it later needs no new ident.
 * Time off-tune does not count while the radio that last had the navaid now has a navaid
 * needed by one of the next two route legs: re-tuning early for the next leg (e.g. the
 * localizer at a lead radial, before the arc's end fix sequences) is normal technique. A
 * next-leg navaid parked on the other radio all along does not suspend the watch.
 */
export const tuneAndIdentify: Rule<IdentState> = {
  init: () => ({ firstUse: {}, identified: {}, lastRadio: {}, offTune: {}, lapse: {} }),
  step(s, { seq, prevSeq, scenario, commands, sensors, state }) {
    let next = s;
    const cur = seq.route[seq.index]!;
    const needed = legNavaids(cur.leg, scenario);
    if (seq.index !== prevSeq.index || state.tick === 1) {
      for (const id of needed)
        if (!(id in next.firstUse))
          next = { ...next, firstUse: { ...next.firstUse, [id]: state.tick } };
    }
    const identify = (ident: string | null) => {
      if (ident && !(ident in next.identified))
        next = { ...next, identified: { ...next.identified, [ident]: state.tick } };
    };
    for (const c of commands) {
      if (c.type === 'ident') identify((c.radio === 1 ? sensors.nav1 : sensors.nav2).ident);
    }
    // Glass panel: the decoded ident shown next to the frequency (auto-ID) identifies the
    // station as soon as it is received. Steam: only the ID button does.
    if (panelOf(scenario.options) === 'glass') {
      identify(sensors.nav1.ident);
      identify(sensors.nav2.ident);
    }

    // Tune watch for the navaids the current leg needs.
    const { nav1, nav2 } = state.radios;
    const offTune: Record<string, OffTune> = {};
    const upcoming = [seq.route[seq.index + 1], seq.route[seq.index + 2]].flatMap((r) =>
      r ? legNavaids(r.leg, scenario) : [],
    );
    const setForNextLeg = (radio: 1 | 2) =>
      upcoming.some((id) => {
        const f = navaidFreq(id, scenario);
        return f !== null && sameFreq((radio === 1 ? nav1 : nav2).activeMHz, f);
      });
    let lastRadio = next.lastRadio;
    let lapse = next.lapse;
    for (const id of needed) {
      const f = navaidFreq(id, scenario);
      if (f === null) continue;
      const has = (radio: 1 | 2) => sameFreq((radio === 1 ? nav1 : nav2).activeMHz, f);
      const last = lastRadio[id];
      if (has(1) || has(2)) {
        // Keep the remembered radio while it still has the navaid (tuned on both radios).
        if (last === undefined || !has(last)) lastRadio = { ...lastRadio, [id]: has(1) ? 1 : 2 };
        continue;
      }
      const graceOver = state.tick > (next.firstUse[id] ?? state.tick) + IDENT_GRACE_S * 20;
      if (last === undefined && !graceOver) continue;
      // Re-tuning early for the next leg is fine (on the radio that had this navaid).
      if (last !== undefined && setForNextLeg(last)) continue;
      const spell = next.offTune[id] ?? { since: state.tick, leg: cur.label };
      offTune[id] = spell;
      const ticks = state.tick - spell.since + 1;
      if (ticks > TUNE_LAPSE_S * 20 && ticks > (lapse[id]?.ticks ?? 0))
        lapse = { ...lapse, [id]: { ...spell, ticks } };
    }
    return { ...next, lastRadio, offTune, lapse };
  },
  finish(s): ScoreItem[] {
    return Object.entries(s.firstUse).map(([id, use]) => {
      const idTick = s.identified[id];
      const identOk = idTick !== undefined && idTick <= use + IDENT_GRACE_S * 20;
      const lapse = s.lapse[id];
      const parts: string[] = [];
      if (!identOk || !lapse)
        parts.push(
          idTick === undefined
            ? `Never identified (needed from ${clock(use)})`
            : `Identified at ${clock(idTick)} (needed from ${clock(use)})`,
        );
      if (lapse)
        parts.push(
          `${id} not tuned for ${span(lapse.ticks)} while flying '${lapse.leg}' (from ${clock(lapse.since)})`,
        );
      return {
        id: `ident:${id}`,
        title: `${id} tuned and identified before use`,
        status: identOk && !lapse ? 'pass' : 'fail',
        measured: parts.join('; '),
        tick: !identOk ? (idTick ?? use) : lapse ? lapse.since : idTick!,
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
