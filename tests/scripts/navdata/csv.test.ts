import { describe, expect, it } from 'vitest';
import { parseCsv, readRecords } from '../../../scripts/navdata/csv';

describe('parseCsv', () => {
  it('splits quoted fields, keeps embedded commas and doubled quotes', () => {
    const text = '"A","B","C"\r\n"1","x, y","say ""hi"""\r\n';
    expect(parseCsv(text)).toEqual([
      ['A', 'B', 'C'],
      ['1', 'x, y', 'say "hi"'],
    ]);
  });

  it('handles unquoted fields, empty fields and a missing final newline', () => {
    expect(parseCsv('a,,c\n1,2,')).toEqual([
      ['a', '', 'c'],
      ['1', '2', ''],
    ]);
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('"a","line1\nline2"\n')).toEqual([['a', 'line1\nline2']]);
  });
});

describe('readRecords', () => {
  it('maps rows to objects keyed by header and trims values', () => {
    const recs = readRecords('"ID","NAME"\n"FQF ","FALCON"\n');
    expect(recs).toEqual([{ ID: 'FQF', NAME: 'FALCON' }]);
  });

  it('rejects rows with the wrong number of fields', () => {
    expect(() => readRecords('"A","B"\n"1"\n')).toThrow(/row 2/);
  });
});
