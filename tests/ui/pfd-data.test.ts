/** V2: the values the Glass PFD shows, derived from sim state + sensors. */
import { describe, expect, it } from 'vitest';
import { initialState, step } from '../../src/sim/loop';
import { sense } from '../../src/sim/sensors';
import type { Command, SimState } from '../../src/sim/state';
import { buildWorld } from '../../src/sim/world';
import { BARO_IN_HG, pfdData } from '../../src/ui/instruments/glass/pfd-data';
import { nav, onLocalizer } from '../sim/helpers';

const W = buildWorld(nav, { magVarEastDeg: 8 });
const START = {
  position: onLocalizer('I-FTG', 10, 2),
  altitudeFt: 7200,
  headingMagDeg: 263,
  nav1MHz: 116.3, // FQF
  nav2MHz: 109.3, // I-FTG
  obs1Deg: 45,
  obs2Deg: 263,
};
const fresh = () => initialState(START, W);
const run = (s: SimState, ...cmds: Command[]) => step(s, cmds, W);
const data = (s: SimState, mins = { kind: 'DA' as const, altFt: 5689 }) =>
  pfdData(s, sense(s, W), W, mins);

describe('pfdData', () => {
  it('HSI and CRS box follow the CDI source', () => {
    const d1 = data(fresh());
    expect(d1.hsi).toMatchObject({ cdiSource: 'NAV1', courseDeg: 45, glideslope: null });
    expect(d1.boxes.courseDeg).toBe(45);
    const d2 = data(run(fresh(), { type: 'cdi' }));
    expect(d2.hsi).toMatchObject({ cdiSource: 'NAV2', courseDeg: 263 });
    expect(d2.hsi.glideslope).not.toBeNull();
    expect(d2.hsi.deviation.flag).toBe(false);
    expect(d2.boxes.courseDeg).toBe(263);
  });

  it('bearing pointers: off by default; NAV1 VOR gives a bearing, NAV2 LOC gives NO BRG', () => {
    expect(data(fresh())).toMatchObject({ brg1: null, brg2: null });
    let s = run(fresh(), { type: 'bearing', pointer: 1 });
    s = run(s, { type: 'bearing', pointer: 2 }, { type: 'bearing', pointer: 2 });
    const d = data(s);
    expect(d.brg1).toMatchObject({ source: 'NAV1', ident: 'FQF' });
    expect(d.hsi.bearing1Deg).toBeCloseTo(d.brg1!.bearingMagDeg!, 9);
    expect(d.brg2).toMatchObject({ source: 'NAV2', ident: 'I-FTG', bearingMagDeg: null });
    expect(d.hsi.bearing2Deg).toBeNull();
  });

  it('tapes, VSI, boxes and minimums', () => {
    let s = run(
      fresh(),
      { type: 'button', button: 'AP' },
      { type: 'altPreselect', ft: 6000 },
      { type: 'headingBug', deg: 250 },
      { type: 'speed', kt: 90 },
    );
    let d = data(s);
    expect(d.alt).toMatchObject({ selectedAltFt: 6000, minimums: { kind: 'DA', altFt: 5689 } });
    // 100 → 90 kt, one step (0.1 kt) already flown.
    expect(d.speed.trendKt).toBeCloseTo(-9.9, 6);
    expect(d.vsi.selectedVsFpm).toBeNull();
    expect(d.boxes).toMatchObject({ headingBugDeg: 250, baroInHg: BARO_IN_HG });
    expect(BARO_IN_HG).toBe(29.92);
    // Level at 100 kt: display pitch is the nominal angle of attack.
    expect(d.attitude.pitchDeg).toBeCloseTo(2.67, 1);
    s = run(s, { type: 'button', button: 'VS' });
    s = run(s, { type: 'vsTarget', fpm: -700 });
    d = data(s);
    expect(d.vsi.selectedVsFpm).toBe(-700);
    expect(data(s, null as never).alt.minimums).toBeNull();
  });
});
