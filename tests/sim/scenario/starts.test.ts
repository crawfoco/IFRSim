/**
 * Start conditions: lead-in starts begin short of their fix on the reciprocal of the start
 * heading, and the direct-SKIPI start calls for (and can be flown with) a direct hold entry.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../../src/procedures';
import { resolveFixDef } from '../../../src/procedures/resolve';
import type { Leg } from '../../../src/procedures/schema';
import { magToTrue, reciprocal, signedAngleDiff } from '../../../src/sim/geo/angles';
import { distanceNm, initialBearingTrueDeg } from '../../../src/sim/geo/geodesy';
import { buildScenario } from '../../../src/sim/scenario/scenario';
import { inboundTrueAtFix } from '../../../src/sim/scoring/geometry';
import { correctEntries } from '../../../src/sim/scoring/rules/reversal';
import { Flight } from '../scripted';

const build = (procId: string, startId: string) =>
  buildScenario(procedureById(procId)!, NAVDATA, {
    startId,
    ceiling: 'above',
    gsOutOfService: false,
  });

describe('lead-in starts', () => {
  const cases: [string, string, string][] = [
    ['kcfo-ils26', 'over-fqf', 'FQF'],
    ['kgxy-ils35', 'over-gll', 'GLL'],
    ['kmtj-ils17', 'over-mtj', 'MTJ'],
    ['klar-vor30', 'flems', 'FLEMS'],
  ];
  for (const [procId, startId, fixName] of cases)
    it(`${procId} ${startId}: 5 NM before ${fixName}, heading toward it`, () => {
      const sc = build(procId, startId);
      const p = sc.procedure;
      const start = sc.start;
      expect(start.leadInNm).toBe(5);
      const fix = resolveFixDef(start.position, { navdata: NAVDATA, procedure: p });
      // The start position names the fix itself.
      expect(distanceNm(fix, sc.fixes[fixName]!)).toBeLessThan(0.01);
      const ac = sc.initial.aircraft.position;
      expect(Math.abs(distanceNm(fix, ac) - 5)).toBeLessThanOrEqual(0.1);
      const mv = sc.world.magVarEastDeg;
      const back = magToTrue(reciprocal(start.headingMag), mv);
      expect(Math.abs(signedAngleDiff(initialBearingTrueDeg(fix, ac), back))).toBeLessThan(0.5);
      // Flying the start heading leads straight to the fix.
      expect(
        Math.abs(
          signedAngleDiff(sc.initial.aircraft.headingTrueDeg, magToTrue(start.headingMag, mv)),
        ),
      ).toBeLessThan(0.01);
    });
});

type HoldLeg = Extract<Leg, { type: 'hold' }>;

describe('KCFO direct-skipi start', () => {
  const sc = build('kcfo-ils26', 'direct-skipi');
  const hold = sc.procedure.transitions
    .find((t) => t.id === sc.start.transition)!
    .legs.find((l): l is HoldLeg => l.type === 'hold')!;

  it('arrives over SKIPI on a heading that calls for a direct entry', () => {
    expect(hold.fix).toBe('SKIPI');
    const fix = sc.fixes.SKIPI!;
    const ac = sc.initial.aircraft.position;
    expect(Math.abs(distanceNm(fix, ac) - 5)).toBeLessThanOrEqual(0.1);
    const arrivalTrue = magToTrue(sc.start.headingMag, sc.world.magVarEastDeg);
    expect(Math.abs(signedAngleDiff(initialBearingTrueDeg(ac, fix), arrivalTrue))).toBeLessThan(
      0.5,
    );
    const inboundTrue = inboundTrueAtFix(hold.course, fix, sc.world.navdata);
    expect(correctEntries(arrivalTrue, inboundTrue, hold.turn)).toEqual(['direct']);
  });

  it('perfect run: direct entry at SKIPI, ILS to DA, scores 100%', () => {
    const f = new Flight(sc);
    f.send({ type: 'button', button: 'AP' }, { type: 'button', button: 'HDG' });
    f.send({ type: 'headingBug', deg: 180 }, { type: 'altPreselect', ft: 8000 });
    f.wait(0.1);
    f.send({ type: 'button', button: 'ALT' });
    // Joining at SKIPI: FQF is not needed. NAV2 → I-FTG for the localizer and DME 7.
    f.tune(2, 109.3, 263);
    f.send({ type: 'dmeSource', radio: 2 }, { type: 'standby', radio: 1, mhz: 109.3 });
    f.crossFix('SKIPI', 1.0, 600);

    // Direct entry: turn left (the holding direction) straight to the outbound heading.
    f.send({ type: 'swap', radio: 1 }, { type: 'course', radio: 1, deg: 263 });
    f.turn(83); // left, the shorter way
    f.descendOrClimb(7200, -500);
    f.wait(60);
    // Left turn back inbound with APR armed: the localizer is captured in the turn.
    f.send({ type: 'button', button: 'APR' });
    f.turn(353); // left, continuing round to the inbound course
    f.send({ type: 'headingBug', deg: 263 });
    expect(f.until(() => f.r.state.ap.lateral === 'APR', 120)).toBe(true);
    expect(f.until(() => f.progress.phase === 'ended', 1200)).toBe(true);

    const a = f.analyze();
    const summary = a.items.map((x) => `${x.status.padEnd(4)} ${x.id}: ${x.measured}`).join('\n');
    expect(
      a.items.filter((x) => x.status === 'fail').map((x) => x.id),
      summary,
    ).toEqual([]);
    expect(a.scorePct).toBe(100);
    expect(a.items.some((x) => x.id === 'ident:FQF')).toBe(false); // joins at SKIPI
    const entry = a.items.find((x) => x.id.startsWith('hold-entry:SKIPI'))!;
    expect(entry.status).toBe('pass');
    expect(entry.measured).toMatch(/^Flew direct; arriving on heading 1[78]\d° calls for direct$/);
    const legs = a.sequencer.legs.map((l) => [a.sequencer.route[l.index]!.label, l.status]);
    expect(legs).toEqual([
      ['Hold at SKIPI', 'flown'],
      ['Final approach from SKIPI', 'active'],
    ]);
  });
});
