/** V2: pushing (double-clicking) the HDG knob syncs the heading bug to the current heading. */
import { describe, expect, it } from 'vitest';
import { initialState, step } from '../../src/sim/loop';
import { sense } from '../../src/sim/sensors';
import { buildWorld } from '../../src/sim/world';
import { nav, onRadial } from './helpers';

const W = buildWorld(nav, { magVarEastDeg: 8 });
const fresh = () =>
  initialState(
    { position: onRadial('FQF', 45, 11), altitudeFt: 8000, headingMagDeg: 263.4, nav1MHz: 116.3 },
    W,
  );

describe('syncHeadingBug', () => {
  it('sets the bug to the current magnetic heading, rounded to a degree', () => {
    let s = step(fresh(), [{ type: 'headingBug', deg: 10 }], W);
    expect(s.panel.headingBugDeg).toBe(10);
    s = step(s, [{ type: 'syncHeadingBug' }], W);
    expect(s.panel.headingBugDeg).toBe(Math.round(sense(s, W).headingMagDeg));
    expect(s.panel.headingBugDeg).toBe(263);
  });

  it('does not change the AP modes', () => {
    const s0 = step(
      fresh(),
      [
        { type: 'button', button: 'AP' },
        { type: 'button', button: 'HDG' },
      ],
      W,
    );
    const s1 = step(s0, [{ type: 'syncHeadingBug' }], W);
    expect(s1.ap).toEqual(s0.ap);
  });

  it('a heading just under 360 syncs to 0 (the UI shows 360)', () => {
    const s0 = initialState(
      { position: onRadial('FQF', 45, 11), altitudeFt: 8000, headingMagDeg: 359.8 },
      W,
    );
    expect(step(s0, [{ type: 'syncHeadingBug' }], W).panel.headingBugDeg).toBe(0);
  });
});
