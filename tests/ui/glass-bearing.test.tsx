/** V2 G4: bearing info boxes and the CDI/BRG buttons. */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BearingInfo } from '../../src/sim/nav/bearing';
import { initialState, step } from '../../src/sim/loop';
import type { Command, SimState } from '../../src/sim/state';
import { buildWorld } from '../../src/sim/world';
import { BearingBoxes, bearingLines } from '../../src/ui/instruments/glass/BearingBoxes';
import { DmeWindow, dmeLines } from '../../src/ui/instruments/glass/DmeWindow';
import { GlassControls } from '../../src/ui/panel/GlassControls';
import { nav, onRadial } from '../sim/helpers';

const vor: BearingInfo = {
  source: 'NAV1',
  freqMHz: 116.3,
  ident: 'FQF',
  bearingMagDeg: 225,
  dmeNm: 11.24,
};

describe('bearing info boxes', () => {
  it('VOR: source, ident, DME', () => {
    expect(bearingLines(vor)).toEqual(['NAV1', 'FQF', '11.2 NM']);
  });

  it('no ident received: the frequency; no DME: dashes', () => {
    expect(bearingLines({ ...vor, ident: null, dmeNm: null })).toEqual([
      'NAV1',
      '116.30',
      '---.- NM',
    ]);
  });

  it('localizer: NO BRG', () => {
    const loc = { ...vor, source: 'NAV2' as const, ident: 'I-FTG', bearingMagDeg: null };
    expect(bearingLines(loc)[1]).toBe('I-FTG  NO BRG');
    const html = renderToStaticMarkup(
      <svg>
        <BearingBoxes brg1={null} brg2={loc} />
      </svg>,
    );
    expect(html).not.toContain('pfd-brg1-box');
    expect(html).toMatch(/data-testid="pfd-brg2-box" data-no-brg="true"/);
    expect(html).toContain('BRG2 NAV2');
  });

  it('boxes are drawn only for pointers that are on', () => {
    const html = renderToStaticMarkup(
      <svg>
        <BearingBoxes brg1={vor} brg2={null} />
      </svg>,
    );
    expect(html).toContain('pfd-brg1-box');
    expect(html).not.toContain('pfd-brg2-box');
    expect(html).toMatch(/data-testid="pfd-brg1-station"[^>]*>FQF</);
  });
});

describe('DME window', () => {
  it('source, station and distance', () => {
    const d = { source: 'NAV2' as const, freqMHz: 113.8, ident: 'MTJ', dmeNm: 14.83 };
    expect(dmeLines(d)).toEqual({ station: 'MTJ', distance: '14.8 NM' });
    const html = renderToStaticMarkup(
      <svg>
        <DmeWindow dme={d} />
      </svg>,
    );
    expect(html).toMatch(/data-testid="pfd-dme-source"[^>]*>NAV2</);
    expect(html).toMatch(/data-testid="pfd-dme-nm"[^>]*>14.8 NM</);
    expect(html).not.toContain('data-no-dme');
  });

  it('no DME: frequency and dashes', () => {
    const d = { source: 'NAV1' as const, freqMHz: 108, ident: null, dmeNm: null };
    expect(dmeLines(d)).toEqual({ station: '108.00', distance: '---.- NM' });
    const html = renderToStaticMarkup(
      <svg>
        <DmeWindow dme={d} />
      </svg>,
    );
    expect(html).toContain('data-no-dme="true"');
  });
});

describe('GlassControls', () => {
  const W = buildWorld(nav, { magVarEastDeg: 8 });
  const s0 = initialState(
    { position: onRadial('FQF', 45, 11), altitudeFt: 8000, headingMagDeg: 263 },
    W,
  );
  const run = (s: SimState, ...c: Command[]) => step(s, c, W);
  const render = (s: SimState) => renderToStaticMarkup(<GlassControls state={s} send={() => {}} />);

  it('shows the current sources', () => {
    expect(render(s0)).toMatch(/btn-cdi.*VLOC1.*btn-brg1.*OFF.*btn-brg2.*OFF/s);
    const s = run(s0, { type: 'cdi' }, { type: 'bearing', pointer: 1 });
    const t = run(s, { type: 'bearing', pointer: 2 }, { type: 'bearing', pointer: 2 });
    expect(render(t)).toMatch(/btn-cdi.*VLOC2.*btn-brg1.*NAV1.*btn-brg2.*NAV2/s);
  });
});
