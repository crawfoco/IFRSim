/**
 * assigned-altitude: every start's clearance names the altitude it assigns, and the rule holds
 * the learner to it until on a published segment. Also: the "Hold at <fix>?" choice on load,
 * flown without the hold where the hold-in-lieu is required, is a skipped course reversal.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, PROCEDURES, RNAV_PROCEDURES } from '../../../src/procedures';
import { buildScenario } from '../../../src/sim/scenario/scenario';
import { Flight } from '../scripted';

const ALL = [...PROCEDURES, ...RNAV_PROCEDURES];
const build = (procId: string, startId: string) =>
  buildScenario(
    ALL.find((p) => p.id === procId)!,
    NAVDATA,
    {
      startId,
      ceiling: 'above',
      gsOutOfService: false,
    },
  );

describe('assigned altitude in the start data', () => {
  for (const p of ALL)
    for (const st of p.starts)
      it(`${p.id} ${st.id}: the clearance assigns ${st.assigned.altFt}`, () => {
        expect(Number(/maintain (\d+)/.exec(st.clearance)?.[1])).toBe(st.assigned.altFt);
        expect(st.altitudeFt).toBeGreaterThanOrEqual(st.assigned.altFt);
        if (st.assigned.until) expect(build(p.id, st.id).fixes[st.assigned.until]).toBeDefined();
      });
});

/** KLAA direct WEYYI: load, activate, CDI on the GPS, NAV. */
function weyyi() {
  const f = new Flight(build('klaa-rnav18', 'direct-weyyi'));
  f.send(
    { type: 'gpsLoad', transition: 'weyyi' },
    { type: 'gpsActivate' },
    { type: 'cdiSet', source: 'GPS' },
    { type: 'button', button: 'AP' },
  );
  f.wait(0.1);
  f.send({ type: 'button', button: 'NAV' });
  f.wait(1);
  return f;
}
const item = (f: Flight) => f.analyze().items.find((i) => i.id === 'assigned-altitude')!;

describe('assigned-altitude rule (KLAA direct WEYYI, descend and maintain 7000)', () => {
  it('down to 7000 before WEYYI: pass', () => {
    const f = weyyi();
    f.descendOrClimb(7000, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'OBOZU', 900)).toBe(true);
    expect(item(f).status).toBe('pass');
  });

  it('bad run: never descends, still at 9000 at WEYYI', () => {
    const f = weyyi();
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'OBOZU', 900)).toBe(true);
    expect(item(f).status).toBe('fail');
    expect(item(f).measured).toMatch(/^Still at 9,0\d\d ft at WEYYI .*assigned 7,000 ft/);
  });

  it('bad run: down to the feeder minimum (6000) before WEYYI', () => {
    const f = weyyi();
    f.descendOrClimb(6000, -1000);
    expect(f.until(() => f.sensors.gps.activeWaypoint === 'OBOZU', 900)).toBe(true);
    expect(item(f).status).toBe('fail');
    expect(item(f).measured).toMatch(/below the assigned 7,000 ft, before reaching WEYYI/);
  });
});

describe('"Hold at <fix>?" answered No where the hold-in-lieu is required', () => {
  const cases: [string, string, string, string, number][] = [
    ['kpub-rnav26l', 'direct-heler', 'heler', 'HELER', 9300],
    ['kbff-rnav12', 'direct-ledse', 'ledse', 'LEDSE', 7000],
  ];
  for (const [procId, startId, transition, fix, alt] of cases)
    it(`${procId}: loaded without the hold at ${fix}, the reversal is skipped (fix-order)`, () => {
      const f = new Flight(build(procId, startId));
      f.send(
        { type: 'gpsLoad', transition, hold: false },
        { type: 'gpsActivate' },
        { type: 'cdiSet', source: 'GPS' },
        { type: 'button', button: 'AP' },
      );
      f.wait(0.1);
      f.send({ type: 'button', button: 'NAV' });
      f.wait(1);
      f.descendOrClimb(alt, -1000);
      expect(f.r.state.gps.loaded).toEqual({ transition, hold: false });
      // Past the fix and on down the next leg (no hold in the flight plan).
      expect(f.until(() => f.r.state.gps.leg >= 2, 1200)).toBe(true);
      f.wait(120);
      const a = f.analyze();
      expect(f.r.state.gps.hold).toBeNull();
      const i = a.sequencer.route.findIndex((r) => r.leg.type === 'hold' && r.fix === fix);
      expect(a.sequencer.legs.find((l) => l.index === i)?.status).toBe('skipped');
      expect(a.items.find((x) => x.id === 'fix-order')!.status).toBe('fail');
    });
});
