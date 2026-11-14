/**
 * Control-law behaviour, flown closed-loop through the real sim step with real navdata.
 * Dots: the HSI shows 2 dots each side, so 1 dot = 1.25° LOC, 5° VOR, 0.35° GS.
 */
import { describe, expect, it } from 'vitest';
import { signedAngleDiff } from '../../../src/sim/geo/angles';
import { distanceNm } from '../../../src/sim/geo/geodesy';
import { lateralCaptureReady } from '../../../src/sim/autopilot/laws';
import { initialState, step, type StartCondition } from '../../../src/sim/loop';
import { vorIndication } from '../../../src/sim/nav/vor';
import { magToTrue } from '../../../src/sim/geo/angles';
import { sense } from '../../../src/sim/sensors';
import type { Command, SimState } from '../../../src/sim/state';
import { buildWorld } from '../../../src/sim/world';
import { nav, navaid, localizer, onLocalizer, onRadial } from '../helpers';

const KCFO = buildWorld(nav, { magVarEastDeg: 8 });
const KGXY = buildWorld(nav, { magVarEastDeg: 8 });

function fly(
  start: StartCondition,
  setup: Command[],
  world = KCFO,
  until: (s: SimState) => boolean,
  each?: (s: SimState) => void,
  maxSeconds = 900,
): SimState {
  let s = step(initialState(start, world), setup, world);
  for (let i = 0; i < maxSeconds * 20 && !until(s); i++) {
    s = step(s, [], world);
    each?.(s);
  }
  return s;
}

const press = (...buttons: ('AP' | 'HDG' | 'NAV' | 'APR' | 'ALT' | 'VS')[]): Command[] =>
  buttons.map((b): Command => ({ type: 'button', button: b }));

describe('heading hold', () => {
  it.each([
    [90, 180],
    [90, 0],
    [263, 293],
    [350, 20],
  ])('turns from %s° to %s° and settles within 1° with < 2° overshoot', (from, to) => {
    let maxBeyond = 0;
    let t = 0;
    const s = fly(
      { position: onRadial('FQF', 90, 15), altitudeFt: 8000, headingMagDeg: from },
      [...press('AP', 'HDG', 'ALT'), { type: 'headingBug', deg: to }],
      KCFO,
      () => t > 60 * 20,
      (st) => {
        t++;
        const err =
          signedAngleDiff(sense(st, KCFO).headingMagDeg, to) * Math.sign(signedAngleDiff(to, from));
        maxBeyond = Math.max(maxBeyond, err);
      },
    );
    expect(Math.abs(signedAngleDiff(sense(s, KCFO).headingMagDeg, to))).toBeLessThan(1);
    expect(maxBeyond).toBeLessThan(2);
  });

  it('a 180° heading change turns right', () => {
    let firstBank = 0;
    fly(
      { position: onRadial('FQF', 90, 15), altitudeFt: 8000, headingMagDeg: 90 },
      [...press('AP', 'HDG'), { type: 'headingBug', deg: 270 }],
      KCFO,
      (s) => s.aircraft.bankDeg !== 0 && (firstBank = s.aircraft.bankDeg) !== 0,
    );
    expect(firstBank).toBeGreaterThan(0);
  });
});

/** Fly an intercept and report overshoot (opposite-side deviation after the first crossing). */
function interceptStats(
  start: StartCondition,
  setup: Command[],
  world: typeof KCFO,
  until: (s: SimState) => boolean,
) {
  let crossed = false;
  let side = 0;
  let overshoot = 0;
  let captured = false;
  const s = fly(start, setup, world, until, (st) => {
    const ind = sense(st, world).nav1.indication;
    if (!ind || ind.flag) return;
    captured ||= st.ap.lateral === 'NAV' || st.ap.lateral === 'APR';
    const sign = Math.sign(ind.offsetDeg);
    if (!side) side = sign;
    if (!crossed && sign === -side) crossed = true;
    if (crossed && sign === -side) overshoot = Math.max(overshoot, Math.abs(ind.offsetDeg));
  });
  return { s, overshoot, captured, final: sense(s, world).nav1.indication! };
}

const within = (nm: number, p: { latDeg: number; lonDeg: number }) => (s: SimState) =>
  distanceNm(s.aircraft.position, p) < nm;

describe('localizer intercept and track (APR)', () => {
  const ftg = localizer('I-FTG');
  it.each([
    ['30° from the left', 6, 293],
    ['45° from the left', 6, 308],
    ['30° from the right', -6, 233],
    ['45° from the right', -6, 218],
  ])('I-FTG %s settles with < 1 dot overshoot', (_n, offset, hdg) => {
    const { overshoot, captured, final } = interceptStats(
      {
        position: onLocalizer('I-FTG', 15, offset),
        altitudeFt: 8000,
        headingMagDeg: hdg,
        nav1MHz: 109.3,
      },
      [...press('AP', 'HDG', 'ALT', 'APR'), { type: 'headingBug', deg: hdg }],
      KCFO,
      within(4, ftg.position),
    );
    expect(captured).toBe(true);
    expect(overshoot).toBeLessThan(1.25);
    expect(Math.abs(final.offsetDeg)).toBeLessThan(0.1);
  });

  it('a late 45° intercept close in (6 NM) still stays inside 1 dot', () => {
    const { overshoot, final } = interceptStats(
      {
        position: onLocalizer('I-FTG', 7, 8),
        altitudeFt: 7500,
        headingMagDeg: 308,
        nav1MHz: 109.3,
      },
      [...press('AP', 'HDG', 'ALT', 'APR'), { type: 'headingBug', deg: 308 }],
      KCFO,
      within(2, ftg.position),
    );
    expect(overshoot).toBeLessThan(1.25);
    expect(Math.abs(final.offsetDeg)).toBeLessThan(0.3);
  });
});

