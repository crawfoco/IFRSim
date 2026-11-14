import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readNav } from '../../src/sim/nav/radios';
import { buildWorld } from '../../src/sim/world';
import { Altimeter } from '../../src/ui/instruments/Altimeter';
import { Asi } from '../../src/ui/instruments/Asi';
import { Cdi, CDI_DOT_PX } from '../../src/ui/instruments/Cdi';
import { DmeReadout, formatDme } from '../../src/ui/instruments/DmeReadout';
import {
  altimeterHandsDeg,
  asiNeedleDeg,
  courseDeviation,
  glideslopeDeviation,
  hsiCardDeg,
  hsiRelativeDeg,
  vsiNeedleDeg,
} from '../../src/ui/instruments/geometry';
import { Hsi, HSI_DOT_PX } from '../../src/ui/instruments/Hsi';
import { Vsi } from '../../src/ui/instruments/Vsi';
import { nav, onLocalizer, onRadial } from '../sim/helpers';

const W = buildWorld(nav, { magVarEastDeg: 8 });
const at = (position: ReturnType<typeof onRadial>, altitudeFt: number) => ({
  position,
  altitudeFt,
});

/** Value of `name` on the element carrying data-testid="id", or null. */
function attr(html: string, id: string, name: string): string | null {
  const tag = html.match(new RegExp(`<[^>]*data-testid="${id}"[^>]*>`))?.[0];
  if (!tag) return null;
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
}
const has = (html: string, id: string) => html.includes(`data-testid="${id}"`);

describe('instrument geometry', () => {
  it('scales VOR and LOC deviation to 2 dots each side', () => {
    // 5° off a VOR radial = 1 dot; 1.25° off a localizer = 1 dot.
    const vor = readNav(W, 116.3, 45, at(onRadial('FQF', 50, 15), 9000));
    expect(courseDeviation(vor).dots).toBeCloseTo(vor.indication!.deviationDeg / 5, 9);
    expect(Math.abs(courseDeviation(vor).dots)).toBeCloseTo(1, 1);
    expect(courseDeviation(vor).toFrom).toBe('FROM');

    const loc = readNav(W, 109.3, 0, at(onLocalizer('I-FTG', 10, 1.25), 9000));
    expect(courseDeviation(loc)).toMatchObject({ flag: false, toFrom: null });
    expect(courseDeviation(loc).dots).toBeCloseTo(1, 1);

    const pegged = readNav(W, 109.3, 0, at(onLocalizer('I-FTG', 10, 8), 9000));
    expect(courseDeviation(pegged).dots).toBe(2);
  });

  it('flags an untuned or out-of-range receiver', () => {
    const none = readNav(W, 108.0, 0, at(onRadial('FQF', 50, 15), 9000));
    expect(courseDeviation(none)).toEqual({ dots: 0, flag: true, toFrom: null });
    expect(glideslopeDeviation(none)).toBeNull();
  });

  it('stows the GS pointer for a VOR, flags it when the GS is out', () => {
    const vor = readNav(W, 116.3, 45, at(onRadial('FQF', 50, 15), 9000));
    expect(glideslopeDeviation(vor)).toBeNull();
    const out = buildWorld(nav, { magVarEastDeg: 8, gsOutOfService: true });
    const loc = readNav(out, 109.3, 0, at(onLocalizer('I-FTG', 6), 7000));
    expect(glideslopeDeviation(loc)).toEqual({ dots: 0, flag: true });
    // Well below the path at 6 NM: pointer pegged up.
    const low = readNav(W, 109.3, 0, at(onLocalizer('I-FTG', 6), 5800));
    expect(glideslopeDeviation(low)).toEqual({ dots: 2, flag: false });
  });

  it('maps the round gauges', () => {
    expect(hsiCardDeg(330)).toBe(30);
    expect(hsiRelativeDeg(263, 293)).toBe(330);
    expect(asiNeedleDeg(40)).toBe(20);
    expect(asiNeedleDeg(100)).toBe(180);
    expect(asiNeedleDeg(300)).toBe(340);
    expect(vsiNeedleDeg(0)).toBe(-90);
    expect(vsiNeedleDeg(1000)).toBe(-5);
    expect(vsiNeedleDeg(-5000)).toBe(-260);
    expect(altimeterHandsDeg(7250)).toEqual({ hundreds: 90, thousands: 261 });
  });
});

