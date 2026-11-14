import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../../src/procedures';
import { buildScenario } from '../../../src/sim/scenario/scenario';
import { correctEntries, noPtReversal } from '../../../src/sim/scoring/rules/reversal';
import type { StepContext } from '../../../src/sim/scoring/rules/types';
import { initialSequencer } from '../../../src/sim/scoring/sequencer';

describe('hold entry sectors (70° rule)', () => {
  it('right turns: direct −70…+110, teardrop +110…+180, parallel −180…−70', () => {
    expect(correctEntries(0, 0, 'R')).toEqual(['direct']); // straight in
    expect(correctEntries(150, 0, 'R')).toEqual(['teardrop']);
    expect(correctEntries(210, 0, 'R')).toEqual(['parallel']);
    expect(correctEntries(250, 0, 'R')).toEqual(['parallel']);
    expect(correctEntries(300, 0, 'R')).toEqual(['direct']);
  });

  it('left turns mirror them; within 5° of a boundary either entry is accepted', () => {
    expect(correctEntries(210, 0, 'L')).toEqual(['teardrop']);
    expect(correctEntries(150, 0, 'L')).toEqual(['parallel']);
    expect(correctEntries(70 + 3, 0, 'L').sort()).toEqual(['direct', 'parallel']);
    // KCFO: arriving on R-045 (≈057° true) at SKIPI, inbound 271° true, left turns.
    expect(correctEntries(57, 271, 'L')).toEqual(['parallel']);
  });
});

describe('NoPT reversal note', () => {
  const sc = buildScenario(procedureById('kgxy-ils35')!, NAVDATA, {
    startId: 'wavdi-arc',
    ceiling: 'above',
    gsOutOfService: false,
  });
  const seq = initialSequencer(sc);
  const ctxAt = (tick: number, hdg: number, prevHdg: number) =>
    ({
      state: { ...sc.initial, tick, aircraft: { ...sc.initial.aircraft, headingTrueDeg: hdg } },
      prev: { ...sc.initial, aircraft: { ...sc.initial.aircraft, headingTrueDeg: prevHdg } },
      seq,
      scenario: sc,
    }) as unknown as StepContext;

  it('a full turn before the FAF on a NoPT route is noted, not penalised', () => {
    let s = noPtReversal.init(sc);
    let h = 0;
    for (let t = 1; t <= 120; t++) {
      const next = (h + 3) % 360; // 360° of right turn at 3° per step
      s = noPtReversal.step(s, ctxAt(t, next, h));
      h = next;
    }
    const items = noPtReversal.finish(s, ctxAt(120, h, h));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'nopt-reversal', status: 'info' });
    expect(items[0]!.measured).toMatch(/needs ATC approval/);
  });

  it('a normal arc does not trigger it', () => {
    let s = noPtReversal.init(sc);
    for (let t = 1; t <= 40; t++) s = noPtReversal.step(s, ctxAt(t, 3 * t, 3 * (t - 1)));
    expect(noPtReversal.finish(s, ctxAt(40, 120, 120))).toEqual([]);
  });
});
