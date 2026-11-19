import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { initialState, step } from '../../src/sim/loop';
import type { Command, SimState } from '../../src/sim/state';
import { buildWorld } from '../../src/sim/world';
import { ApPanel } from '../../src/ui/panel/ApPanel';
import {
  altitudeKnob,
  approachCategory,
  courseKnob,
  frequencyKnob,
  headingKnob,
  speedKnob,
  stepFrequency,
  vsKnob,
} from '../../src/ui/panel/controls';
import { keyToSteps } from '../../src/ui/panel/Knob';
import { NavRadios } from '../../src/ui/panel/NavRadios';
import { nav, onRadial } from '../sim/helpers';

const W = buildWorld(nav, { magVarEastDeg: 8 });
const s0: SimState = initialState(
  {
    position: onRadial('FQF', 90, 12),
    altitudeFt: 8000,
    headingMagDeg: 330,
    nav1MHz: 116.3,
    nav2MHz: 109.3,
    obs1Deg: 355,
  },
  W,
);
const run = (s: SimState, ...cmds: Command[]) => step(s, cmds, W);

describe('frequency knobs', () => {
  it('MHz knob wraps 108–117, kHz knob wraps .00–.95 in 50 kHz steps', () => {
    expect(stepFrequency(116.3, 'mhz', 1)).toBe(117.3);
    expect(stepFrequency(117.3, 'mhz', 1)).toBe(108.3);
    expect(stepFrequency(108.3, 'mhz', -1)).toBe(117.3);
    expect(stepFrequency(109.3, 'khz', 1)).toBe(109.35);
    expect(stepFrequency(109.95, 'khz', 1)).toBe(109.0);
    expect(stepFrequency(109.0, 'khz', -1)).toBe(109.95);
    expect(stepFrequency(116.3, 'mhz', -7)).toBe(109.3);
  });

  it('tunes standby, which the sim accepts', () => {
    let s = s0;
    for (let i = 0; i < 7; i++) s = run(s, frequencyKnob(s, 1, 'mhz', -1));
    expect(s.radios.nav1.standbyMHz).toBe(109.3);
    s = run(s, { type: 'swap', radio: 1 });
    expect(s.radios.nav1.activeMHz).toBe(109.3);
  });
});

describe('knobs send the right commands', () => {
  it('heading, altitude, speed and course', () => {
    expect(headingKnob(s0, 1, false)).toEqual({ type: 'headingBug', deg: 331 });
    expect(headingKnob(s0, -3, true)).toEqual({ type: 'headingBug', deg: 300 });
    expect(altitudeKnob(s0, -10, false)).toEqual({ type: 'altPreselect', ft: 7000 });
    expect(altitudeKnob(s0, 1, true)).toEqual({ type: 'altPreselect', ft: 9000 });
    expect(speedKnob(s0, -2, true)).toEqual({ type: 'speed', kt: 90 });
    expect(courseKnob(s0, 1, 10, false)).toEqual({ type: 'course', radio: 1, deg: 365 });
    expect(run(s0, courseKnob(s0, 1, 10, false)).radios.nav1.obsDeg).toBe(5);
    expect(courseKnob(s0, 2, -1, true)).toEqual({ type: 'course', radio: 2, deg: -10 });
  });

  it('VS knob steps 100 fpm from the current target', () => {
    const vs = run(s0, { type: 'button', button: 'AP' }, { type: 'button', button: 'VS' });
    expect(vsKnob(vs, -5)).toEqual({ type: 'vsTarget', fpm: -500 });
    expect(run(vs, vsKnob(vs, -5)).ap.vsRefFpm).toBe(-500);
  });

  it('keyboard: arrows step 1, Page/Shift step big, other keys ignored', () => {
    expect(keyToSteps({ key: 'ArrowUp', shiftKey: false })).toEqual([1, false]);
    expect(keyToSteps({ key: 'ArrowLeft', shiftKey: true })).toEqual([-1, true]);
    expect(keyToSteps({ key: 'PageDown', shiftKey: false })).toEqual([-1, true]);
    expect(keyToSteps({ key: 'a', shiftKey: false })).toBeNull();
  });

  it('category follows the power selector', () => {
    expect(approachCategory(90)).toBe('A');
    expect(approachCategory(91)).toBe('B');
  });
});

