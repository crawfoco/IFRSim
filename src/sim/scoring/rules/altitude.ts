/**
 * Altitude rules:
 * - segment minimums: not more than 100 ft below the current leg's minimum altitude;
 * - decision: at DA/MDA, land only with the runway in sight; otherwise go missed (GA).
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

/**
 * The decision at minimums (SPEC: judgement). Going missed (GA) is always acceptable;
 * continuing past the DA, below the MDA or past the MAP is fine only with the runway in
 * sight. The scenario's progress records which happened.
 */
export const decision: Rule<null> = {
  init: () => null,
  step: (s) => s,
  finish(_s, last): ScoreItem[] {
    const { progress, scenario, state } = last;
    const m = activeMinimums(
      scenario.procedure,
      scenario.options.gsOutOfService,
      state.panel.iasCmdKt,
    );
    const title = `Decision at the ${m.kind}: land only with the runway in sight, otherwise go missed`;
    const end = progress.events.find((e) => e.kind === 'landed' || e.kind === 'belowMinimums');
    const ga = progress.events.find((e) => e.kind === 'goMissed');
    if (end)
      return [
        {
          id: 'decision',
          title,
          status: end.kind === 'landed' ? 'pass' : 'fail',
          measured: end.text,
          tick: end.tick,
        },
      ];
    if (ga)
      return [
        {
          id: 'decision',
          title,
          status: 'pass',
          measured: `${ga.text}${ga.text.includes('runway in sight') ? ' (landing was possible; going missed is always allowed)' : ''}`,
          tick: ga.tick,
        },
      ];
    return [];
  },
};
