/** Debrief timeline: each command's text reflects the state just after that command. */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../../src/procedures';
import { buildScenario } from '../../../src/sim/scenario/scenario';
import { analyzeFlight } from '../../../src/sim/scoring/analyze';

const sc = buildScenario(procedureById('kcfo-ils26')!, NAVDATA, {
  startId: 'vectors-final',
  ceiling: 'above',
  gsOutOfService: false,
  panel: 'glass',
});
const texts = (log: Parameters<typeof analyzeFlight>[1]) =>
  analyzeFlight(sc, log, 20)
    .timeline.filter((e) => e.kind === 'radio')
    .map((e) => e.text);

describe('timeline text for commands in the same step', () => {
  it('two BRG presses log both sources', () => {
    expect(
      texts([
        { tick: 5, command: { type: 'bearing', pointer: 1 } },
        { tick: 5, command: { type: 'bearing', pointer: 1 } },
      ]),
    ).toEqual(['BRG1 NAV1', 'BRG1 NAV2']);
  });

  it('a heading sync then a knob turn log the synced value, then nothing for the turn', () => {
    // vectors-final starts on heading 330.
    expect(
      texts([
        { tick: 3, command: { type: 'syncHeadingBug' } },
        { tick: 3, command: { type: 'headingBug', deg: 10 } },
      ]),
    ).toEqual(['HDG bug synced to 330']);
  });

  it('CDI there and back in one step', () => {
    expect(
      texts([
        { tick: 2, command: { type: 'cdi' } },
        { tick: 2, command: { type: 'cdi' } },
      ]),
    ).toEqual(['CDI VLOC2', 'CDI VLOC1']);
  });
});
