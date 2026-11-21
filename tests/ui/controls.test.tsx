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
  parseAltitude,
  parseDegrees,
  parseFrequency,
  SPEED_CHOICES,
  stepFrequency,
  VS_STEP_FPM,
  vsStep,
} from '../../src/ui/panel/controls';
import {
  createWheelGate,
  createWheelStepper,
  keyToSteps,
  knobTitle,
  WHEEL_GESTURE_GAP_MS,
  WHEEL_PX_PER_STEP,
  type WheelLike,
} from '../../src/ui/panel/Knob';
import { CourseKnob } from '../../src/ui/panel/NavControls';
import { NavRadios } from '../../src/ui/panel/NavRadios';
import { altitudeSteps, degreeSteps, frequencySteps } from '../../src/ui/panel/ValueEntry';
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

describe('typed frequencies', () => {
  it('accepts NAV frequencies with or without the dot', () => {
    expect(parseFrequency('113.85')).toBe(113.85);
    expect(parseFrequency(' 109.3 ')).toBe(109.3);
    expect(parseFrequency('109.')).toBe(109);
    expect(parseFrequency('117')).toBe(117);
    expect(parseFrequency('108,00')).toBe(108);
    expect(parseFrequency('11395')).toBe(113.95);
    expect(parseFrequency('1093')).toBe(109.3);
  });

  it('rejects anything off the band or off the 50 kHz spacing', () => {
    for (const t of [
      '',
      '107.95',
      '118.00',
      '113.87',
      '113.851',
      '13.85',
      'abc',
      '1.1385',
      '113.8.5',
    ])
      expect(parseFrequency(t), t).toBeNull();
  });

  it('a typed frequency is one the sim accepts as is', () => {
    const s = run(s0, { type: 'standby', radio: 2, mhz: parseFrequency('117.95')! });
    expect(s.radios.nav2.standbyMHz).toBe(117.95);
  });
});

describe('typed headings and courses', () => {
  it('accepts whole degrees 1–360, with or without °; 0 is north (360)', () => {
    expect(parseDegrees('263')).toBe(263);
    expect(parseDegrees(' 5 ')).toBe(5);
    expect(parseDegrees('005')).toBe(5);
    expect(parseDegrees('360')).toBe(360);
    expect(parseDegrees('0')).toBe(360);
    expect(parseDegrees('090°')).toBe(90);
  });

  it('rejects anything else', () => {
    for (const t of ['', '361', '1000', '-5', '26.5', 'abc', '2 63'])
      expect(parseDegrees(t), t).toBeNull();
  });

  it('typed values go straight to the sim', () => {
    const s = run(
      s0,
      { type: 'headingBug', deg: parseDegrees('263')! },
      { type: 'course', radio: 2, deg: parseDegrees('0')! },
    );
    expect(s.panel.headingBugDeg).toBe(263);
    expect(s.radios.nav2.obsDeg).toBe(0); // shown as 360
  });
});

describe('typed altitudes', () => {
  it('accepts 0–18,000 ft in hundreds, with or without a separator', () => {
    expect(parseAltitude('4500')).toBe(4500);
    expect(parseAltitude(' 4,500 ')).toBe(4500);
    expect(parseAltitude('4 500')).toBe(4500);
    expect(parseAltitude('18000')).toBe(18000);
    expect(parseAltitude('0')).toBe(0);
  });

  it('rejects anything off the hundreds, out of range or not a number', () => {
    for (const t of ['', '4550', '45', '18100', '100000', '-500', '4.5', 'abc', 'FL120'])
      expect(parseAltitude(t), t).toBeNull();
  });

  it('a typed altitude is one the sim accepts as is', () => {
    const s = run(s0, { type: 'altPreselect', ft: parseAltitude('4,500')! });
    expect(s.panel.altPreselectFt).toBe(4500);
  });
});

describe('popover step buttons', () => {
  it('frequency: MHz on the left, kHz on the right, up before down', () => {
    const turns: [string, number][] = [];
    const steps = frequencySteps((part, n) => turns.push([part, n]));
    expect(steps.map((s) => s.id)).toEqual(['mhz-up', 'mhz-down', 'khz-up', 'khz-down']);
    steps.forEach((s) => s.onPress());
    expect(turns).toEqual([
      ['mhz', 1],
      ['mhz', -1],
      ['khz', 1],
      ['khz', -1],
    ]);
  });

  it('heading and course: +10 / +1 / −1 / −10°', () => {
    const turns: number[] = [];
    const steps = degreeSteps('Heading', (n) => turns.push(n));
    expect(steps.map((s) => s.id)).toEqual(['p10', 'p1', 'm1', 'm10']);
    expect(steps.map((s) => s.label)).toEqual(['+10', '+1', '−1', '−10']);
    steps.forEach((s) => s.onPress());
    expect(turns).toEqual([10, 1, -1, -10]);
    expect(steps[0]!.title).toBe('Heading up 10°');
  });

  it('altitude: +1000 / +100 / −100 / −1000 ft', () => {
    const turns: number[] = [];
    const steps = altitudeSteps((ft) => turns.push(ft));
    expect(steps.map((s) => s.id)).toEqual(['p1000', 'p100', 'm100', 'm1000']);
    steps.forEach((s) => s.onPress());
    expect(turns).toEqual([1000, 100, -100, -1000]);
    expect(steps[0]!.title).toBe('Altitude up 1,000 ft');
  });
});

