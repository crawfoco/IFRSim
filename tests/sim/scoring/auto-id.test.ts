/**
 * V2: the glass panel decodes and shows the station ident (auto-ID), which counts as
 * identifying the navaid. On the steam panel the learner still presses ID.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../../src/procedures';
import { buildScenario, type PanelKind } from '../../../src/sim/scenario/scenario';
import { Flight } from '../scripted';

/** Vectors to the KCFO ILS: tune I-FTG on NAV1 *without* pressing ID, fly the approach. */
function fly(panel: PanelKind) {
  const sc = buildScenario(procedureById('kcfo-ils26')!, NAVDATA, {
    startId: 'vectors-final',
    ceiling: 'above',
    gsOutOfService: false,
    panel,
  });
  const f = new Flight(sc);
  f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
  f.send({ type: 'headingBug', deg: 293 });
  f.send({ type: 'standby', radio: 1, mhz: 109.3 }, { type: 'swap', radio: 1 });
  f.send({ type: 'course', radio: 1, deg: 263 }, { type: 'button', button: 'APR' });
  f.until(() => f.progress.phase === 'ended', 900);
  return f.analyze().items.find((x) => x.id === 'ident:I-FTG');
}

describe('auto-ID', () => {
  it('glass: the received ident counts as identified', () => {
    expect(fly('glass')?.status).toBe('pass');
  });

  it('steam: not identified without pressing ID', () => {
    expect(fly('steam')?.status).toBe('fail');
  });
});
