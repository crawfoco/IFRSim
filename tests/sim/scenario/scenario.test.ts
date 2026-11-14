import { describe, expect, it } from 'vitest';
import kcfo from '../../../src/procedures/kcfo-ils26.json';
import { parseProcedure } from '../../../src/procedures/schema';
import {
  activeMinimums,
  briefing,
  buildScenario,
  type ScenarioOptions,
} from '../../../src/sim/scenario/scenario';
import { nav } from '../helpers';
import { Flight } from '../scripted';

const p = parseProcedure(kcfo);
const opts = (o: Partial<ScenarioOptions> = {}): ScenarioOptions => ({
  startId: 'vectors-final',
  ceiling: 'above',
  gsOutOfService: false,
  ...o,
});

describe('building a scenario', () => {
  it('places the aircraft at the start and sets up the world', () => {
    const sc = buildScenario(p, nav, opts({ gsOutOfService: true }));
    expect(sc.initial.aircraft.altitudeFt).toBe(8000);
    expect(sc.initial.radios.nav1.activeMHz).toBe(116.3);
    expect(sc.world.gsOutOfService).toBe(true);
    expect(sc.world.glidePaths['I-FTG']).toBeDefined();
    expect(sc.missedHold.fix).toBe('SKIPI');
    expect(() => buildScenario(p, nav, opts({ startId: 'nope' }))).toThrow(/no start "nope"/);
  });

  it('minimums: DA with the glideslope, MDA without; category from speed', () => {
    expect(activeMinimums(p, false, 100)).toMatchObject({ kind: 'DA', altFt: 5689, category: 'B' });
    expect(activeMinimums(p, true, 90)).toMatchObject({ kind: 'MDA', altFt: 5900, category: 'A' });
  });

  it('weather is clearly above or below minimums', () => {
    const above = buildScenario(p, nav, opts()).weather;
    const below = buildScenario(p, nav, opts({ ceiling: 'below' })).weather;
    const hat = 5689 - 5489; // DA − TDZE, ~200 ft
    expect(above.ceilingFtAgl).toBeGreaterThanOrEqual(hat + 200);
    expect(above.visibilitySm).toBeGreaterThanOrEqual(0.5);
    expect(below.ceilingFtAgl).toBeLessThan(hat);
    expect(below.visibilitySm).toBeLessThan(0.5);
  });

  it('briefing carries clearance, weather, GS status, minimums and missed', () => {
    const b = briefing(buildScenario(p, nav, opts({ gsOutOfService: true })));
    expect(b.clearance).toMatch(/heading 293/);
    expect(b.weather).toMatch(/^Ceiling \d[\d,]* ft overcast, visibility/);
    expect(b.glideslope).toMatch(/OUT OF SERVICE/);
    expect(b.minimums).toMatch(/S-LOC 26, category B at 100 KIAS: MDA 5,900 ft/);
    expect(b.missedApproach).toMatch(/^Climb to 6100/);
    expect(b.notes).toContain('DME required.');
  });
});

/** Vectors to final, ILS (or LOC with VS descents when the glideslope is out). */
function flyFinal(f: Flight) {
  f.send(
    { type: 'button', button: 'AP' },
    { type: 'button', button: 'HDG' },
    { type: 'standby', radio: 1, mhz: 109.3 },
    { type: 'swap', radio: 1 },
    { type: 'course', radio: 1, deg: 263 },
    { type: 'headingBug', deg: 293 },
    { type: 'altPreselect', ft: 8000 },
  );
  f.until(() => false, 1);
  f.send({ type: 'button', button: 'APR' });
  expect(f.until(() => f.r.state.ap.lateral === 'APR', 600)).toBe(true);
  if (f.sc.options.gsOutOfService) {
    // Down to 7200 until SKIPI, then to the MDA.
    f.send({ type: 'altPreselect', ft: 7200 }, { type: 'button', button: 'VS' });
    f.until(() => false, 0.1);
    f.send({ type: 'vsTarget', fpm: -500 });
    expect(f.until(() => f.distTo('SKIPI') < 0.3, 600)).toBe(true);
    f.send({ type: 'altPreselect', ft: 5900 }, { type: 'button', button: 'VS' });
    f.until(() => false, 0.1);
    f.send({ type: 'vsTarget', fpm: -800 });
  }
}

