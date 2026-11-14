/**
 * KSNY regressions from the M5 review: the missed approach flies straight over SNY
 * ("climb to 6200 then right turn direct SNY") before turning back to it.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../../src/procedures';
import { normalize360 } from '../../../src/sim/geo/angles';
import { destination, type LatLon } from '../../../src/sim/geo/geodesy';
import {
  initialProgress,
  updateProgress,
  type ScenarioProgress,
} from '../../../src/sim/scenario/progress';
import { buildScenario } from '../../../src/sim/scenario/scenario';
import { inboundTrueAtFix } from '../../../src/sim/scoring/geometry';
import { missedApproach } from '../../../src/sim/scoring/rules/sequence';
import type { StepContext } from '../../../src/sim/scoring/rules/types';
import { initialSequencer } from '../../../src/sim/scoring/sequencer';
import type { SimState } from '../../../src/sim/state';

const sc = buildScenario(procedureById('ksny-vor13')!, NAVDATA, {
  startId: 'direct-sny',
  ceiling: 'below',
  gsOutOfService: false,
});
const sny = sc.fixes.SNY!;
const inbound = inboundTrueAtFix(sc.missedHold.course, sny, NAVDATA);

/** States flying straight through `through` on `hdgTrue`, from `fromNm` before to `toNm` past. */
function pass(
  through: LatLon,
  hdgTrue: number,
  startTick: number,
  fromNm = 2,
  toNm = 2,
): SimState[] {
  const out: SimState[] = [];
  const step = 0.0278; // NM per step at 100 kt, 20 Hz
  for (let d = -fromNm, t = startTick; d <= toNm; d += step, t++) {
    const position = destination(
      through,
      d >= 0 ? hdgTrue : normalize360(hdgTrue + 180),
      Math.abs(d),
    );
    out.push({
      ...sc.initial,
      tick: t,
      aircraft: { ...sc.initial.aircraft, position, headingTrueDeg: hdgTrue },
    });
  }
  return out;
}

describe('KSNY missed approach', () => {
  it('the straight-ahead overflight of SNY is not the hold arrival; one full circuit still needed', () => {
    let p: ScenarioProgress = { ...initialProgress(), phase: 'missed', missedTick: 0 };
    const run = (states: SimState[]) => {
      for (const s of states) p = updateProgress(p, s, sc);
    };
    run(pass(sny, inbound, 1, 0.8, 2)); // climbing straight out over SNY on 130°
    expect(p.holdArrivalTick).toBeNull();
    expect(p.inboundCrossings).toBe(0);
    run(pass(sny, normalize360(inbound + 180), 20 * 120)); // back to SNY: arrival (entry)
    expect(p.holdArrivalTick).not.toBeNull();
    run(pass(sny, inbound, 20 * 300)); // first inbound crossing: established
    expect(p.inboundCrossings).toBe(1);
    expect(p.phase).toBe('missed');
    run(pass(sny, inbound, 20 * 540)); // one full circuit later
    expect(p).toMatchObject({ phase: 'ended', outcome: 'missedComplete', inboundCrossings: 2 });
  });

  it('climbing straight out without the right turn back to SNY fails the missed approach', () => {
    const seq = { ...initialSequencer(sc), missedTick: 100 };
    const firstMissed = seq.route.findIndex((r) => r.phase === 'missed');
    const last = { seq: { ...seq, index: firstMissed }, scenario: sc } as unknown as StepContext;
    const items = missedApproach.finish(
      {
        startHeadingTrue: inbound,
        turnedBeforeClimbTick: null,
        turnDeg: 0,
        firstTurn: null,
        firstTurnTick: null,
      },
      last,
    );
    expect(items[0]).toMatchObject({ id: 'missed-approach', status: 'fail' });
    expect(items[0]!.measured).toMatch(/did not make the right turn; did not reach SNY/);
  });
});