describe('panel rendering', () => {
  const noop = () => {};
  it('annunciates active and armed modes', () => {
    let s = run(
      s0,
      { type: 'button', button: 'AP' },
      { type: 'button', button: 'HDG' },
      { type: 'button', button: 'VS' },
      { type: 'altPreselect', ft: 7000 },
    );
    s = run(s, { type: 'vsTarget', fpm: -500 }, { type: 'button', button: 'NAV' });
    const html = renderToStaticMarkup(<ApPanel state={s} send={noop} />);
    expect(html).toMatch(/data-testid="ann-ap"[^>]*>AP</);
    expect(html).toMatch(/data-testid="ann-lateral"[^>]*>HDG</);
    expect(html).toMatch(/data-testid="ann-lateral-armed"[^>]*>VOR</);
    // The vertical mode reads just VS; its target is in the VS window above the VS knob.
    expect(html).toMatch(/data-testid="ann-vertical"[^>]*>VS</);
    expect(html).toMatch(/data-testid="ann-vs-sel"[^>]*>-500</);
    expect(html).toMatch(/data-testid="ann-vertical-armed"[^>]*>ALT</);
    expect(html).toMatch(/data-testid="ann-alt-sel"[^>]*>7,000</);
  });

  it('shows the selected heading (bug) as a number, AP on or off', () => {
    const off = renderToStaticMarkup(
      <ApPanel state={run(s0, { type: 'headingBug', deg: 293 })} send={noop} />,
    );
    expect(off).toMatch(/data-testid="ann-hdg-sel"[^>]*>293°</);
    const on = renderToStaticMarkup(
      <ApPanel
        state={run(s0, { type: 'button', button: 'AP' }, { type: 'headingBug', deg: 5 })}
        send={noop}
      />,
    );
    expect(on).toMatch(/data-testid="ann-hdg-sel"[^>]*>005°</);
    expect(
      renderToStaticMarkup(
        <ApPanel state={run(s0, { type: 'headingBug', deg: 360 })} send={noop} />,
      ),
    ).toMatch(/data-testid="ann-hdg-sel"[^>]*>360°</);
  });

  it('the selected-value windows sit in knob order (HDG, ALT, VS); VS is blank outside VS mode', () => {
    const html = renderToStaticMarkup(<ApPanel state={s0} send={noop} />);
    const order = ['ann-hdg-sel', 'ann-alt-sel', 'ann-vs-sel'].map((id) => html.indexOf(id));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toMatch(/data-testid="ann-vs-sel"[^>]*><\/span>/);
    const knobs = ['knob-hdg', 'knob-alt', 'knob-vs'].map((id) => html.indexOf(id));
    expect([...knobs].sort((a, b) => a - b)).toEqual(knobs);
  });

  it('the HDG knob tells the learner a double-click syncs the bug', () => {
    const html = renderToStaticMarkup(<ApPanel state={s0} send={noop} />);
    expect(html).toMatch(
      /title="Double-click \(or Enter\) to set the bug[^"]*"[^>]*data-testid="knob-hdg"/,
    );
  });

  it('shows active and standby frequencies', () => {
    const html = renderToStaticMarkup(
      <NavRadios state={s0} send={noop} idents={{ 1: 'FQF', 2: null }} />,
    );
    expect(html).toContain('data-testid="nav1-ident"');
    expect(html).toMatch(/data-testid="nav1-active"[^>]*>116.30</);
    expect(html).toMatch(/data-testid="nav2-standby"[^>]*>109.30</);
  });
});

describe('BrowserSim', () => {
  it('several knob turns before the next step all count', async () => {
    const { BrowserSim } = await import('../../src/ui/screens/useSim');
    const { buildScenario } = await import('../../src/sim/scenario/scenario');
    const { PROCEDURES } = await import('../../src/procedures');
    const sim = new BrowserSim(
      buildScenario(PROCEDURES[0]!, nav, {
        startId: 'vectors-final',
        ceiling: 'above',
        gsOutOfService: false,
      }),
    );
    // Radios start on 108.00: seven clicks up land on 115.00 (no wrap past 117).
    for (let i = 0; i < 7; i++) sim.send((s) => frequencyKnob(s, 1, 'mhz', 1));
    for (let i = 0; i < 3; i++) sim.send((s) => headingKnob(s, -1, true));
    expect(sim.view().radios.nav1.standbyMHz).toBe(115);
    expect(sim.view().panel.headingBugDeg).toBe(300);
  });
});
