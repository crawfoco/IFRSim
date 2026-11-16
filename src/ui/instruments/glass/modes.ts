/** Glass PFD mode bar text and the minimums alert timing. Pure. */
import { annunciation, type ApModes } from '../../../sim/autopilot/modes';
import { STEP_HZ } from '../../../sim/loop';
import type { ScenarioProgress } from '../../../sim/scenario/progress';

export interface ModeBarFields {
  ap: boolean;
  /** Active lateral mode (green), e.g. HDG, VOR, LOC, ROL. */
  lateral: string;
  /** Armed lateral mode (white). */
  lateralArmed: string;
  /** Active vertical mode (green), e.g. ALT, GS, GA, "VS −500FPM". */
  vertical: string;
  /** Armed vertical modes (white): ALTS (selected altitude) and GS. */
  verticalArmed: string;
}

const fmtVs = (fpm: number) => `${fpm > 0 ? '+' : fpm < 0 ? '−' : ''}${Math.abs(fpm)}FPM`;

export function modeBarFields(ap: ApModes): ModeBarFields {
  const a = annunciation(ap, ap.navKind);
  if (!a.ap) return { ap: false, lateral: '', lateralArmed: '', vertical: '', verticalArmed: '' };
  return {
    ap: true,
    lateral: a.lateral ?? '',
    lateralArmed: a.lateralArmed ?? '',
    vertical: a.vertical === 'VS' ? `VS ${fmtVs(ap.vsRefFpm)}` : (a.vertical ?? ''),
    verticalArmed: a.verticalArmed.map((m) => (m === 'ALT' ? 'ALTS' : m)).join(' '),
  };
}

/** The mode bar as a sentence, for the screen-reader status line. */
export function modeBarText(f: ModeBarFields): string {
  if (!f.ap) return 'Autopilot off';
  const part = (active: string, armed: string) =>
    [active, armed && `armed ${armed}`].filter(Boolean).join(', ');
  return `Autopilot on. Lateral ${part(f.lateral, f.lateralArmed)}. Vertical ${part(
    f.vertical,
    f.verticalArmed,
  )}.`;
}

/** How long the MINIMUMS alert stays on after the "Minimums." callout, in sim time. */
export const MINIMUMS_ALERT_S = 5;

/**
 * The PFD's MINIMUMS alert: on for 5 s of sim time after the scenario's "minimums" event (the
 * same one that gives the "Minimums." callout), and off once the flight has gone missed or ended.
 */
export function minimumsAlertOn(p: ScenarioProgress, tick: number): boolean {
  if (p.phase !== 'approach') return false;
  const ev = p.events.findLast((e) => e.kind === 'minimums');
  return !!ev && tick - ev.tick < MINIMUMS_ALERT_S * STEP_HZ;
}

/** Tick of the latest minimums event, for playing the aural alert once per event. */
export function minimumsEventTick(p: ScenarioProgress): number | null {
  return p.events.findLast((e) => e.kind === 'minimums')?.tick ?? null;
}
