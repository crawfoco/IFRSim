/**
 * T11: headless "vectors to final" at KCFO ILS RWY 26 (I-FTG 109.3, course 263°, TDZE 5489,
 * DA 5689 for the straight-in ILS). A scripted learner gets a vector to intercept, arms APR,
 * and lets the autopilot fly the ILS. At DA the needles must be within half scale.
 */
import { describe, expect, it } from 'vitest';
import { distanceNm } from '../../src/sim/geo/geodesy';
import { LOC_FULL_SCALE_DEG } from '../../src/sim/nav/loc';
import { GS_FULL_SCALE_DEG } from '../../src/sim/nav/gs';
import { initialState } from '../../src/sim/loop';
import { SimRunner } from '../../src/sim/recorder';
import { sense } from '../../src/sim/sensors';
import { buildWorld } from '../../src/sim/world';
import { localizer, nav, onLocalizer } from '../sim/helpers';

const DA_FT = 5689;

describe('KCFO ILS 26, vectors to final', () => {
  it('arrives at DA with LOC and GS within half scale', () => {
    const world = buildWorld(nav, { magVarEastDeg: 8 });
    // 16 NM out, 3 NM south of the localizer, heading 330 at 8000 ft, NAV1 not yet tuned.
    const r = new SimRunner(
      initialState(
        {
          position: onLocalizer('I-FTG', 16, 11),
          altitudeFt: 8000,
          headingMagDeg: 330,
          nav1MHz: 116.3,
          nav2MHz: 116.3,
        },
        world,
      ),
      world,
    );

    // The learner sets up the approach.
    r.enqueue({ type: 'button', button: 'AP' });
    r.enqueue({ type: 'button', button: 'HDG' });
    r.enqueue({ type: 'button', button: 'ALT' });
    r.enqueue({ type: 'standby', radio: 1, mhz: 109.3 });
    r.enqueue({ type: 'swap', radio: 1 });
    r.enqueue({ type: 'course', radio: 1, deg: 263 });
    r.enqueue({ type: 'dmeSource', radio: 1 });
    r.runSeconds(10);
    // ATC: "turn left heading 293, maintain 7200 until established, cleared ILS 26".
    r.enqueue({ type: 'headingBug', deg: 293 });
    r.enqueue({ type: 'altPreselect', ft: 7200 });
    r.enqueue({ type: 'button', button: 'VS' });
    r.enqueue({ type: 'vsTarget', fpm: -500 });
    r.enqueue({ type: 'button', button: 'APR' });

    const thr = nav.runwayEnds.find((e) => e.airport === 'CFO' && e.runway === '26')!.threshold;
    let atDa: ReturnType<typeof sense> | null = null;
    let dmeAtDa = 0;
    for (let i = 0; i < 20 * 900 && !atDa; i++) {
      r.stepOnce();
      if (r.state.aircraft.altitudeFt <= DA_FT) {
        atDa = sense(r.state, world);
        dmeAtDa = atDa.dmeNm ?? NaN;
      }
    }

    expect(atDa, 'reached DA').not.toBeNull();
    expect(r.state.ap).toMatchObject({ lateral: 'APR', vertical: 'GS' });
    const loc = atDa!.nav1.indication!;
    const gs = atDa!.nav1.gs!;
    expect(loc.flag).toBe(false);
    expect(gs.flag).toBe(false);
    expect(Math.abs(loc.deviationDeg)).toBeLessThan(LOC_FULL_SCALE_DEG / 2);
    expect(Math.abs(gs.deviationDeg)).toBeLessThan(GS_FULL_SCALE_DEG / 2);
    // DA on a 3° path at TCH 50 is about 0.5 NM from the threshold.
    const toThr = distanceNm(r.state.aircraft.position, thr);
    expect(toThr).toBeGreaterThan(0.3);
    expect(toThr).toBeLessThan(0.8);
    expect(dmeAtDa).toBeGreaterThan(0);
    expect(localizer('I-FTG').dme).toBeDefined();
  });
});
