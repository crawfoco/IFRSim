import { describe, expect, it } from 'vitest';
import { DT, initialState, step } from '../../src/sim/loop';
import { replay, SimRunner } from '../../src/sim/recorder';
import { sense } from '../../src/sim/sensors';
import type { Command } from '../../src/sim/state';
import { buildWorld } from '../../src/sim/world';
import { nav, onLocalizer, onRadial } from './helpers';

const W = buildWorld(nav, { magVarEastDeg: 8 });
const START = {
  position: onRadial('FQF', 90, 12),
  altitudeFt: 8000,
  headingMagDeg: 270,
  nav1MHz: 116.3,
  nav2MHz: 109.3,
};
const fresh = () => initialState(START, W);

describe('step', () => {
  it('runs at 20 Hz', () => {
    expect(DT).toBe(0.05);
    expect(step(fresh(), [], W).tick).toBe(1);
  });

  it('is pure: the input state is not modified', () => {
    const s0 = fresh();
    const copy = structuredClone(s0);
    step(
      s0,
      [
        { type: 'button', button: 'AP' },
        { type: 'headingBug', deg: 400 },
      ],
      W,
    );
    expect(s0).toEqual(copy);
  });
});

describe('commands', () => {
  const apply = (...cmds: Command[]) => step(fresh(), cmds, W);

  it('heading bug wraps; altitude preselect rounds to 100 ft', () => {
    expect(apply({ type: 'headingBug', deg: 365 }).panel.headingBugDeg).toBe(5);
    expect(apply({ type: 'headingBug', deg: -10 }).panel.headingBugDeg).toBe(350);
    expect(apply({ type: 'altPreselect', ft: 7049 }).panel.altPreselectFt).toBe(7000);
    expect(apply({ type: 'altPreselect', ft: -500 }).panel.altPreselectFt).toBe(0);
  });

  it('power selector holds 90–120 KIAS', () => {
    expect(apply({ type: 'speed', kt: 150 }).panel.iasCmdKt).toBe(120);
    expect(apply({ type: 'speed', kt: 80 }).panel.iasCmdKt).toBe(90);
  });

  it('VS wheel works only in VS mode', () => {
    expect(apply({ type: 'vsTarget', fpm: -700 }).ap.vsRefFpm).toBe(0);
    const s = apply(
      { type: 'button', button: 'AP' },
      { type: 'button', button: 'VS' },
      { type: 'vsTarget', fpm: -749 },
    );
    expect(s.ap).toMatchObject({ vertical: 'VS', vsRefFpm: -700 });
  });

  it('standby frequency, flip-flop and course', () => {
    let s = apply({ type: 'standby', radio: 1, mhz: 114.2 });
    expect(s.radios.nav1).toMatchObject({ activeMHz: 116.3, standbyMHz: 114.2 });
    s = step(
      s,
      [
        { type: 'swap', radio: 1 },
        { type: 'course', radio: 1, deg: 136 },
      ],
      W,
    );
    expect(s.radios.nav1).toMatchObject({ activeMHz: 114.2, standbyMHz: 116.3, obsDeg: 136 });
    expect(sense(s, W).nav1.ident).toBe('GLL');
    expect(apply({ type: 'standby', radio: 2, mhz: 99 }).radios.nav2.standbyMHz).toBe(109.3);
  });

  it('DME source selects which radio feeds the readout', () => {
    // NAV1 = FQF (VORTAC, has DME); NAV2 = I-FTG (ILS DME).
    const s1 = fresh();
    const d1 = sense(s1, W).dmeNm!;
    expect(d1).toBeGreaterThan(11.9);
    const s2 = apply({ type: 'dmeSource', radio: 2 });
    expect(sense(s2, W).dmeNm).not.toBeCloseTo(d1, 1);
  });

  it('a frequency with no station reads nothing', () => {
    const s = step(
      fresh(),
      [
        { type: 'standby', radio: 1, mhz: 108.0 },
        { type: 'swap', radio: 1 },
      ],
      W,
    );
    const r = sense(s, W);
    expect(r.nav1).toMatchObject({ station: null, ident: null, indication: null });
    expect(r.dmeNm).toBeNull();
  });

  it('timer starts, stops and resets', () => {
    let s = apply({ type: 'timer', action: 'startStop' });
    for (let i = 0; i < 39; i++) s = step(s, [], W);
    expect(s.timer.elapsedS).toBeCloseTo(2, 9);
    s = step(s, [{ type: 'timer', action: 'startStop' }], W);
    const stopped = s.timer.elapsedS;
    s = step(s, [], W);
    expect(s.timer.elapsedS).toBe(stopped);
    expect(step(s, [{ type: 'timer', action: 'reset' }], W).timer).toEqual({
      running: false,
      elapsedS: 0,
    });
  });

  it('the hands-off aircraft flies wings level', () => {
    let s = fresh();
    for (let i = 0; i < 200; i++) s = step(s, [], W);
    expect(s.aircraft.bankDeg).toBe(0);
    expect(s.aircraft.headingTrueDeg).toBeCloseTo(278, 9);
  });
});

describe('runner and replay', () => {
  function scriptedRunner() {
    const r = new SimRunner(
      initialState(
        { ...START, position: onLocalizer('I-FTG', 14, 5), headingMagDeg: 300, nav1MHz: 109.3 },
        W,
      ),
      W,
    );
    const script: [number, Command][] = [
      [0, { type: 'button', button: 'AP' }],
      [0, { type: 'button', button: 'HDG' }],
      [0, { type: 'headingBug', deg: 300 }],
      [3, { type: 'button', button: 'ALT' }],
      [5, { type: 'button', button: 'APR' }],
      [40, { type: 'speed', kt: 90 }],
      [90, { type: 'timer', action: 'startStop' }],
    ];
    let t = 0;
    for (const [at, cmd] of script) {
      if (at > t) {
        r.runSeconds(at - t);
        t = at;
      }
      r.enqueue(cmd);
    }
    r.runSeconds(200 - t);
    return r;
  }

  it('replaying the input log reproduces the track exactly', () => {
    const r = scriptedRunner();
    const replayed = replay(r.initial, r.log, r.state.tick, W);
    expect(replayed.tick).toBe(r.state.tick);
    expect(
      Math.abs(replayed.aircraft.position.latDeg - r.state.aircraft.position.latDeg),
    ).toBeLessThan(1e-9);
    expect(
      Math.abs(replayed.aircraft.position.lonDeg - r.state.aircraft.position.lonDeg),
    ).toBeLessThan(1e-9);
    expect(replayed).toEqual(r.state);
    expect(r.state.ap.lateral).toBe('APR');
  });

  it('samples the track once per second', () => {
    const r = scriptedRunner();
    expect(r.track).toHaveLength(201);
    expect(r.track[1]!.tick).toBe(20);
  });

  it('advance() turns real time into steps, with pause and time scale', () => {
    const r = new SimRunner(fresh(), W);
    expect(r.advance(0.5)).toBe(10);
    r.timeScale = 4;
    expect(r.advance(0.5)).toBe(40);
    r.paused = true;
    expect(r.advance(1)).toBe(0);
    r.paused = false;
    r.timeScale = 1;
    expect(r.advance(0.025) + r.advance(0.025)).toBe(1);
    // A long stall (backgrounded tab) is capped, not replayed in one burst.
    expect(r.advance(60)).toBe(80);
  });
});
