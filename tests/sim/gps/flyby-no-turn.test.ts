/**
 * A fly-by turn the aircraft does not fly (on HDG, carrying straight on): the GPS still ends the
 * turn once the aircraft is past the arc's exit, and guides on the new leg (KLAA WEYYI → OBOZU,
 * 092°M) instead of an arc-relative DTK.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../../src/procedures';
import { distanceNm } from '../../../src/sim/geo/geodesy';
import { buildScenario } from '../../../src/sim/scenario/scenario';
import { Flight } from '../scripted';

describe('fly-by turn not flown', () => {
  it('KLAA: past WEYYI on a heading, the GPS guides on the WEYYI–OBOZU leg', () => {
    const sc = buildScenario(procedureById('klaa-rnav18')!, NAVDATA, {
      startId: 'direct-weyyi',
      ceiling: 'above',
      gsOutOfService: false,
    });
    const f = new Flight(sc);
    f.send(
      { type: 'gpsLoad', transition: 'weyyi' },
      { type: 'gpsActivate' },
      { type: 'cdiSet', source: 'GPS' },
      { type: 'button', button: 'AP' },
    );
    f.wait(0.1);
    // Straight at WEYYI on HDG, then on through it without turning.
    f.send({ type: 'button', button: 'HDG' });
    f.until(() => {
      if (f.r.state.tick % 100 === 0)
        f.send({ type: 'headingBug', deg: Math.round(f.sensors.gps.dtkMagDeg) });
      return distanceNm(f.r.state.aircraft.position, sc.fixes.WEYYI!) < 1;
    }, 900);
    f.wait(120); // about 3 NM on past WEYYI, heading unchanged
    expect(f.r.state.gps.flyBy).toBeNull();
    expect(f.sensors.gps.activeWaypoint).toBe('OBOZU');
    expect(Math.abs(f.sensors.gps.dtkMagDeg - 92)).toBeLessThan(3);
    // NAV now captures the leg (it could not while the GPS was stuck on the arc).
    f.send({ type: 'headingBug', deg: 60 }, { type: 'button', button: 'NAV' });
    expect(f.until(() => f.r.state.ap.lateral === 'NAV', 600)).toBe(true);
    expect(f.until(() => Math.abs(f.sensors.gps.xtkNm) < 0.1, 600)).toBe(true);
  });
});