describe('wheel and trackpad', () => {
  const px = (deltaY: number, timeStamp: number, deltaX = 0): WheelLike => ({
    deltaX,
    deltaY,
    deltaMode: 0,
    timeStamp,
  });
  const total = (events: WheelLike[]) => {
    const steps = createWheelStepper();
    return events.reduce((n, e) => n + steps(e), 0);
  };

  it('a mouse notch is one step, each notch after a pause another', () => {
    expect(total([px(-100, 0)])).toBe(1);
    expect(total([px(100, 0), px(100, 400), px(100, 800)])).toBe(-3);
    // Firefox reports mouse wheels in lines.
    const steps = createWheelStepper();
    expect(
      [1, 2, 3].map((t) => steps({ deltaX: 0, deltaY: -3, deltaMode: 1, timeStamp: t })),
    ).toEqual([1, 1, 1]);
  });

  it('a trackpad swipe steps once per WHEEL_PX_PER_STEP, not once per event', () => {
    // 60 events of 5 px, 16 ms apart: 300 px in one gesture.
    const swipe = Array.from({ length: 60 }, (_, i) => px(-5, i * 16));
    const n = total(swipe);
    expect(n).toBe(1 + Math.floor((300 - 5) / WHEEL_PX_PER_STEP));
    expect(n).toBeLessThan(10);
  });

  it('never more than one step per event, even for a big delta mid-gesture', () => {
    expect(total([px(-5, 0), px(-400, 10)])).toBe(2);
  });

  it('a reversal mid-gesture counts afresh the other way', () => {
    const steps = createWheelStepper();
    expect(steps(px(-5, 0))).toBe(1);
    expect(steps(px(-40, 10))).toBe(0);
    expect(steps(px(30, 20))).toBe(0);
    expect(steps(px(30, 30))).toBe(-1);
  });

  it('line deltas count as pixels: a mouse notch is a step, small trackpad lines are not', () => {
    const lines = (deltaY: number, timeStamp: number): WheelLike => ({
      deltaX: 0,
      deltaY,
      deltaMode: 1,
      timeStamp,
    });
    // 30 events of 0.25 line (5 px) in one swipe: 150 px, so 1 + 2 steps, not 30.
    expect(total(Array.from({ length: 30 }, (_, i) => lines(-0.25, i * 16)))).toBe(3);
    // A fast spin of 3-line notches is still one step per notch.
    expect(total([0, 20, 40, 60].map((t) => lines(3, t)))).toBe(-4);
  });

  it('a scroll keeps its owner until it pauses: the panel scrolls on past a knob', () => {
    const gate = createWheelGate<string>();
    expect(gate(null, 0)).toBeNull(); // started over the panel
    expect(gate('hdg', 16)).toBeNull(); // the knob passes under the pointer: still the panel's
    expect(gate('hdg', 32)).toBeNull();
    expect(gate('hdg', 32 + WHEEL_GESTURE_GAP_MS + 1)).toBe('hdg'); // a new gesture on the knob
    expect(gate(null, 48 + WHEEL_GESTURE_GAP_MS)).toBe('hdg'); // drifting off mid-gesture
    expect(gate('crs', 2000)).toBe('crs');
  });

  it('a pause starts a new gesture; horizontal scroll counts (Shift+wheel)', () => {
    expect(total([px(-5, 0), px(-5, WHEEL_GESTURE_GAP_MS + 1)])).toBe(2);
    expect(total([px(0, 0, -100)])).toBe(1);
    expect(total([px(0, 0, 0)])).toBe(0);
  });
});

