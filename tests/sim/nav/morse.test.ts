import { describe, expect, it } from 'vitest';
import { dotMs, morse, morseSchedule, transmittedLetters } from '../../../src/sim/nav/morse';

describe('Morse ident', () => {
  it('a localizer sends I plus its three letters', () => {
    expect(transmittedLetters('I-FTG')).toBe('IFTG');
    expect(morse('I-FTG')).toEqual([
      ['I', '..'],
      ['F', '..-.'],
      ['T', '-'],
      ['G', '--.'],
    ]);
    expect(morse('FQF').map(([, c]) => c)).toEqual(['..-.', '--.-', '..-.']);
  });

  it('timing: dot 1, dash 3, element gap 1, letter gap 3', () => {
    // "ET": E = . (0–1), gap 3, T = - (4–7)
    expect(morseSchedule('ET')).toEqual({
      tones: [
        { at: 0, units: 1 },
        { at: 4, units: 3 },
      ],
      units: 7,
    });
    // "A" = .- : dot 0–1, gap 1, dash 2–5
    expect(morseSchedule('A').tones).toEqual([
      { at: 0, units: 1 },
      { at: 2, units: 3 },
    ]);
    expect(dotMs(12)).toBe(100);
  });
});