describe('rendered instruments', () => {
  it('HSI rotates the card, bug and course and deflects the bar', () => {
    const html = renderToStaticMarkup(
      <Hsi
        headingMagDeg={293}
        headingBugDeg={293}
        courseDeg={263}
        deviation={{ dots: 1.5, flag: false, toFrom: null }}
        glideslope={{ dots: -1, flag: false }}
      />,
    );
    expect(attr(html, 'hsi-card', 'transform')).toBe('rotate(67 100 100)');
    expect(attr(html, 'hsi-bug', 'transform')).toBe('rotate(0 100 100)');
    expect(attr(html, 'hsi-course', 'transform')).toBe('rotate(330 100 100)');
    expect(Number(attr(html, 'hsi-cdi', 'x'))).toBe(100 + 1.5 * HSI_DOT_PX - 3);
    expect(attr(html, 'hsi-gs-pointer', 'transform')).toBe(`translate(0 ${HSI_DOT_PX})`);
    expect(has(html, 'hsi-nav-flag')).toBe(false);
    expect(html).toContain('needle 1.5 dots right');
    expect(html).toContain('glideslope 1.0 dots down');
  });

  it('HSI shows flags, TO/FROM, and stows the GS scale', () => {
    const flagged = renderToStaticMarkup(
      <Hsi
        headingMagDeg={0}
        headingBugDeg={90}
        courseDeg={45}
        deviation={{ dots: 0, flag: true, toFrom: null }}
        glideslope={{ dots: 0, flag: true }}
      />,
    );
    expect(has(flagged, 'hsi-nav-flag')).toBe(true);
    expect(has(flagged, 'hsi-cdi')).toBe(false);
    expect(has(flagged, 'hsi-gs-flag')).toBe(true);

    const vor = renderToStaticMarkup(
      <Hsi
        headingMagDeg={0}
        headingBugDeg={0}
        courseDeg={45}
        deviation={{ dots: 0, flag: false, toFrom: 'FROM' }}
        glideslope={null}
      />,
    );
    expect(has(vor, 'hsi-from')).toBe(true);
    expect(has(vor, 'hsi-to')).toBe(false);
    expect(has(vor, 'hsi-gs')).toBe(false);
  });

  it('CDI turns the OBS card and moves the needle', () => {
    const html = renderToStaticMarkup(
      <Cdi obsDeg={45} deviation={{ dots: -2, flag: false, toFrom: 'TO' }} />,
    );
    expect(attr(html, 'cdi-card', 'transform')).toBe('rotate(315 100 100)');
    expect(Number(attr(html, 'cdi-needle', 'x'))).toBe(100 - 2 * CDI_DOT_PX - 2);
    expect(html).toContain('>TO<');
  });

  it('gauges point their needles', () => {
    expect(attr(renderToStaticMarkup(<Asi iasKt={100} />), 'asi-needle', 'transform')).toBe(
      'rotate(180 100 100)',
    );
    expect(attr(renderToStaticMarkup(<Vsi vsFpm={-500} />), 'vsi-needle', 'transform')).toBe(
      'rotate(-132.5 100 100)',
    );
    const alt = renderToStaticMarkup(<Altimeter altitudeFt={7250} />);
    expect(attr(alt, 'altimeter-hundreds', 'transform')).toBe('rotate(90 100 100)');
    expect(alt).toContain('7,250');
  });

  it('DME shows tenths, or dashes with no reading', () => {
    expect(formatDme(null)).toBe('--.-');
    expect(formatDme(7.04)).toBe('7.0');
    expect(formatDme(123.4)).toBe('123');
    expect(renderToStaticMarkup(<DmeReadout nm={12.35} source={2} />)).toContain('NAV2');
  });
});
