/**
 * V2: CDI and bearing sources (glass panel). The autopilot follows the CDI source; switching
 * it while NAV/APR is active drops the lateral mode to ROL; an armed NAV/APR is cancelled
 * and HDG is kept.
 */
import { describe, expect, it } from 'vitest';
import { apNavSource } from '../../src/sim/autopilot/autopilot';
import { AP_OFF, cdiSourceChanged, type ApModes } from '../../src/sim/autopilot/modes';
import { initialState, step } from '../../src/sim/loop';
import {
  BEARING_SOURCES,
  CDI_SOURCES,
  nextBearingSource,
  nextCdiSource,
  radioOf,
} from '../../src/sim/nav/source';
import { replay, SimRunner } from '../../src/sim/recorder';
import { sense } from '../../src/sim/sensors';
import type { Command, SimState } from '../../src/sim/state';
import { buildWorld } from '../../src/sim/world';
import { nav, onLocalizer } from './helpers';

const W = buildWorld(nav, { magVarEastDeg: 8 });
// KCFO: 16 NM out on the I-FTG localizer, slightly left of course, heading 293.
// NAV1 = FQF VOR (116.3), NAV2 = I-FTG (109.3).
const START = {
  position: onLocalizer('I-FTG', 16, 4),
  altitudeFt: 8000,
  headingMagDeg: 293,
  nav1MHz: 116.3,
  nav2MHz: 109.3,
  obs1Deg: 45,
  obs2Deg: 263,
};
const fresh = () => initialState(START, W);
const run = (s: SimState, ...cmds: Command[]) => step(s, cmds, W);

describe('nav source helpers', () => {
  it('CDI toggles NAV1 ↔ NAV2', () => {
    expect(CDI_SOURCES).toEqual(['NAV1', 'NAV2']);
    expect(nextCdiSource('NAV1')).toBe('NAV2');
    expect(nextCdiSource('NAV2')).toBe('NAV1');
  });

  it('bearing pointers cycle OFF → NAV1 → NAV2 → OFF', () => {
    expect(BEARING_SOURCES).toEqual([null, 'NAV1', 'NAV2']);
    expect(nextBearingSource(null)).toBe('NAV1');
    expect(nextBearingSource('NAV1')).toBe('NAV2');
    expect(nextBearingSource('NAV2')).toBeNull();
  });

  it('maps a source to its radio', () => {
    expect(radioOf('NAV1')).toBe(1);
    expect(radioOf('NAV2')).toBe(2);
  });
});

describe('CDI and bearing commands', () => {
  it('start on VLOC1 with both bearing pointers off', () => {
    expect(fresh().panel).toMatchObject({ cdiSource: 'NAV1', brg1: null, brg2: null });
  });

  it('cdi toggles the source; bearing cycles each pointer', () => {
    let s = run(fresh(), { type: 'cdi' });
    expect(s.panel.cdiSource).toBe('NAV2');
    s = run(s, { type: 'cdi' });
    expect(s.panel.cdiSource).toBe('NAV1');
    s = run(s, { type: 'bearing', pointer: 1 }, { type: 'bearing', pointer: 2 });
    s = run(s, { type: 'bearing', pointer: 2 });
    expect(s.panel).toMatchObject({ brg1: 'NAV1', brg2: 'NAV2' });
    s = run(s, { type: 'bearing', pointer: 2 });
    expect(s.panel.brg2).toBeNull();
  });
});

describe('the autopilot follows the CDI source', () => {
  it('reads NAV1 by default and NAV2 when the CDI selects it', () => {
    const s0 = fresh();
    expect(apNavSource(s0, sense(s0, W)).obsDeg).toBe(45);
    const s1 = run(s0, { type: 'cdi' });
    const src = apNavSource(s1, sense(s1, W));
    expect(src.obsDeg).toBe(263);
    expect(src.kind === 'VLOC' && src.reading.station?.kind).toBe('LOC');
  });

  it('APR arms only on the radio the CDI selects', () => {
    // CDI on NAV1 (a VOR): APR is ignored.
    let s = run(fresh(), { type: 'button', button: 'AP' }, { type: 'button', button: 'APR' });
    expect(s.ap.lateralArmed).toBeNull();
    // CDI on NAV2 (the localizer): APR arms, with GS.
    s = run(s, { type: 'cdi' }, { type: 'button', button: 'APR' });
    expect(s.ap).toMatchObject({ lateralArmed: 'APR', gsArmed: true });
  });

  it('captures and tracks the NAV2 localizer with NAV2’s CRS', () => {
    const r = new SimRunner(fresh(), W);
    r.enqueue({ type: 'button', button: 'AP' });
    r.enqueue({ type: 'button', button: 'HDG' });
    r.enqueue({ type: 'button', button: 'ALT' });
    r.enqueue({ type: 'cdi' });
    r.enqueue({ type: 'button', button: 'APR' });
    r.runSeconds(240);
    expect(r.state.ap.lateral).toBe('APR');
    const loc = sense(r.state, W).nav2.indication!;
    expect(loc.flag).toBe(false);
    expect(Math.abs(loc.deviationDeg)).toBeLessThan(0.3);
  });
});

