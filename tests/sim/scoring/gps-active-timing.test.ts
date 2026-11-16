/**
 * gps-approach-active is judged where the SPEC puts it: the approach loaded with the cleared
 * transition and activated before the IAF (or, on vectors, before intercepting the final).
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../../src/procedures';
import { buildScenario } from '../../../src/sim/scenario/scenario';
import { coursePosition, established } from '../../../src/sim/scoring/geometry';
import { Flight } from '../scripted';

const klaa = procedureById('klaa-rnav18')!;
const fly = (startId: string) =>
  new Flight(buildScenario(klaa, NAVDATA, { startId, ceiling: 'above', gsOutOfService: false }));
const item = (f: Flight) => f.analyze().items.find((i) => i.id === 'gps-approach-active');
const nav = (f: Flight) => {
  f.send({ type: 'cdiSet', source: 'GPS' }, { type: 'button', button: 'AP' });
  f.wait(0.1);
  f.send({ type: 'button', button: 'NAV' });
};

describe('gps-approach-active timing', () => {
  it('direct WEYYI, activated at the start: pass, judged at WEYYI', () => {
    const f = fly('direct-weyyi');
    f.send({ type: 'gpsLoad', transition: 'weyyi' }, { type: 'gpsActivate' });
    nav(f);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'OBOZU', 900)).toBe(true);
    f.wait(60);
    expect(item(f)?.status).toBe('pass');
    expect(item(f)?.measured).toMatch(/WEYYI/);
  });

  it('direct WEYYI, loaded but activated only after WEYYI: fail', () => {
    const f = fly('direct-weyyi');
    f.send({ type: 'gpsLoad', transition: 'weyyi' }, { type: 'gpsActivate' });
    nav(f);
    // Fly the leg to WEYYI, then (as if it had never been activated) re-load it unactivated,
    // and activate it 30 s past WEYYI.
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'OBOZU', 900)).toBe(true);
    f.send({ type: 'gpsLoad', transition: 'weyyi' });
    f.wait(30);
    f.send({ type: 'gpsActivate' });
    f.wait(5);
    const i = item(f)!;
    expect(i.status).toBe('fail');
    expect(i.measured).toMatch(/not activated.*WEYYI/i);
  });

  it('vectors: activated only after established on the final course: fail', () => {
    const f = fly('vectors-final');
    f.send({ type: 'gpsLoad', transition: 'VTF' }, { type: 'button', button: 'AP' });
    f.wait(0.1);
    // An 18° intercept on HDG: established on the final course before the GPS is activated.
    f.send({ type: 'button', button: 'HDG' }, { type: 'headingBug', deg: 200 });
    const onFinal = () =>
      established(
        coursePosition(
          f.sc.final.course,
          { position: f.r.state.aircraft.position, altitudeFt: f.alt },
          NAVDATA,
        ),
        f.r.state.aircraft.headingTrueDeg,
        1.0,
      );
    expect(f.until(onFinal, 900)).toBe(true);
    f.wait(20);
    f.send({ type: 'gpsActivate' }, { type: 'cdiSet', source: 'GPS' });
    f.wait(5);
    const i = item(f)!;
    expect(i.status).toBe('fail');
    expect(i.measured).toMatch(/not activated at the final course/);
  });
});
