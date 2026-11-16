import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AltTape } from '../../src/ui/instruments/glass/AltTape';
import { Attitude, horizonTransform } from '../../src/ui/instruments/glass/Attitude';
import { ATT, TAPE, VSI } from '../../src/ui/instruments/glass/layout';
import { SpeedTape } from '../../src/ui/instruments/glass/SpeedTape';
import {
  formatAlt,
  formatIas,
  formatVs,
  pinY,
  TAPE_HALF_PX,
  tapeY,
  visibleTicks,
  vsiY,
} from '../../src/ui/instruments/glass/tape-geometry';
import { VsiScale } from '../../src/ui/instruments/glass/VsiScale';

/** Value of `name` on the element carrying data-testid="id", or null. */
function attr(html: string, id: string, name: string): string | null {
  const tag = html.match(new RegExp(`<[^>]*data-testid="${id}"[^>]*>`))?.[0];
  if (!tag) return null;
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
}
/** Text content of the element carrying data-testid="id". */
function text(html: string, id: string): string | null {
  return html.match(new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`))?.[1] ?? null;
}
const has = (html: string, id: string) => html.includes(`data-testid="${id}"`);
const translateY = (t: string | null) => Number(t?.match(/translate\(0 (-?[\d.]+)\)/)?.[1]);
/** Numeric labels of the tape's <text class="g-tape-label"> elements. */
const labels = (html: string) =>
  [...html.matchAll(/class="g-tape-label"[^>]*>(-?\d+)</g)].map((m) => Number(m[1]));

describe('tape geometry', () => {
  it('lists only the ticks in the window', () => {
    expect(visibleTicks(100, 10, 25)).toEqual([80, 90, 100, 110, 120]);
    expect(visibleTicks(7213, 20, 50)).toEqual([7180, 7200, 7220, 7240, 7260]);
    expect(visibleTicks(10, 5, 20, 0)).toEqual([0, 5, 10, 15, 20, 25, 30]);
  });

  it('maps values to y around ATT.cy, higher above', () => {
    expect(tapeY(120, 120, 4)).toBe(ATT.cy);
    expect(tapeY(130, 120, 4)).toBe(ATT.cy - 40);
    expect(tapeY(7000, 7100, 0.3)).toBeCloseTo(ATT.cy + 30, 9);
  });

  it('pins off-scale values to the edges', () => {
    expect(pinY(100, 50, 200)).toEqual({ y: 100, pinned: null });
    expect(pinY(10, 50, 200)).toEqual({ y: 50, pinned: 'top' });
    expect(pinY(300, 50, 200)).toEqual({ y: 200, pinned: 'bottom' });
  });

  it('maps VSI linearly and clamps at ±2000', () => {
    expect(vsiY(0)).toBe(ATT.cy);
    expect(vsiY(1000)).toBeCloseTo(ATT.cy - TAPE_HALF_PX / 2, 9);
    expect(vsiY(VSI.maxFpm)).toBeCloseTo(ATT.cy - TAPE_HALF_PX, 9);
    expect(vsiY(5000)).toBe(vsiY(2000));
    expect(vsiY(-5000)).toBeCloseTo(ATT.cy + TAPE_HALF_PX, 9);
  });

  it('formats readouts', () => {
    expect(formatAlt(7213)).toBe('7,210');
    expect(formatAlt(12345)).toBe('12,350');
    expect(formatAlt(950)).toBe('950');
    expect(formatAlt(-44)).toBe('-40');
    expect(formatIas(119.6)).toBe('120');
    expect(formatIas(-3)).toBe('0');
    expect(formatVs(60)).toBeNull();
    expect(formatVs(-740)).toBe('750');
    expect(formatVs(1210)).toBe('1200');
  });
});

describe('Attitude', () => {
  it('moves the horizon with pitch and bank', () => {
    const level = renderToStaticMarkup(<Attitude pitchDeg={0} bankDeg={0} />);
    expect(has(level, 'pfd-attitude')).toBe(true);
    expect(attr(level, 'pfd-horizon', 'transform')).toBe(horizonTransform(0, 0));

    const climb = renderToStaticMarkup(<Attitude pitchDeg={5} bankDeg={0} />);
    expect(attr(climb, 'pfd-horizon', 'transform')).toBe(
      `rotate(0 ${ATT.cx} ${ATT.cy}) translate(0 ${5 * ATT.pitchPx})`,
    );
    const right = renderToStaticMarkup(<Attitude pitchDeg={-2} bankDeg={20} />);
    expect(attr(right, 'pfd-horizon', 'transform')).toBe(
      `rotate(-20 ${ATT.cx} ${ATT.cy}) translate(0 ${-2 * ATT.pitchPx})`,
    );
    expect(attr(right, 'pfd-bank-pointer', 'transform')).toBe(`rotate(-20 ${ATT.cx} ${ATT.cy})`);
  });

  it('draws a ladder labelled to 30° and a sky/ground big enough for 60° bank', () => {
    const html = renderToStaticMarkup(<Attitude pitchDeg={0} bankDeg={0} />);
    const ladder = [...html.matchAll(/class="g-ladder-text"[^>]*>(\d+)</g)].map((m) => m[1]);
    expect(ladder.filter((l) => l === '30')).toHaveLength(4);
    expect(ladder).not.toContain('40');
    // Farthest PFD corner from the centre plus 20° of pitch must stay inside the sky rect.
    const reach = Math.hypot(ATT.cx, 420 - ATT.cy) + 20 * ATT.pitchPx;
    const w = Number(html.match(/class="g-sky"[^>]*width="(\d+)"/)?.[1]);
    expect(w / 2).toBeGreaterThan(reach);
  });
});

describe('SpeedTape', () => {
  it('shows integer knots and only visible ticks', () => {
    const html = renderToStaticMarkup(<SpeedTape iasKt={119.6} trendKt={0} />);
    expect(has(html, 'pfd-speed-tape')).toBe(true);
    expect(text(html, 'pfd-ias')).toBe('120');
    const ls = labels(html);
    expect(ls).toContain(120);
    expect(Math.min(...ls)).toBeGreaterThanOrEqual(80);
    expect(Math.max(...ls)).toBeLessThanOrEqual(160);
  });

  it('hides the trend vector at 0 and draws it up or down otherwise', () => {
    expect(
      has(renderToStaticMarkup(<SpeedTape iasKt={100} trendKt={0} />), 'pfd-speed-trend'),
    ).toBe(false);
    const up = renderToStaticMarkup(<SpeedTape iasKt={100} trendKt={10} />);
    expect(Number(attr(up, 'pfd-speed-trend', 'y2'))).toBe(ATT.cy - 40);
    const down = renderToStaticMarkup(<SpeedTape iasKt={100} trendKt={-100} />);
    expect(Number(attr(down, 'pfd-speed-trend', 'y2'))).toBe(TAPE.bottom);
  });

  it('never labels negative speeds', () => {
    const html = renderToStaticMarkup(<SpeedTape iasKt={0} trendKt={0} />);
    expect(Math.min(...labels(html))).toBe(0);
    expect(text(html, 'pfd-ias')).toBe('0');
  });
});

describe('AltTape', () => {
  const tape = (altitudeFt: number, selectedAltFt: number, mins: number | null = null) =>
    renderToStaticMarkup(
      <AltTape
        altitudeFt={altitudeFt}
        selectedAltFt={selectedAltFt}
        minimums={mins === null ? null : { kind: 'DA', altFt: mins }}
      />,
    );

  it('shows altitude, selected altitude and only visible ticks', () => {
    const html = tape(7213, 7200);
    expect(has(html, 'pfd-alt-tape')).toBe(true);
    expect(text(html, 'pfd-alt')).toBe('7,210');
    expect(text(html, 'pfd-sel-alt')).toBe('7200');
    const ls = labels(html);
    expect(ls).toContain(7200);
    expect(Math.min(...ls)).toBeGreaterThanOrEqual(6800);
    expect(Math.max(...ls)).toBeLessThanOrEqual(7600);
    expect(html).not.toContain('BARO');
  });

  it('places the selected-altitude bug on scale and pins it off scale', () => {
    const on = tape(7000, 7100);
    expect(translateY(attr(on, 'pfd-alt-bug', 'transform'))).toBeCloseTo(ATT.cy - 30, 1);
    expect(attr(on, 'pfd-alt-bug', 'data-pinned')).toBe('no');

    const above = tape(3000, 9000);
    expect(attr(above, 'pfd-alt-bug', 'data-pinned')).toBe('top');
    expect(translateY(attr(above, 'pfd-alt-bug', 'transform'))).toBeLessThan(TAPE.top + 10);

    const below = tape(9000, 3000);
    expect(attr(below, 'pfd-alt-bug', 'data-pinned')).toBe('bottom');
    expect(translateY(attr(below, 'pfd-alt-bug', 'transform'))).toBeGreaterThan(TAPE.bottom - 10);
  });

  it('shows the minimums bug only when set and on scale', () => {
    expect(has(tape(1000, 3000), 'pfd-mins-bug')).toBe(false);
    const near = tape(1000, 3000, 900);
    expect(has(near, 'pfd-mins-bug')).toBe(true);
    expect(translateY(attr(near, 'pfd-mins-bug', 'transform'))).toBeCloseTo(ATT.cy + 30, 1);
    expect(near).toMatch(/class="g-mins-text"[^>]*>DA</);
    expect(has(tape(5000, 3000, 900), 'pfd-mins-bug')).toBe(false);
    const mda = renderToStaticMarkup(
      <AltTape altitudeFt={1000} selectedAltFt={3000} minimums={{ kind: 'MDA', altFt: 1100 }} />,
    );
    expect(mda).toMatch(/>MDA</);
  });
});

describe('VsiScale', () => {
  it('positions the pointer, shows digits from 100 fpm, and the selected bug', () => {
    const level = renderToStaticMarkup(<VsiScale vsFpm={40} selectedVsFpm={null} />);
    expect(has(level, 'pfd-vsi')).toBe(true);
    expect(translateY(attr(level, 'pfd-vsi-pointer', 'transform'))).toBeCloseTo(vsiY(40), 1);
    expect(level).not.toMatch(/pfd-vsi-pointer.*class="g-text-sm"/s);
    expect(has(level, 'pfd-vs-bug')).toBe(false);

    const climb = renderToStaticMarkup(<VsiScale vsFpm={-740} selectedVsFpm={-500} />);
    expect(climb).toMatch(/pfd-vsi-pointer.*>750</s);
    expect(translateY(attr(climb, 'pfd-vs-bug', 'transform'))).toBeCloseTo(vsiY(-500), 1);

    const pegged = renderToStaticMarkup(<VsiScale vsFpm={4000} selectedVsFpm={null} />);
    expect(translateY(attr(pegged, 'pfd-vsi-pointer', 'transform'))).toBeCloseTo(TAPE.top, 1);
  });
});