describe('switching the CDI: NAV/APR active → ROL, armed → cancelled', () => {
  const engaged = () =>
    run(fresh(), { type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });

  it('NAV armed on a vector: cancelled, HDG kept', () => {
    let s = run(engaged(), { type: 'button', button: 'NAV' });
    expect(s.ap.lateralArmed).toBe('NAV');
    s = run(s, { type: 'cdi' });
    expect(s.ap).toMatchObject({ lateral: 'HDG', lateralArmed: null });
  });

  it('APR armed with GS armed: both cancelled, HDG kept', () => {
    let s = run(engaged(), { type: 'cdi' }, { type: 'button', button: 'APR' });
    expect(s.ap).toMatchObject({ lateralArmed: 'APR', gsArmed: true });
    s = run(s, { type: 'cdi' });
    expect(s.ap).toMatchObject({ lateral: 'HDG', lateralArmed: null, gsArmed: false });
  });

  it('APR and GS active → ROL and PIT', () => {
    const s = run(engaged(), { type: 'cdi' });
    const active: SimState = {
      ...s,
      ap: { ...s.ap, lateral: 'APR', vertical: 'GS', navKind: 'LOC', vsRefFpm: -500 },
      aircraft: { ...s.aircraft, vsFpm: -480 },
    };
    const after = run(active, { type: 'cdi' });
    expect(after.ap).toMatchObject({ lateral: 'ROL', vertical: 'PIT', gsArmed: false });
    expect(after.ap.vsRefFpm).toBe(-500); // synced to the present VS, rounded to 100
  });

  it('HDG is kept', () => {
    const s = run(engaged(), { type: 'cdi' });
    expect(s.ap.lateral).toBe('HDG');
  });

  it('ALT and ALT armed are kept', () => {
    let s = run(engaged(), { type: 'button', button: 'ALT' }, { type: 'button', button: 'NAV' });
    s = run(s, { type: 'cdi' });
    expect(s.ap).toMatchObject({ lateral: 'HDG', lateralArmed: null, vertical: 'ALT' });
  });
});

describe('cdiSourceChanged edge cases', () => {
  const ctx = {
    navKind: 'VOR' as const,
    hasGs: false,
    altitudeFt: 8000,
    vsFpm: 0,
    altPreselectFt: 8000,
  };
  const on = (m: Partial<ApModes>): ApModes => ({ ...AP_OFF, engaged: true, ...m });

  it('AP off: nothing changes', () => {
    expect(cdiSourceChanged(AP_OFF, ctx)).toBe(AP_OFF);
  });

  it('GA (ROL) with NAV armed: cancelled, still ROL, GA climb kept', () => {
    const m = on({ vertical: 'GA', vsRefFpm: 800, lateralArmed: 'NAV', navKind: 'VOR' });
    expect(cdiSourceChanged(m, ctx)).toMatchObject({
      lateral: 'ROL',
      lateralArmed: null,
      vertical: 'GA',
      vsRefFpm: 800,
    });
  });

  it('NAV active on a VOR: ROL', () => {
    const m = on({ lateral: 'NAV', navKind: 'VOR', vertical: 'ALT' });
    expect(cdiSourceChanged(m, ctx)).toMatchObject({ lateral: 'ROL', vertical: 'ALT' });
  });

  it('NAV active on a LOC: ROL, vertical untouched', () => {
    const m = on({ lateral: 'NAV', navKind: 'LOC', vertical: 'VS', vsRefFpm: -500 });
    expect(cdiSourceChanged(m, { ...ctx, navKind: 'LOC', hasGs: true })).toMatchObject({
      lateral: 'ROL',
      vertical: 'VS',
      vsRefFpm: -500,
      gsArmed: false,
    });
  });
});

describe('GS comes from the CDI radio', () => {
  it('with the localizer on both radios, GS arms only via the CDI radio', () => {
    // NAV1 = I-FTG, NAV2 = FQF: with the CDI on NAV2 (a VOR) APR does not arm.
    const s0 = initialState({ ...START, nav1MHz: 109.3, nav2MHz: 116.3 }, W);
    let s = run(s0, { type: 'button', button: 'AP' }, { type: 'cdi' });
    s = run(s, { type: 'button', button: 'APR' });
    expect(s.ap).toMatchObject({ lateralArmed: null, gsArmed: false });
    // Back on NAV1: APR arms with GS from I-FTG.
    s = run(s, { type: 'cdi' }, { type: 'button', button: 'APR' });
    expect(s.ap).toMatchObject({ lateralArmed: 'APR', gsArmed: true });
  });
});

describe('replays', () => {
  it('a log with CDI and bearing commands replays exactly', () => {
    const r = new SimRunner(fresh(), W);
    r.enqueue({ type: 'button', button: 'AP' });
    r.enqueue({ type: 'cdi' });
    r.enqueue({ type: 'bearing', pointer: 1 });
    r.enqueue({ type: 'button', button: 'APR' });
    r.runSeconds(60);
    const again = replay(fresh(), r.log, r.state.tick, W);
    expect(again).toEqual(r.state);
  });
});
