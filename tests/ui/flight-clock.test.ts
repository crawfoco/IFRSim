/** Flight clock: sim time since the start of the flight. */
import { describe, expect, it } from 'vitest';
import { formatFlightTime } from '../../src/ui/screens/flight-clock';

describe('formatFlightTime', () => {
  it('mm:ss under an hour (20 ticks per second)', () => {
    expect(formatFlightTime(0)).toBe('00:00');
    expect(formatFlightTime(19)).toBe('00:00');
    expect(formatFlightTime(20)).toBe('00:01');
    expect(formatFlightTime(20 * 754)).toBe('12:34');
  });

  it('h:mm:ss from an hour', () => {
    expect(formatFlightTime(20 * 3600)).toBe('1:00:00');
    expect(formatFlightTime(20 * (3600 + 62))).toBe('1:01:02');
  });
});
