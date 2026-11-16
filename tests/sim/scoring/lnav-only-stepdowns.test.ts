/**
 * LNAV-only step-downs (KCPR NOPTE, KAPA FEGIB; CIFP altitude code "V") apply to the LNAV line
 * only. Flying a vertical line (LPV, LNAV/VNAV) the glidepath governs inside the FAF, as on an
 * ILS: `segment-minimums` does not judge them.
 */
import { describe, expect, it } from 'vitest';
import { NAVDATA, procedureById } from '../../../src/procedures';
import { buildScenario } from '../../../src/sim/scenario/scenario';
import { segmentMinimum } from '../../../src/sim/scoring/rules/altitude';
import { initialSequencer } from '../../../src/sim/scoring/sequencer';

/** Sequencer on the final, just past the FAF, before any step-down. */
function pastFaf(procId: string, startId: string, waasAvailable: boolean) {
  const sc = buildScenario(procedureById(procId)!, NAVDATA, {
    startId,
    ceiling: 'above',
    gsOutOfService: false,
    waasAvailable,
  });
  const s = initialSequencer(sc);
  const index = s.route.findIndex((r) => r.leg.type === 'final');
  return { sc, seq: { ...s, index, fafTick: 100, passages: [] } };
}

describe('LNAV-only step-downs', () => {
  for (const [procId, fix, ft] of [
    ['kcpr-rnav3', 'NOPTE', 6240],
    ['kapa-rnav28', 'FEGIB', 6940],
  ] as const)
    it(`${procId} ${fix}: judged on LNAV (no WAAS), not on LPV`, () => {
      const lnav = pastFaf(procId, 'vectors-final', false);
      expect(segmentMinimum(lnav.seq, lnav.sc)).toBe(
        lnav.sc.final.stepDowns.find((s) => s.fix === fix)!.minAltFt,
      );
      expect(segmentMinimum(lnav.seq, lnav.sc)).toBe(ft);
      const lpv = pastFaf(procId, 'vectors-final', true);
      expect(segmentMinimum(lpv.seq, lpv.sc)).toBeNull();
    });

  it('KCNY: LP has no glidepath, so its step-downs are judged (FELTA 5980)', () => {
    const lp = pastFaf('kcny-rnav3', 'vectors-final', true);
    expect(segmentMinimum(lp.seq, lp.sc)).toBe(5980);
  });
});
