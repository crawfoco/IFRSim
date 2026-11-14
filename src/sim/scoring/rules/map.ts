/** Moving map use: informational only (SPEC: noted in the debrief, never a penalty). */
import { clock, type Rule, type ScoreItem } from './types';

export const movingMap: Rule<{ ticks: number; firstTick: number | null }> = {
  init: () => ({ ticks: 0, firstTick: null }),
  step(s, { state }) {
    if (!state.panel.mapOn) return s;
    return { ticks: s.ticks + 1, firstTick: s.firstTick ?? state.tick };
  },
  finish(s): ScoreItem[] {
    if (s.firstTick === null) return [];
    const secs = Math.round(s.ticks / 20);
    return [
      {
        id: 'moving-map',
        title: 'Moving map used',
        status: 'info',
        measured: `Map on for ${Math.floor(secs / 60)} min ${secs % 60} s, first at ${clock(s.firstTick)}. Fine for training; in the aircraft you fly from needles and DME alone.`,
        tick: s.firstTick,
      },
    ];
  },
};