describe('scenario end conditions (KCFO)', () => {
  it('ILS, ceiling above: runway in sight at DA ends the scenario', () => {
    const f = new Flight(buildScenario(p, nav, opts()));
    flyFinal(f);
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
    expect(f.progress.outcome).toBe('runwayInSight');
    expect(f.r.state.aircraft.altitudeFt).toBeGreaterThan(5689 - 10);
    expect(f.progress.callout).toMatch(/DA 5,689\): runway in sight/);
  });

  it('LOC only, ceiling above: runway in sight at the MDA', () => {
    const f = new Flight(buildScenario(p, nav, opts({ gsOutOfService: true })));
    flyFinal(f);
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
    expect(f.progress.callout).toMatch(/MDA 5,900\): runway in sight/);
  });

  it('LOC only, ceiling below: level at the MDA, go missed at the MAP', () => {
    const f = new Flight(buildScenario(p, nav, opts({ gsOutOfService: true, ceiling: 'below' })));
    flyFinal(f);
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'minimums'), 900)).toBe(true);
    expect(f.progress.phase).toBe('approach');
    expect(f.progress.callout).toMatch(/Level off; the MAP is I-FTG 1\.7/);
    expect(f.until(() => f.progress.phase === 'missed', 300)).toBe(true);
    expect(f.progress.events.map((e) => e.kind)).toEqual(['minimums', 'mapPassed', 'goMissed']);
    expect(f.distTo('I-FTG 1.7')).toBeLessThan(0.2);
  });

  it('climbing away on final before DA starts the missed approach early', () => {
    const f = new Flight(buildScenario(p, nav, opts({ ceiling: 'below' })));
    flyFinal(f);
    expect(f.until(() => f.alt < 6000, 900)).toBe(true);
    f.send({ type: 'button', button: 'VS' }, { type: 'altPreselect', ft: 7200 });
    f.until(() => false, 0.1);
    f.send({ type: 'vsTarget', fpm: 800 });
    expect(f.until(() => f.progress.phase === 'missed', 120)).toBe(true);
    expect(f.progress.callout).toMatch(/^Missed approach started/);
  });

  it('ILS, ceiling below: missed at DA, then hold entry and one circuit ends it', () => {
    const f = new Flight(buildScenario(p, nav, opts({ ceiling: 'below' })));
    flyFinal(f);
    expect(f.until(() => f.progress.phase === 'missed', 900)).toBe(true);
    expect(f.progress.callout).toMatch(/no runway in sight\. Go missed/);

    // Climb to 6100, then a climbing left turn to heading 080, to 7200.
    f.send({ type: 'button', button: 'VS' }, { type: 'altPreselect', ft: 7200 });
    f.until(() => false, 0.1);
    f.send(
      { type: 'vsTarget', fpm: 800 },
      { type: 'button', button: 'HDG' },
      { type: 'headingBug', deg: 263 },
    );
    expect(f.until(() => f.r.state.aircraft.altitudeFt >= 6100, 120)).toBe(true);
    // Join FQF R-045 outbound to SKIPI.
    f.send(
      { type: 'standby', radio: 1, mhz: 116.3 },
      { type: 'swap', radio: 1 },
      { type: 'course', radio: 1, deg: 45 },
    );
    f.turn(170, 80);
    f.send({ type: 'button', button: 'NAV' });
    expect(f.until(() => f.r.state.ap.lateral === 'NAV', 600)).toBe(true);
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'holdFixCrossed'), 900)).toBe(
      true,
    );
    expect(f.progress.inboundCrossings).toBe(0); // arrived on 045, not inbound

    // Hold-in-lieu at SKIPI: inbound 263, LEFT turns, so the outbound leg (083) is south
    // of the localizer. Entry: turn right onto the holding side, then outbound.
    f.send(
      { type: 'button', button: 'HDG' },
      { type: 'standby', radio: 1, mhz: 109.3 },
      { type: 'swap', radio: 1 },
      { type: 'course', radio: 1, deg: 263 },
    );
    f.turn(140);
    f.until(() => false, 45);
    const lap = (turnOutbound: number[]) => {
      if (f.r.state.ap.lateral !== 'HDG') f.send({ type: 'button', button: 'HDG' });
      f.turn(...turnOutbound);
      f.until(() => false, 60);
      f.turn(353, 263); // left turn inbound
      f.send({ type: 'button', button: 'NAV' });
      const before = f.progress.inboundCrossings;
      expect(f.until(() => f.progress.inboundCrossings > before, 400)).toBe(true);
    };
    lap([83]);
    expect(f.progress.events.at(-1)!.kind).toBe('established');
    expect(f.progress.phase).toBe('missed');
    lap([173, 83]); // left turn outbound from the fix
    expect(f.progress).toMatchObject({ phase: 'ended', outcome: 'missedComplete' });
  });
});
