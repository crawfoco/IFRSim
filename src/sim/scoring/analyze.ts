/**
 * Flight analysis: replay the recorded flight step by step, feed the leg sequencer and the
 * scoring rules, and produce the score table, a timeline and the data for the debrief.
 */
import { annunciation } from '../autopilot/modes';
import { DT, step } from '../loop';
import type { LoggedCommand, TrackSample } from '../recorder';
import { initialProgress, updateProgress, type Outcome } from '../scenario/progress';
import type { Scenario } from '../scenario/scenario';
import { sense } from '../sensors';
import type { Command, SimState } from '../state';
import { decision, segmentMinimum, segmentMinimums } from './rules/altitude';
import { finalCourse, glideslope } from './rules/course';
import { movingMap } from './rules/map';
import { dmeSource, tuneAndIdentify } from './rules/radios';
import { climbInHold, holdMaxAltitude, holdTiming } from './rules/hold';
import { holdEntry, noPtReversal, procedureTurn } from './rules/reversal';
import { fixOrder, missedApproach } from './rules/sequence';
import type { Rule, ScoreItem, StepContext } from './rules/types';
import { clock } from './rules/types';
import { initialSequencer, stepSequencer, type SequencerState } from './sequencer';

// Order = order in the score table.
const RULES: Rule<unknown>[] = [
  tuneAndIdentify,
  dmeSource,
  fixOrder,
  segmentMinimums,
  holdEntry,
  holdTiming,
  holdMaxAltitude,
  climbInHold,
  procedureTurn,
  finalCourse,
  glideslope,
  decision,
  missedApproach,
  noPtReversal,
  movingMap,
] as Rule<unknown>[];

export interface TimelineEvent {
  tick: number;
  kind: 'leg' | 'fix' | 'mode' | 'radio' | 'scenario';
  text: string;
}

/** One sample per second for the debrief plan and profile views. */
export interface DebriefSample extends TrackSample {
  legIndex: number;
  /** Minimum altitude in force at this moment, if any. */
  minAltFt: number | null;
}

export interface FlightAnalysis {
  items: ScoreItem[];
  /** Passed ÷ (passed + failed), 0–100; informational items do not count. */
  scorePct: number;
  timeline: TimelineEvent[];
  samples: DebriefSample[];
  sequencer: SequencerState;
  endTick: number;
  outcome: Outcome | null;
}

function modeText(s: SimState): string {
  const a = annunciation(s.ap, s.ap.navKind);
  if (!a.ap) return 'AP off';
  const armed = [a.lateralArmed, ...a.verticalArmed].filter(Boolean).join(' ');
  return `AP ${a.lateral} / ${a.vertical}${armed ? ` (armed ${armed})` : ''}`;
}

const VLOC = { NAV1: 'VLOC1', NAV2: 'VLOC2' } as const;

/** Timeline text for a command, given the state after it was applied. */
function commandText(c: Command, after: SimState): string | null {
  switch (c.type) {
    case 'syncHeadingBug':
      return `HDG bug synced to ${String(after.panel.headingBugDeg || 360).padStart(3, '0')}`;
    case 'cdi':
      return `CDI ${VLOC[after.panel.cdiSource]}`;
    case 'bearing': {
      const src = c.pointer === 1 ? after.panel.brg1 : after.panel.brg2;
      return `BRG${c.pointer} ${src ?? 'off'}`;
    }
    case 'swap':
      return `NAV${c.radio} swap`;
    case 'ident':
      return `NAV${c.radio} ident`;
    case 'dmeSource':
      return `DME source NAV${c.radio}`;
    case 'timer':
      return `Timer ${c.action === 'reset' ? 'reset' : 'start/stop'}`;
    case 'map':
      return `Moving map ${c.on ? 'on' : 'off'}`;
    default:
      return null;
  }
}

export function analyzeFlight(
  sc: Scenario,
  log: readonly LoggedCommand[],
  endTick: number,
): FlightAnalysis {
  let state = sc.initial;
  let seq = initialSequencer(sc);
  let progress = initialProgress();
  let ruleStates = RULES.map((r) => r.init(sc));
  const timeline: TimelineEvent[] = [];
  const samples: DebriefSample[] = [];
  let last: StepContext | null = null;
  let i = 0;
  let lastMode = modeText(state);
  let progressEvents = 0;

  while (state.tick < endTick) {
    const commands: Command[] = [];
    while (i < log.length && log[i]!.tick === state.tick) commands.push(log[i++]!.command);
    const prev = state;
    state = step(state, commands, sc.world);
    progress = updateProgress(progress, state, sc);
    const prevSeq = seq;
    seq = stepSequencer(seq, {
      state,
      scenario: sc,
      missedCalled: progress.phase === 'missed' || progress.outcome === 'missedComplete',
    });
    const sensors = sense(state, sc.world);
    const ctx: StepContext = {
      state,
      prev,
      sensors,
      seq,
      prevSeq,
      progress,
      scenario: sc,
      commands,
    };
    ruleStates = ruleStates.map((rs, k) => RULES[k]!.step(rs, ctx));
    last = ctx;

    // Timeline.
    if (seq.index !== prevSeq.index)
      timeline.push({ tick: state.tick, kind: 'leg', text: seq.route[seq.index]!.label });
    for (const p of seq.passages.slice(prevSeq.passages.length))
      timeline.push({
        tick: p.tick,
        kind: 'fix',
        text: `Crossed ${p.fix} at ${Math.round(p.altitudeFt)} ft`,
      });
    const mode = modeText(state);
    if (mode !== lastMode) timeline.push({ tick: state.tick, kind: 'mode', text: mode });
    lastMode = mode;
    for (const c of commands) {
      const t = commandText(c, state);
      if (t) timeline.push({ tick: state.tick, kind: 'radio', text: t });
    }
    for (const e of progress.events.slice(progressEvents))
      timeline.push({ tick: e.tick, kind: 'scenario', text: e.text });
    progressEvents = progress.events.length;

    if (state.tick % 20 === 0)
      samples.push({
        tick: state.tick,
        latDeg: state.aircraft.position.latDeg,
        lonDeg: state.aircraft.position.lonDeg,
        altitudeFt: state.aircraft.altitudeFt,
        headingTrueDeg: state.aircraft.headingTrueDeg,
        legIndex: seq.index,
        minAltFt: segmentMinimum(seq, sc),
      });
  }

  const items = last ? RULES.flatMap((r, k) => r.finish(ruleStates[k], last)) : [];
  const scored = items.filter((x) => x.status !== 'info');
  const passed = scored.filter((x) => x.status === 'pass').length;
  return {
    items,
    scorePct: scored.length ? Math.round((passed / scored.length) * 100) : 100,
    timeline,
    samples,
    sequencer: seq,
    endTick: state.tick,
    outcome: progress.outcome,
  };
}

export const formatClock = clock;
export const secondsOf = (ticks: number) => ticks * DT;
