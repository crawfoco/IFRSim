/**
 * Debrief note (no points): the HSI course (CRS) was set well away from the localizer course
 * while the autopilot was armed or coupled on the localizer. Replaces the briefing hint.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../../src/procedures';
import { buildScenario } from '../../../src/sim/scenario/scenario';
import { Flight } from '../scripted';

const sc = () =>
  buildScenario(procedureById('kcfo-ils26')!, NAVDATA, {
    startId: 'vectors-final',
    ceiling: 'above',
    gsOutOfService: false,
  });

/** Vectors: AP, HDG 293, LOC on NAV1 with the given CRS, APR, a few minutes. */
function fly(crs: number) {
  const f = new Flight(sc());
  f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
  f.send({ type: 'headingBug', deg: 293 });
  f.tune(1, 109.3, crs);
  f.send({ type: 'button', button: 'APR' });
  f.wait(240);
  return f.analyze().items.find((x) => x.id === 'loc-crs');
}

describe('loc-crs: CRS on the localizer', () => {
  it('no note when CRS is the localizer course', () => {
    expect(fly(263)).toBeUndefined();
  });

  it('a few degrees off is not worth a note', () => {
    expect(fly(258)).toBeUndefined();
  });

  it('CRS on the reciprocal: an informational note with the values', () => {
    const item = fly(83);
    expect(item).toMatchObject({ status: 'info', title: 'HSI course on the localizer' });
    expect(item!.measured).toMatch(
      /^CRS was 083° while the autopilot was on the I-FTG localizer \(course 263°\)/,
    );
    expect(item!.measured).toMatch(/reverse sensing/);
  });

  it('CRS left far off (e.g. 360): a note', () => {
    const item = fly(360);
    expect(item?.status).toBe('info');
    expect(item!.measured).toMatch(/^CRS was 360°/);
  });
});
