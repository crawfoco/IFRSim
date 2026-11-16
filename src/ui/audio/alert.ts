/**
 * Aural "minimums" alert for the Glass PFD: a short two-tone chime played twice, made with Web
 * Audio (no audio files, no speech synthesis). Silently does nothing without audio.
 */
import { audioContext } from './context';

/** [frequency Hz, start s, length s] */
const CHIME: readonly [number, number, number][] = [
  [880, 0, 0.16],
  [660, 0.18, 0.22],
  [880, 0.55, 0.16],
  [660, 0.73, 0.22],
];

export function playMinimumsChime(): void {
  try {
    const ctx = audioContext();
    // A context first made outside a click may start suspended; resuming is harmless otherwise.
    void ctx.resume().catch(() => {});
    const t0 = ctx.currentTime + 0.03;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.connect(gain);
    for (const [hz, at, len] of CHIME) {
      osc.frequency.setValueAtTime(hz, t0 + at);
      gain.gain.setTargetAtTime(0.18, t0 + at, 0.01);
      gain.gain.setTargetAtTime(0, t0 + at + len, 0.02);
    }
    osc.start(t0);
    osc.stop(t0 + 1.1);
  } catch {
    // No audio available (tests, locked-down browsers): the visual alert still shows.
  }
}
