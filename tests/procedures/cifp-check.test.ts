import { describe, expect, it } from 'vitest';
import { NAVDATA, RNAV_PROCEDURES } from '../../src/procedures';
import { checkAgainstCifp } from '../../src/procedures/cifp-check';
import type { Procedure } from '../../src/procedures/schema';

describe('RNAV procedures match their CIFP coding', () => {
  for (const p of RNAV_PROCEDURES) {
    it(p.id, () => {
      expect(checkAgainstCifp(p, NAVDATA)).toEqual([]);
    });
  }

  const klaa = RNAV_PROCEDURES.find((p) => p.id === 'klaa-rnav18')!;
  const mutate = (f: (p: Procedure) => void): Procedure => {
    const copy = structuredClone(klaa);
    f(copy);
    return copy;
  };

  it('flags a wrong altitude, hold length, FAF and glidepath', () => {
    const bad = mutate((p) => {
      const t = p.transitions.find((x) => x.id === 'weyyi')!.legs[0]!;
      if (t.type === 'track') t.minAltFt = 5000;
      const h = p.transitions.find((x) => x.id === 'obozu')!.legs[0]!;
      if (h.type === 'hold') h.legNm = 5;
      const f = p.approach.find((l) => l.type === 'final')!;
      if (f.type === 'final') {
        f.fafAltFt = 5400;
        f.gp = { angleDeg: 3, tchFt: 41 };
      }
    });
    const paths = checkAgainstCifp(bad, NAVDATA).map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'transitions.weyyi.legs[0].minAltFt',
        'transitions.obozu.legs[0].legNm',
        'final.fafAltFt',
        'final.gp',
        'final.gp.angleDeg',
      ]),
    );
  });

  it('flags a missing minimums line and a wrong missed-approach fix', () => {
    const bad = mutate((p) => {
      p.minimums = p.minimums.filter((m) => m.kind !== 'LNAV/VNAV');
      const d = p.missed[1]!;
      if (d.type === 'direct') d.to = 'LOLME';
    });
    const paths = checkAgainstCifp(bad, NAVDATA).map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['minimums', 'missed[1]']));
  });
});
