import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../../src/procedures';
import { pressButton, AP_OFF, GA_CLIMB_FPM } from '../../../src/sim/autopilot/modes';
import { destination } from '../../../src/sim/geo/geodesy';
import { normalize360 } from '../../../src/sim/geo/angles';
import { layerAt, outsideView, runwayInSight } from '../../../src/sim/scenario/outside';
import { buildScenario, type Ceiling } from '../../../src/sim/scenario/scenario';
import type { SimState } from '../../../src/sim/state';
import { Flight } from '../scripted';

const sc = (ceiling: Ceiling) =>
  buildScenario(procedureById('kcfo-ils26')!, NAVDATA, {
    startId: 'vectors-final',
    ceiling,
    gsOutOfService: false,
  });

/** On the extended centreline, `nm` from the threshold, at `aglFt`, heading down the runway. */
function onFinalAt(s: ReturnType<typeof sc>, nm: number, aglFt: number): SimState {
  const back = normalize360(s.runway.trueAlignmentDeg + 180);
  return {
    ...s.initial,
    aircraft: {
      ...s.initial.aircraft,
      position: destination(s.runway.threshold, back, nm),
      altitudeFt: s.thresholdElevationFt + aglFt,
      headingTrueDeg: s.runway.trueAlignmentDeg,
    },
  };
}

describe('outside view', () => {
  it('starts in the clear above the tops, then cloud, then below the base', () => {
    const s = sc('above');
    expect(outsideView(s.initial, s).layer).toBe('clear');
    expect(layerAt(s.weather.topsFtMsl - 10, s)).toBe('cloud');
    expect(layerAt(s.weather.baseFtMsl + 10, s)).toBe('cloud');
    expect(layerAt(s.weather.baseFtMsl - 10, s)).toBe('below');
  });

  it('above minimums: the runway is in sight at DA, ahead and below the horizon', () => {
    const s = sc('above');
    const v = outsideView(onFinalAt(s, 0.6, 200), s);
    expect(v).toMatchObject({ layer: 'below', runwayInSight: true });
    expect(Math.abs(v.runway!.relBearingDeg)).toBeLessThan(1);
    expect(Math.abs(v.runway!.relAlignmentDeg)).toBeLessThan(1);
    expect(v.runway!.depressionDeg).toBeGreaterThan(2);
    // Beyond the visibility it is not yet in sight, even below the base.
    expect(runwayInSight(onFinalAt(s, 5, 200), s)).toBe(false);
  });

  it('below minimums: still in cloud at DA, no runway', () => {
    const s = sc('below');
    const v = outsideView(onFinalAt(s, 0.6, 200), s);
    expect(v).toMatchObject({ layer: 'cloud', runwayInSight: false, runway: null });
  });
});

describe('GA (TOGA)', () => {
  const ctx = {
    navKind: 'LOC' as const,
    hasGs: true,
    altitudeFt: 6000,
    vsFpm: -600,
    altPreselectFt: 7200,
  };

  it('engages the autopilot, levels the wings and climbs, dropping APR and GS', () => {
    const coupled = {
      ...AP_OFF,
      engaged: true,
      lateral: 'APR' as const,
      vertical: 'GS' as const,
      navKind: 'LOC' as const,
    };
    expect(pressButton(coupled, 'GA', ctx)).toMatchObject({
      engaged: true,
      lateral: 'ROL',
      lateralArmed: null,
      vertical: 'GA',
      gsArmed: false,
      vsRefFpm: GA_CLIMB_FPM,
    });
    expect(pressButton(AP_OFF, 'GA', ctx)).toMatchObject({ engaged: true, vertical: 'GA' });
  });

  it('records the first press only', () => {
    const f = new Flight(sc('above'));
    f.wait(1);
    f.send({ type: 'button', button: 'GA' });
    f.wait(1);
    const first = f.r.state.goAroundTick;
    expect(first).toBe(20);
    f.send({ type: 'button', button: 'GA' });
    f.wait(1);
    expect(f.r.state.goAroundTick).toBe(first);
  });

  it('going missed with the runway in sight is allowed, and the debrief says so', () => {
    const f = new Flight(sc('above'));
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.send({ type: 'headingBug', deg: 293 });
    f.tune(1, 109.3, 263);
    f.send({ type: 'button', button: 'APR' });
    expect(f.until(() => f.progress.events.some((e) => e.kind === 'runwayInSight'), 900)).toBe(
      true,
    );
    f.goAround(7200);
    expect(f.progress.phase).toBe('missed');
    const item = f.analyze().items.find((x) => x.id === 'decision')!;
    expect(item.status).toBe('pass');
    expect(item.measured).toMatch(
      /runway in sight \(landing was possible; going missed is always allowed\)$/,
    );
  });
});
