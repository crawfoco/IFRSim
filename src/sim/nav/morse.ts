/**
 * Morse identification. VORs send their three-letter ident; localizers send "I" plus the
 * three letters (I-FTG → I F T G). Timing follows the standard unit scheme: dot 1,
 * dash 3, gap inside a letter 1, between letters 3.
 */
const CODE: Record<string, string> = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
};

/** Letters actually transmitted for an ident ("I-FTG" → "IFTG"). */
export const transmittedLetters = (ident: string) => ident.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Dot/dash text per letter, e.g. "I-FTG" → [["I", ".."], ["F", "..-."], …]. */
export function morse(ident: string): [string, string][] {
  return [...transmittedLetters(ident)].map((ch) => [ch, CODE[ch] ?? '']);
}

export interface Tone {
  /** Start, in dot units from the beginning of the ident. */
  at: number;
  /** Length in dot units (1 = dot, 3 = dash). */
  units: number;
}

/** Tone schedule for one transmission of the ident, plus its total length in units. */
export function morseSchedule(ident: string): { tones: Tone[]; units: number } {
  const tones: Tone[] = [];
  let t = 0;
  morse(ident).forEach(([, code], li) => {
    if (li > 0) t += 2; // 1 unit already added after the last element → 3 between letters
    for (const el of code) {
      const units = el === '-' ? 3 : 1;
      tones.push({ at: t, units });
      t += units + 1;
    }
  });
  return { tones, units: Math.max(0, t - 1) };
}

/** Dot length in ms at a given speed (PARIS standard: 1200 / wpm). Navaids send ~7 wpm. */
export const dotMs = (wpm = 7) => 1200 / wpm;
