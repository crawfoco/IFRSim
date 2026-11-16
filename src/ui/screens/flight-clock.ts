/** Flight clock text: sim time since the flight started (it runs faster at 2× and 4×). */
import { STEP_HZ } from '../../sim/loop';

const pad = (n: number) => String(n).padStart(2, '0');

/** "mm:ss", or "h:mm:ss" from an hour. */
export function formatFlightTime(tick: number): string {
  const t = Math.floor(tick / STEP_HZ);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
