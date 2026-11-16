/**
 * Arriving at a hold-in-lieu fix already heading inbound (within 45° of the inbound course):
 * a direct entry when the aircraft then turns outbound and flies the hold, a skipped course
 * reversal when it carries on along the final. The sequencer decides on what happens next,
 * not at the crossing.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, RNAV_PROCEDURES } from '../../../src/procedures';
import type { Procedure } from '../../../src/procedures/schema';
import { buildScenario } from '../../../src/sim/scenario/scenario';
import { Flight } from '../scripted';

const base = RNAV_PROCEDURES.find((x) => x.id === 'klaa-rnav18')!;
// Direct OBOZU from due north, heading 180: within 45° of the 182° inbound course.
const proc: Procedure = {
  ...base,
  starts: [
    {
      ...base.starts.find((s) => s.id === 'direct-obozu')!,
      leadInNm: undefined,
      offset: { bearingMag: 360, distanceNm: 8 },
      headingMag: 180,
    },
  ],
};

/** `obozu`: the transition with the hold-in-lieu; `VTF`: straight down the final instead. */
function fly(transition: 'obozu' | 'VTF') {
  const f = new Flight(
    buildScenario(proc, NAVDATA, {
      startId: 'direct-obozu',
      ceiling: 'above',
      gsOutOfService: false,
    }),
  );
  f.send(
    { type: 'gpsLoad', transition },
    { type: 'gpsActivate' },
    { type: 'cdiSet', source: 'GPS' },
    { type: 'button', button: 'AP' },
  );
  f.wait(0.1);
  f.send({ type: 'button', button: 'NAV' });
  f.wait(1);
  // Down from the 9000 ft start to the assigned 7000.
  f.descendOrClimb(7000, -1000);
  return f;
}

const holdLeg = (f: Flight) => {
  const seq = f.analyze().sequencer;
  const i = seq.route.findIndex((r) => r.leg.type === 'hold' && r.phase === 'transition');
  return seq.legs.find((l) => l.index === i)!;
};

describe('straight-in arrival at a hold-in-lieu', () => {
  it('the GPS flies a direct entry: the hold counts as flown', () => {
    const f = fly('obozu');
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'LOLME', 1500)).toBe(true);
    expect(holdLeg(f).status).toBe('flown');
    expect(f.analyze().items.find((x) => x.id === 'fix-order')!.status).toBe('pass');
  });

  it('carrying on along the final: the course reversal is skipped', () => {
    const f = fly('VTF');
    // 8 NM to OBOZU, then on down the final past it.
    f.wait(420);
    expect(holdLeg(f).status).toBe('skipped');
    expect(f.analyze().items.find((x) => x.id === 'fix-order')!.status).toBe('fail');
  });
});

describe('arrival from another direction at a hold-in-lieu', () => {
  // KLAA direct OBOZU from the southeast: crossing OBOZU heading about 320°, well off the 183°
  // inbound course (a teardrop entry when the hold is flown).
  const sc = () =>
    buildScenario(base, NAVDATA, {
      startId: 'direct-obozu',
      ceiling: 'above',
      gsOutOfService: false,
    });

  it('turning straight onto the final instead: skipped there, not at the FAF', () => {
    const f = new Flight(sc());
    f.send(
      { type: 'gpsLoad', transition: 'obozu', hold: false },
      { type: 'gpsActivate' },
      { type: 'cdiSet', source: 'GPS' },
      { type: 'button', button: 'AP' },
    );
    f.wait(0.1);
    f.send({ type: 'button', button: 'NAV' });
    f.descendOrClimb(7000, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'LOLME', 900)).toBe(true);
    // Down to the next segment's minimum right after the turn, as a straight-in pilot would.
    f.wait(60);
    f.descendOrClimb(5500, -800);
    f.send({ type: 'button', button: 'APR' });
    expect(f.untilMinimums()).toBe(true);
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'landed'), 300)).toBe(true);
    const a = f.analyze();
    expect(holdLeg(f).status).toBe('skipped');
    // Judged before the FAF, so the descent after the turn is not held to the hold's minimum.
    expect(holdLeg(f).endTick!).toBeLessThan(a.sequencer.fafTick!);
    expect(a.items.filter((i) => i.status === 'fail').map((i) => i.id)).toEqual(['fix-order']);
  });
});
