/**
 * Altitude rules:
 * - segment minimums: not more than 100 ft below the current leg's minimum altitude;
 * - minimums: not below the DA/MDA (by more than 100 ft) without the runway in sight.
 */
import { activeMinimums } from '../../scenario/scenario';
import type { SequencerState } from '../sequencer';
import { currentLeg } from '../sequencer';
import type { Scenario } from '../../scenario/scenario';
import { clock, fmtFt, type Rule, type ScoreItem } from './types';

const TOLERANCE_FT = 100;

/**
 * Minimum altitude for the current moment, or null when none applies (missed approach,
 * glideslope-coupled final, or past the last step-down on a non-precision final, where
 * the MDA rule takes over).
 */
export function segmentMinimum(seq: SequencerState, sc: Scenario): number | null {
  if (seq.missedTick !== null) return null;
  const { leg } = currentLeg(seq);
  switch (leg.type) {
    case 'track':
    case 'arc':
    case 'heading':
    case 'direct':
    case 'hold':
      return leg.minAltFt ?? null;
    case 'procedureTurn':
      // Until established inbound the procedure-turn rule judges the PT altitude.
      return seq.reversal.inboundTick !== null ? (leg.inboundMinAltFt ?? leg.minAltFt) : null;
    case 'climb':
      return null;
    case 'final': {
      if (seq.fafTick === null) return leg.fafAltFt;
      const precision = !!leg.glideslope && !sc.options.gsOutOfService;
      if (precision) return null;
      const passed = new Set(seq.passages.filter((p) => p.tick >= seq.fafTick!).map((p) => p.fix));
      const next = leg.stepDowns.find((sd) => !passed.has(sd.fix));
      return next ? next.minAltFt : null;
    }
  }
}

interface SegmentState {
  worst: { deficitFt: number; altFt: number; minFt: number; label: string; tick: number } | null;
  /** Smallest margin seen (for the "pass" measurement). */
  minMarginFt: number;
}

export const segmentMinimums: Rule<SegmentState> = {
  init: () => ({ worst: null, minMarginFt: Infinity }),
  step(s, { seq, scenario, state }) {
    const min = segmentMinimum(seq, scenario);
    if (min === null) return s;
    const alt = state.aircraft.altitudeFt;
    const margin = alt - min;
    let next = margin < s.minMarginFt ? { ...s, minMarginFt: margin } : s;
    const deficit = min - alt;
    if (deficit > TOLERANCE_FT && (!next.worst || deficit > next.worst.deficitFt))
      next = {
        ...next,
        worst: {
          deficitFt: deficit,
          altFt: alt,
          minFt: min,
          label: currentLeg(seq).label,
          tick: state.tick,
        },
      };
    return next;
  },
  finish(s): ScoreItem[] {
    const w = s.worst;
    return [
      {
        id: 'segment-minimums',
        title: 'Segment minimum altitudes',
        status: w ? 'fail' : 'pass',
        measured: w
          ? `${fmtFt(w.altFt)} on "${w.label}" (minimum ${fmtFt(w.minFt)}) at ${clock(w.tick)}`
          : Number.isFinite(s.minMarginFt)
            ? `Never below a segment minimum (closest: ${s.minMarginFt >= 0 ? '+' : ''}${Math.round(s.minMarginFt)} ft)`
            : 'No segment minimum applied',
        ...(w ? { tick: w.tick } : {}),
      },
    ];
  },
};

interface BelowMinState {
  reached: boolean;
  lowestFt: number;
  lowestTick: number;
  minFt: number;
  kind: 'DA' | 'MDA';
}

/** Continued below DA/MDA without the runway in sight (ceiling below minimums). */
export const belowMinimums: Rule<BelowMinState> = {
  init: () => ({ reached: false, lowestFt: Infinity, lowestTick: 0, minFt: 0, kind: 'DA' }),
  step(s, { seq, scenario, state }) {
    if (scenario.options.ceiling !== 'below') return s;
    const onFinal = seq.fafTick !== null;
    const recentMissed = seq.missedTick !== null && state.tick - seq.missedTick < 20 * 60;
    if (!onFinal || (seq.missedTick !== null && !recentMissed)) return s;
    const m = activeMinimums(
      scenario.procedure,
      scenario.options.gsOutOfService,
      state.panel.iasCmdKt,
    );
    const alt = state.aircraft.altitudeFt;
    return {
      reached: s.reached || alt <= m.altFt,
      lowestFt: alt < s.lowestFt ? alt : s.lowestFt,
      lowestTick: alt < s.lowestFt ? state.tick : s.lowestTick,
      minFt: m.altFt,
      kind: m.kind,
    };
  },
  finish(s, last): ScoreItem[] {
    if (last.scenario.options.ceiling !== 'below' || !s.reached) return [];
    const below = s.minFt - s.lowestFt;
    const fail = below > TOLERANCE_FT;
    return [
      {
        id: 'below-minimums',
        title: `No descent below ${s.kind} without the runway in sight`,
        status: fail ? 'fail' : 'pass',
        measured: `Lowest ${fmtFt(s.lowestFt)} (${s.kind} ${fmtFt(s.minFt)}${below > 0 ? `, ${Math.round(below)} ft below` : ''})`,
        ...(fail ? { tick: s.lowestTick } : {}),
      },
    ];
  },
};