describe('knobs send the right commands', () => {
  it('heading, altitude and course', () => {
    expect(headingKnob(s0, 1, false)).toEqual({ type: 'headingBug', deg: 331 });
    expect(headingKnob(s0, -3, true)).toEqual({ type: 'headingBug', deg: 300 });
    expect(altitudeKnob(s0, -10, false)).toEqual({ type: 'altPreselect', ft: 7000 });
    expect(altitudeKnob(s0, 1, true)).toEqual({ type: 'altPreselect', ft: 9000 });
    expect(courseKnob(s0, 1, 10, false)).toEqual({ type: 'course', radio: 1, deg: 365 });
    expect(run(s0, courseKnob(s0, 1, 10, false)).radios.nav1.obsDeg).toBe(5);
    expect(courseKnob(s0, 2, -1, true)).toEqual({ type: 'course', radio: 2, deg: -10 });
  });

  it('VS buttons step 500 fpm from the current target, within the sim limits', () => {
    const vs = run(s0, { type: 'button', button: 'AP' }, { type: 'button', button: 'VS' });
    const start = vs.ap.vsRefFpm;
    expect(VS_STEP_FPM).toBe(500);
    expect(vsStep(vs, -VS_STEP_FPM)).toEqual({ type: 'vsTarget', fpm: start - 500 });
    let s = vs;
    for (let i = 0; i < 6; i++) s = run(s, vsStep(s, -VS_STEP_FPM));
    expect(s.ap.vsRefFpm).toBe(-1500); // the sim's floor
    for (let i = 0; i < 6; i++) s = run(s, vsStep(s, VS_STEP_FPM));
    expect(s.ap.vsRefFpm).toBe(1000); // and its ceiling
  });

  it('speed menu: 80, 90 and 100 KIAS; 90 is still category A, 100 is B', () => {
    expect(SPEED_CHOICES).toEqual([80, 90, 100]);
    expect(SPEED_CHOICES.map(approachCategory)).toEqual(['A', 'A', 'B']);
    for (const kt of SPEED_CHOICES) expect(run(s0, { type: 'speed', kt }).panel.iasCmdKt).toBe(kt);
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
    const knobs = ['knob-hdg', 'knob-alt', 'vs-steps'].map((id) => html.indexOf(id));
    expect([...knobs].sort((a, b) => a - b)).toEqual(knobs);
  });

  it('the HDG knob tells the learner a double-click syncs the bug', () => {
    const html = renderToStaticMarkup(<ApPanel state={s0} send={noop} />);
    expect(html).toMatch(
      /title="Double-click \(or Enter\) to set the bug[^"]*"[^>]*data-testid="knob-hdg"/,
    );
  });

  it('knob tooltips say how far a step and a big step go', () => {
    expect(knobTitle(undefined, ['1°', '10°'])).toBe(
      'Drag, scroll or arrow keys: 1°. Shift or Page Up/Down: 10°.',
    );
    expect(knobTitle('Double-click to sync', ['1°', '10°'])).toBe(
      'Double-click to sync. Drag, scroll or arrow keys: 1°. Shift or Page Up/Down: 10°.',
    );
    expect(knobTitle()).toBeUndefined();
    const html = renderToStaticMarkup(<ApPanel state={s0} send={noop} />);
    expect(html).toMatch(/title="[^"]*Shift or Page Up\/Down: 10°\."[^>]*data-testid="knob-hdg"/);
    expect(html).toMatch(
      /title="[^"]*Shift or Page Up\/Down: 1,000 ft\."[^>]*data-testid="knob-alt"/,
    );
  });

  it('the selected heading is a window you can click to type in; on glass it sits under the knob', () => {
    const steam = renderToStaticMarkup(<ApPanel state={s0} send={noop} />);
    expect(steam).toMatch(/<button[^>]*data-testid="ann-hdg-sel-edit"/);
    expect(steam).not.toContain('knob-hdg-sel');
    const glass = renderToStaticMarkup(<ApPanel state={s0} send={noop} annunciator={false} />);
    expect(glass).toMatch(/data-testid="knob-hdg-sel"[^>]*>330</); // bug starts on the heading
  });

  it('the selected altitude is a window you can click to type in; on glass it sits under the knob', () => {
    const steam = renderToStaticMarkup(<ApPanel state={s0} send={noop} />);
    expect(steam).toMatch(/<button[^>]*data-testid="ann-alt-sel-edit"/);
    expect(steam).toMatch(/data-testid="ann-alt-sel"[^>]*>8,000</);
    expect(steam).not.toContain('knob-alt-sel');
    const glass = renderToStaticMarkup(<ApPanel state={s0} send={noop} annunciator={false} />);
    expect(glass).toMatch(/<button[^>]*data-testid="knob-alt-sel-edit"/);
    expect(glass).toMatch(/data-testid="knob-alt-sel"[^>]*>8,000</);
  });

  it('every value window marks its value as clickable (the dotted underline)', () => {
    const html =
      renderToStaticMarkup(<ApPanel state={s0} send={noop} />) +
      renderToStaticMarkup(<CourseKnob radio={1} state={s0} send={noop} />) +
      renderToStaticMarkup(<NavRadios state={s0} send={noop} idents={{ 1: 'FQF', 2: null }} />);
    for (const id of [
      'ann-hdg-sel',
      'ann-alt-sel',
      'knob-crs1-sel',
      'nav1-standby',
      'nav2-standby',
    ])
      expect(html, id).toMatch(
        new RegExp(`class="[^"]*\\bentry-value\\b[^"]*" data-testid="${id}"`),
      );
  });

  it('a course knob has a course window under it', () => {
    const html = renderToStaticMarkup(<CourseKnob radio={1} state={s0} send={noop} />);
    expect(html).toMatch(/<button[^>]*data-testid="knob-crs1-sel-edit"/);
    expect(html).toMatch(/data-testid="knob-crs1-sel"[^>]*>355</);
    expect(html).toContain('>CRS<');
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