describe('VOR intercept and track (NAV)', () => {
  it.each([
    // [name, station, MHz, start radial, start NM, OBS, intercept heading, stop]
    [
      'inbound GLL 316° (on R-136) from R-145, 45° intercept',
      'GLL',
      114.2,
      145,
      14,
      316,
      1,
      within(3, nav.navaids.GLL!.position),
    ],
    [
      'outbound FQF R-045 from R-030, 30° intercept',
      'FQF',
      116.3,
      30,
      6,
      45,
      75,
      (s: SimState) => s.tick > 20 * 400,
    ],
  ] as const)(
    '%s settles with < 1° overshoot',
    (_n, station, freq, radial, dist, obs, hdg, until) => {
      const { s, overshoot, captured, final } = interceptStats(
        {
          position: onRadial(station, radial, dist),
          altitudeFt: 8000,
          headingMagDeg: hdg,
          nav1MHz: freq,
          obs1Deg: obs,
        },
        [...press('AP', 'HDG', 'ALT', 'NAV'), { type: 'headingBug', deg: hdg }],
        KGXY,
        until,
      );
      expect(captured).toBe(true);
      expect(s.ap.lateral).toBe('NAV');
      expect(overshoot).toBeLessThan(1);
      expect(Math.abs(final.offsetDeg)).toBeLessThan(0.5);
    },
  );
});

describe('altitude capture', () => {
  it.each([
    ['climb', 8000, 9000, 1000],
    ['descent', 9000, 7000, -1000],
    ['slow descent', 9000, 8500, -500],
  ])('%s %s → %s at %s fpm captures within ±20 ft', (_n, from, to, vs) => {
    let extreme = from;
    const s = fly(
      { position: onRadial('FQF', 90, 15), altitudeFt: from, headingMagDeg: 90 },
      [...press('AP', 'VS'), { type: 'vsTarget', fpm: vs }, { type: 'altPreselect', ft: to }],
      KCFO,
      (st) => st.tick > 20 * 240,
      (st) => {
        extreme =
          vs > 0
            ? Math.max(extreme, st.aircraft.altitudeFt)
            : Math.min(extreme, st.aircraft.altitudeFt);
      },
    );
    expect(s.ap.vertical).toBe('ALT');
    expect(Math.abs(s.aircraft.altitudeFt - to)).toBeLessThan(20);
    expect(Math.abs(extreme - to)).toBeLessThan(20);
  });

  it('ALT holds against nothing (no drift)', () => {
    const s = fly(
      { position: onRadial('FQF', 90, 15), altitudeFt: 8000, headingMagDeg: 90 },
      press('AP', 'ALT'),
      KCFO,
      (st) => st.tick > 20 * 120,
    );
    expect(Math.abs(s.aircraft.altitudeFt - 8000)).toBeLessThan(1);
  });
});

describe('glideslope capture and track', () => {
  it('captures from below and tracks within ¼ dot down to 1 NM', () => {
    let worst = 0;
    let capturedAt = -1;
    const gp = KCFO.glidePaths['I-FTG']!;
    const s = fly(
      { position: onLocalizer('I-FTG', 11), altitudeFt: 7500, headingMagDeg: 263, nav1MHz: 109.3 },
      [...press('AP', 'HDG', 'ALT', 'APR'), { type: 'headingBug', deg: 263 }],
      KCFO,
      (st) => distanceNm(st.aircraft.position, gp.gpi) < 1,
      (st) => {
        if (capturedAt < 0 && st.ap.vertical === 'GS') capturedAt = st.tick;
        if (capturedAt >= 0 && st.tick > capturedAt + 20 * 20) {
          worst = Math.max(worst, Math.abs(sense(st, KCFO).nav1.gs!.offsetDeg));
        }
      },
    );
    expect(capturedAt).toBeGreaterThan(0);
    expect(s.ap.vertical).toBe('GS');
    expect(worst).toBeLessThan(0.0875);
  });
});

describe('capture timing (review regression)', () => {
  // GLL course 090 FROM, aircraft on R-085 at 10 NM: course lies right, ~0.87 NM off.
  const gll = navaid('GLL');
  const ind = vorIndication({ position: onRadial('GLL', 85, 10), altitudeFt: 8000 }, gll, 90);
  const course = magToTrue(90, gll.declinationEastDeg);
  const hdg = (relDeg: number) => course + relDeg;

  it('a normal 45° intercept waits for the turn-on point', () => {
    expect(lateralCaptureReady(ind, hdg(45), course)).toBe(false);
  });

  it.each([180, 179, -179, 175])(
    'a heading %s° off the course (barely closing) does not capture early',
    (rel) => {
      expect(lateralCaptureReady(ind, hdg(rel), course)).toBe(false);
    },
  );
});
