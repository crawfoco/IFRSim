import { describe, expect, it } from 'vitest';
import {
  airacIdent,
  cifpUrl,
  cycleEffectiveOn,
  isoDate,
  nasrCsvUrl,
  parseIsoDate,
} from '../../../scripts/navdata/cycle';

describe('NASR cycles', () => {
  it.each([
    ['2026-10-29', '2026-10-29'],
    ['2026-11-14', '2026-10-29'],
    ['2026-11-25', '2026-10-29'],
    ['2026-11-26', '2026-11-26'],
    ['2026-10-28', '2026-10-01'],
    ['2027-01-01', '2026-12-24'],
  ])('date %s is in the cycle effective %s', (date, expected) => {
    expect(isoDate(cycleEffectiveOn(parseIsoDate(date)))).toBe(expected);
  });

  it('builds the CSV subscription URL', () => {
    expect(nasrCsvUrl(parseIsoDate('2026-10-29'))).toBe(
      'https://nfdc.faa.gov/webContent/28DaySub/extra/29_Oct_2026_CSV.zip',
    );
    expect(nasrCsvUrl(parseIsoDate('2026-12-24'))).toMatch(/\/24_Dec_2026_CSV\.zip$/);
  });

  it('names the AIRAC cycle and the CIFP zip', () => {
    expect(airacIdent(parseIsoDate('2026-10-29'))).toBe('2611');
    expect(airacIdent(parseIsoDate('2026-11-26'))).toBe('2612');
    expect(airacIdent(parseIsoDate('2026-01-22'))).toBe('2601');
    expect(cifpUrl(parseIsoDate('2026-10-29'))).toBe(
      'https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_261029.zip',
    );
  });

  it('rejects malformed dates', () => {
    expect(() => parseIsoDate('29/10/2026')).toThrow();
  });
});
