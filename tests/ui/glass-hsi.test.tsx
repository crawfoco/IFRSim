import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hsiCardDeg, hsiRelativeDeg } from '../../src/ui/instruments/geometry';
import { GLASS_HSI_DOT_PX, GlassHsi } from '../../src/ui/instruments/glass/GlassHsi';
import { HSI, type GlassHsiProps } from '../../src/ui/instruments/glass/layout';

/** Value of `name` on the element carrying data-testid="id", or null. */
function attr(html: string, id: string, name: string): string | null {
  const tag = html.match(new RegExp(`<[^>]*data-testid="${id}"[^>]*>`))?.[0];
  if (!tag) return null;
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
}
const has = (html: string, id: string) => html.includes(`data-testid="${id}"`);
/** Inner text of the element with data-testid="id". */
const text = (html: string, id: string) =>
  html.match(new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`))?.[1] ?? null;
const rotation = (html: string, id: string) =>
  Number(attr(html, id, 'transform')?.match(/rotate\(([-\d.]+) /)?.[1]);

const base: GlassHsiProps = {
  headingMagDeg: 293,
  headingBugDeg: 300,
  courseDeg: 263,
  cdiSource: 'NAV1',
  deviation: { dots: 0, flag: false, toFrom: 'TO' },
  glideslope: null,
  bearing1Deg: 45,
  bearing2Deg: 200,
};
const render = (over: Partial<GlassHsiProps> = {}) =>
  renderToStaticMarkup(
    <svg>
      <GlassHsi {...base} {...over} />
    </svg>,
  );

describe('GlassHsi', () => {
  it('shows a 3-digit heading readout and turns the rose', () => {
    const html = render();
    expect(text(html, 'pfd-hsi-heading')).toBe('293');
    expect(text(render({ headingMagDeg: 5.4 }), 'pfd-hsi-heading')).toBe('005');
    expect(text(render({ headingMagDeg: 0 }), 'pfd-hsi-heading')).toBe('360');
    expect(rotation(html, 'pfd-hsi-rose')).toBe(hsiCardDeg(293));
    expect(attr(html, 'pfd-hsi-rose', 'transform')).toContain(`${HSI.cx} ${HSI.cy}`);
  });

  it('summarises the HSI in a title', () => {
    expect(render({ headingMagDeg: 263 })).toContain(
      '<title>HSI: heading 263, course 263, VLOC1, needle centred, TO</title>',
    );
  });

  it('rotates the bug, course and bearing pointers relative to heading', () => {
    const html = render();
    expect(rotation(html, 'pfd-hsi-bug')).toBe(hsiRelativeDeg(300, 293));
    expect(rotation(html, 'pfd-hsi-course')).toBe(hsiRelativeDeg(263, 293));
    expect(rotation(html, 'pfd-hsi-course')).toBe(330);
    expect(rotation(html, 'pfd-brg1')).toBe(hsiRelativeDeg(45, 293));
    expect(rotation(html, 'pfd-brg2')).toBe(hsiRelativeDeg(200, 293));
  });

  it('offsets the deviation bar by the dots', () => {
    const x = (dots: number) =>
      Number(attr(render({ deviation: { dots, flag: false, toFrom: null } }), 'pfd-hsi-cdi', 'x'));
    expect(x(1.5) - x(0)).toBeCloseTo(1.5 * GLASS_HSI_DOT_PX, 6);
    expect(x(-2) - x(0)).toBeCloseTo(-2 * GLASS_HSI_DOT_PX, 6);
    expect(x(0) + 2.5).toBe(HSI.cx);
  });

  it('shows the NAV flag and hides the bar when flagged', () => {
    const ok = render();
    expect(has(ok, 'pfd-hsi-cdi')).toBe(true);
    expect(has(ok, 'pfd-hsi-nav-flag')).toBe(false);
    const flagged = render({ deviation: { dots: 0, flag: true, toFrom: null } });
    expect(has(flagged, 'pfd-hsi-cdi')).toBe(false);
    expect(has(flagged, 'pfd-hsi-nav-flag')).toBe(true);
    expect(flagged).toContain('NAV flag');
  });

  it('shows TO or FROM', () => {
    const to = render();
    expect(has(to, 'pfd-hsi-to')).toBe(true);
    expect(has(to, 'pfd-hsi-from')).toBe(false);
    const from = render({ deviation: { dots: 0, flag: false, toFrom: 'FROM' } });
    expect(has(from, 'pfd-hsi-from')).toBe(true);
    expect(has(from, 'pfd-hsi-to')).toBe(false);
    const loc = render({ deviation: { dots: 0, flag: false, toFrom: null } });
    expect(has(loc, 'pfd-hsi-to') || has(loc, 'pfd-hsi-from')).toBe(false);
  });

  it('labels the CDI source', () => {
    expect(text(render(), 'pfd-hsi-source')).toBe('VLOC1');
    expect(text(render({ cdiSource: 'NAV2' }), 'pfd-hsi-source')).toBe('VLOC2');
  });

  it('shows, moves, flags and hides the glideslope', () => {
    expect(has(render(), 'pfd-hsi-gs')).toBe(false);
    const up = render({ glideslope: { dots: 1.5, flag: false } });
    expect(has(up, 'pfd-hsi-gs')).toBe(true);
    expect(has(up, 'pfd-hsi-gs-flag')).toBe(false);
    // + = glide path above: diamond moves up (negative y).
    expect(attr(up, 'pfd-hsi-gs-diamond', 'transform')).toBe(
      `translate(0 ${-1.5 * GLASS_HSI_DOT_PX})`,
    );
    const flagged = render({ glideslope: { dots: 0, flag: true } });
    expect(has(flagged, 'pfd-hsi-gs-flag')).toBe(true);
    expect(has(flagged, 'pfd-hsi-gs-diamond')).toBe(false);
  });

  it('hides bearing pointers that are off', () => {
    const html = render({ bearing1Deg: null, bearing2Deg: null });
    expect(has(html, 'pfd-brg1')).toBe(false);
    expect(has(html, 'pfd-brg2')).toBe(false);
    const one = render({ bearing2Deg: null });
    expect(has(one, 'pfd-brg1')).toBe(true);
    expect(has(one, 'pfd-brg2')).toBe(false);
  });
});
