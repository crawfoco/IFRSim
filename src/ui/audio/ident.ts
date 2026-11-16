/** Plays a navaid's Morse ident as a 1020 Hz tone with the Web Audio API (no assets). */
import { dotMs, morseSchedule } from '../../sim/nav/morse';
import { audioContext } from './context';

const TONE_HZ = 1020;

/** Play the ident once; returns its duration in ms. Silently does nothing without audio. */
export function playIdent(ident: string, wpm = 7): number {
  const { tones, units } = morseSchedule(ident);
  const unit = dotMs(wpm) / 1000;
  try {
    const ctx = audioContext();
    const t0 = ctx.currentTime + 0.05;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.frequency.value = TONE_HZ;
    osc.connect(gain);
    for (const t of tones) {
      const start = t0 + t.at * unit;
      const end = start + t.units * unit;
      gain.gain.setTargetAtTime(0.15, start, 0.004);
      gain.gain.setTargetAtTime(0, end, 0.004);
    }
    osc.start(t0);
    osc.stop(t0 + units * unit + 0.1);
  } catch {
    // No audio available (tests, locked-down browsers): the text ident still shows.
  }
  return units * dotMs(wpm);
}
