/**
 * V2: on the glass panel the autopilot follows the CDI source. A KCFO ILS 26 flown with the
 * localizer on NAV2 and the CDI on VLOC2, then the missed approach on NAV1 (CDI back to VLOC1),
 * scores 100%, like the same flight on NAV1.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../src/procedures';
import { buildScenario, panelOf } from '../../src/sim/scenario/scenario';
import { Flight } from '../sim/scripted';

const kcfo = procedureById('kcfo-ils26')!;

describe('KCFO ILS 26 coupled to NAV2 (glass panel)', () => {
  it('scores 100% with the ILS on VLOC2 and the missed approach on VLOC1', () => {
    const sc = buildScenario(kcfo, NAVDATA, {
      startId: 'vectors-final',
      ceiling: 'below',
      gsOutOfService: false,
      panel: 'glass',
    });
    expect(panelOf(sc.options)).toBe('glass');
    const f = new Flight(sc);

    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.send({ type: 'headingBug', deg: 293 }, { type: 'altPreselect', ft: 8000 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'ALT' });
    f.tune(2, 109.3, 263);
    f.send({ type: 'dmeSource', radio: 2 }, { type: 'cdi' }, { type: 'bearing', pointer: 1 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 600)).toBe(true);
    expect(f.untilMinimums()).toBe(true);
    expect(f.r.state.ap.vertical).toBe('GS');
    // Tracked NAV2's localizer and glideslope down to DA.
    const s = f.sensors;
    expect(Math.abs(s.nav2.indication!.deviationDeg)).toBeLessThan(2.5 / 2);
    expect(Math.abs(s.nav2.gs!.deviationDeg)).toBeLessThan(0.7 / 2);

    // Missed approach: GA, HDG 263, FQF on NAV1 with the CDI back on VLOC1, NAV to R-045.
    f.goAround(7200);
    f.send({ type: 'button', button: 'HDG' }, { type: 'headingBug', deg: 263 });
    expect(f.until(() => f.alt >= 6100, 120)).toBe(true);
    f.tune(1, 116.3, 45);
    f.send({ type: 'cdi' });
    f.turn(170, 80);
    f.send({ type: 'button', button: 'NAV' });
    f.crossFix('SKIPI', 1.0, 900);
    f.turn(83);
    f.wait(60);
    f.turn(173, 263);

    const a = f.analyze();
    const failed = a.items.filter((x) => x.status === 'fail');
    expect(failed.map((x) => `${x.id}: ${x.measured}`)).toEqual([]);
    const texts = a.timeline.map((e) => e.text);
    expect(texts).toContain('CDI VLOC2');
    expect(texts).toContain('CDI VLOC1');
    expect(texts).toContain('BRG1 NAV1');
  });
});
