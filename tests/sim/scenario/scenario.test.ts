import { describe, expect, it } from 'vitest';
import kcfo from '../../../src/procedures/kcfo-ils26.json';
import { parseProcedure } from '../../../src/procedures/schema';
import {
  activeMinimums,
  briefing,
  buildScenario,
  pickCeiling,
  rerollWeather,
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

  it('weather is clearly above or below minimums, with tops below the start altitude', () => {
    const sAbove = buildScenario(p, nav, opts());
    const above = sAbove.weather;
    const below = buildScenario(p, nav, opts({ ceiling: 'below' })).weather;
    const hat = 5689 - 5489; // DA − TDZE, ~200 ft
    expect(above.ceilingFtAgl).toBeGreaterThanOrEqual(hat + 200);
    expect(above.visibilitySm).toBeGreaterThanOrEqual(0.5);
    expect(below.ceilingFtAgl).toBeLessThan(hat);
    expect(below.visibilitySm).toBeLessThan(0.5);
    expect(above.baseFtMsl).toBeCloseTo(sAbove.thresholdElevationFt + above.ceilingFtAgl, 6);
    // Every flight starts in the clear above the overcast.
    expect(above.topsFtMsl).toBeLessThanOrEqual(sAbove.start.altitudeFt - 500);
    expect(above.topsFtMsl).toBeGreaterThan(above.baseFtMsl + 900);
    // The report is the same either way, so the briefing does not give the outcome away.
    expect(below.reported).toBe(above.reported);
  });

  it('briefing carries clearance, weather, GS status, minimums and missed', () => {
    const b = briefing(buildScenario(p, nav, opts({ gsOutOfService: true })));
    expect(b.clearance).toMatch(/heading 293/);
    expect(b.weather).toMatch(
      /^Overcast, ceiling variable \d+–\d+ ft, visibility .+ SM; tops 7,500 ft$/,
    );
    expect(b.glideslope).toMatch(/OUT OF SERVICE/);
    expect(b.minimums).toMatch(/S-LOC 26, category B at 100 KIAS: MDA 5,900 ft/);
    expect(b.missedApproach).toMatch(/^Climb to 6100/);
    expect(b.notes).toContain('DME required.');
    // The CRS hint moved to the debrief (an informational item when CRS was set off the LOC).
    expect(b.hints).toEqual([]);
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
  it('ILS, runway in sight at DA: continuing below it is a landing', () => {
    const f = new Flight(buildScenario(p, nav, opts()));
    flyFinal(f);
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
    expect(f.progress.outcome).toBe('landed');
    expect(f.r.state.aircraft.altitudeFt).toBeLessThan(5689 - 50);
    expect(f.progress.callout).toMatch(/^Runway in sight: landing\. Descended below the DA 5,689/);
    expect(f.progress.events.map((e) => e.kind)).toEqual(['runwayInSight', 'minimums', 'landed']);
  });

  it('LOC only, runway in sight at the MDA: passing the MAP is a landing', () => {
    const f = new Flight(buildScenario(p, nav, opts({ gsOutOfService: true })));
    flyFinal(f);
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
    expect(f.progress.outcome).toBe('landed');
    expect(f.progress.callout).toMatch(
      /Passed the missed approach point \(I-FTG 1\.7\) with the runway/,
    );
  });

  it('LOC only, no runway: passing the MAP without GA fails and ends the flight', () => {
    const f = new Flight(buildScenario(p, nav, opts({ gsOutOfService: true, ceiling: 'below' })));
    flyFinal(f);
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'minimums'), 900)).toBe(true);
    expect(f.progress.callout).toBe('Minimums.');
    expect(f.until(() => f.progress.phase === 'ended', 300)).toBe(true);
    expect(f.progress.outcome).toBe('belowMinimums');
    expect(f.progress.callout).toMatch(
      /^Passed the missed approach point .* without the runway in sight/,
    );
    expect(f.distTo('I-FTG 1.7')).toBeLessThan(0.2);
  });

  it('ILS, no runway: descending below DA without GA fails and ends the flight', () => {
    const f = new Flight(buildScenario(p, nav, opts({ ceiling: 'below' })));
    flyFinal(f);
    expect(f.until(() => f.progress.phase === 'ended', 900)).toBe(true);
    expect(f.progress.outcome).toBe('belowMinimums');
    expect(f.r.state.aircraft.altitudeFt).toBeGreaterThan(5689 - 60);
    expect(f.progress.callout).toMatch(/^Descended below the DA 5,689 without the runway in sight/);
  });

  it('GA before DA starts the missed approach: wings level, climbing', () => {
    const f = new Flight(buildScenario(p, nav, opts({ ceiling: 'below' })));
    flyFinal(f);
    expect(f.until(() => f.alt < 6000, 900)).toBe(true);
    f.send({ type: 'altPreselect', ft: 7200 }, { type: 'button', button: 'GA' });
    expect(f.until(() => f.progress.phase === 'missed', 1)).toBe(true);
    expect(f.progress.callout).toBe('Going missed.'); // the missed approach is read from the plate
    expect(f.r.state.ap).toMatchObject({ engaged: true, lateral: 'ROL', vertical: 'GA' });
    expect(f.until(() => f.r.state.aircraft.vsFpm > 700, 10)).toBe(true);
    // ALT preselect still captures out of the GA climb.
    expect(f.until(() => f.r.state.ap.vertical === 'ALT', 200)).toBe(true);
    f.wait(30);
    expect(Math.abs(f.alt - 7200)).toBeLessThan(20);
  });

  it('ILS, no runway: GA at DA, then hold entry and one circuit ends it', () => {
    const f = new Flight(buildScenario(p, nav, opts({ ceiling: 'below' })));
    flyFinal(f);
    expect(f.until(() => f.progress.callout === 'Minimums.', 900)).toBe(true);
    f.send({ type: 'altPreselect', ft: 7200 }, { type: 'button', button: 'GA' });
    expect(f.until(() => f.progress.phase === 'missed', 1)).toBe(true);
    f.send({ type: 'button', button: 'HDG' }, { type: 'headingBug', deg: 263 });

    // Climb to 6100, then a climbing left turn to heading 080, to 7200.
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

describe('weather at minimums: random or chosen on the briefing', () => {
  it('Restart keeps a chosen outcome and re-rolls a random one', async () => {
    const { procedureById, NAVDATA } = await import('../../../src/procedures');
    const p = procedureById('kcfo-ils26')!;
    const base = { startId: 'vectors-final', gsOutOfService: false } as const;
    const chosen = buildScenario(p, NAVDATA, { ...base, ceiling: 'below', weatherPick: 'below' });
    for (const r of [0, 0.3, 0.7, 0.99])
      expect(rerollWeather(chosen, NAVDATA, r).options.ceiling).toBe('below');
    const random = buildScenario(p, NAVDATA, { ...base, ceiling: 'below' });
    expect(rerollWeather(random, NAVDATA, 0.1).options.ceiling).toBe('above');
    expect(rerollWeather(random, NAVDATA, 0.9).options.ceiling).toBe('below');
  });

  it('pickCeiling: a chosen outcome wins; random uses the roll', () => {
    expect(pickCeiling('above', 0.9)).toBe('above');
    expect(pickCeiling('below', 0.1)).toBe('below');
    expect(pickCeiling('random', 0.1)).toBe('above');
    expect(pickCeiling('random', 0.9)).toBe('below');
    expect(pickCeiling(undefined, 0.9)).toBe('below');
  });
});

describe('briefing hints', () => {
  it('KAKO: the MAP is identified by DME; the timing table is a backup', async () => {
    const { procedureById, NAVDATA } = await import('../../../src/procedures');
    const b = briefing(
      buildScenario(procedureById('kako-vor29')!, NAVDATA, {
        startId: 'direct-ako',
        ceiling: 'above',
        gsOutOfService: false,
      }),
    );
    expect(b.hints).toEqual([expect.stringMatching(/MAP by DME \(AKO 1\.7\)/)]);
  });
});
