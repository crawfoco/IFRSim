import { describe, expect, it } from 'vitest';
import { readNav } from '../../../src/sim/nav/radios';
import { buildWorld } from '../../../src/sim/world';
import { nav, onLocalizer, onRadial } from '../helpers';

const W = buildWorld(nav, { magVarEastDeg: 8 });

describe('Morse ident reception', () => {
  it('a VOR is heard inside its service volume, even overhead, but not beyond it', () => {
    expect(
      readNav(W, 116.3, 0, { position: onRadial('FQF', 90, 20), altitudeFt: 9000 }).ident,
    ).toBe('FQF');
    const overhead = readNav(W, 116.3, 0, {
      position: onRadial('FQF', 90, 0.01),
      altitudeFt: 9000,
    });
    expect(overhead.indication!.flag).toBe(true); // cone of confusion
    expect(overhead.ident).toBe('FQF');
    expect(
      readNav(W, 116.3, 0, { position: onRadial('FQF', 90, 60), altitudeFt: 9000 }).ident,
    ).toBeNull();
  });

  it('a localizer is heard to 25 NM (or its expanded service volume)', () => {
    expect(
      readNav(W, 109.3, 263, { position: onLocalizer('I-FTG', 22), altitudeFt: 9000 }).ident,
    ).toBe('I-FTG');
    expect(
      readNav(W, 109.3, 263, { position: onLocalizer('I-FTG', 30), altitudeFt: 9000 }).ident,
    ).toBeNull();
    const esv = buildWorld(nav, { magVarEastDeg: 8, expandedServiceVolumeNm: { 'I-FTG': 32 } });
    const r = readNav(esv, 109.3, 263, { position: onLocalizer('I-FTG', 30), altitudeFt: 9000 });
    expect(r.ident).toBe('I-FTG');
    expect(r.indication!.flag).toBe(false); // usable on course out to the ESV
  });
});
