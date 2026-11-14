/** Minimal RFC 4180 CSV reader for FAA NASR files (quoted fields, "" escapes, CRLF). */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false;

  const endField = () => {
    row.push(field);
    field = '';
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      fieldStarted = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\r') {
      // swallow; the following \n ends the row
    } else if (c === '\n') {
      endRow();
    } else {
      field += c;
      fieldStarted = true;
    }
  }
  if (fieldStarted || field !== '' || row.length > 0) endRow();
  return rows;
}

/** Parse a CSV with a header row into trimmed records. */
export function readRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  return rows.map((cells, idx) => {
    if (cells.length !== header.length) {
      throw new Error(`CSV row ${idx + 2}: expected ${header.length} fields, got ${cells.length}`);
    }
    const rec: Record<string, string> = {};
    header.forEach((name, i) => {
      rec[name] = (cells[i] ?? '').trim();
    });
    return rec;
  });
}
