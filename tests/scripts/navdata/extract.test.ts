import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNavData } from '../../../scripts/navdata/extract';

const FIXTURES = join(import.meta.dirname, '../../fixtures/navdata');
const small = {
  airports: ['CFO'],
  runwayEnds: [['CFO', '26']] as const,
  navaids: ['FQF'],
  localizers: [['FTG', 'CFO']] as const,
  fixes: [['SKIPI', 'CO']] as const,
};

describe('buildNavData', () => {
  it('builds keyed navdata from NASR CSVs', () => {
    const data = buildNavData(FIXTURES, '2026-10-29', small);
    expect(data.source).toMatchObject({ dataset: 'FAA NASR', cycle: '2026-10-29' });
    expect(Object.keys(data.airports)).toEqual(['KCFO']);
    expect(data.navaids.FQF?.freqMHz).toBe(116.3);
    expect(data.localizers['I-FTG']?.dme?.channel).toBe('30X');
    expect(data.fixes.SKIPI?.state).toBe('CO');
    expect(data.runwayEnds[0]).toMatchObject({ airport: 'CFO', runway: '26' });
  });

  it('fails loudly when something wanted is missing', () => {
    expect(() =>
      buildNavData(FIXTURES, '2026-10-29', { ...small, fixes: [['NOPE', 'CO']] }),
    ).toThrow(/Fix NOPE\/CO: expected 1 NASR record, found 0/);
  });

  it('refuses files from a different cycle', () => {
    expect(() => buildNavData(FIXTURES, '2026-11-26', small)).toThrow(/not cycle 2026-11-26/);
  });
});
