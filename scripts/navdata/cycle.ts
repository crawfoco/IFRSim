/** FAA 28-day NASR/AIRAC cycle arithmetic. */

const DAY_MS = 86_400_000;
const CYCLE_DAYS = 28;
/** A known NASR effective date; every cycle is a multiple of 28 days from it. */
const REFERENCE = Date.UTC(2026, 9, 29); // 2026-10-29

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Effective date (UTC midnight) of the cycle in force on `date`. */
export function cycleEffectiveOn(date: Date): Date {
  const day = Math.floor((date.getTime() - REFERENCE) / DAY_MS);
  const n = Math.floor(day / CYCLE_DAYS);
  return new Date(REFERENCE + n * CYCLE_DAYS * DAY_MS);
}

/** "2026-10-29" */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** NASR CSV subscription zip URL for a cycle, e.g. .../29_Oct_2026_CSV.zip */
export function nasrCsvUrl(cycle: Date): string {
  const dd = String(cycle.getUTCDate()).padStart(2, '0');
  const mon = MONTHS[cycle.getUTCMonth()];
  return `https://nfdc.faa.gov/webContent/28DaySub/extra/${dd}_${mon}_${cycle.getUTCFullYear()}_CSV.zip`;
}

export function parseIsoDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Expected YYYY-MM-DD, got "${s}"`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** AIRAC cycle ident for an effective date: "2611" for 2026-10-29 (the 11th cycle of 2026). */
export function airacIdent(cycle: Date): string {
  const year = cycle.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const n = Math.floor((cycle.getTime() - jan1) / DAY_MS / CYCLE_DAYS) + 1;
  return `${String(year % 100).padStart(2, '0')}${String(n).padStart(2, '0')}`;
}

/** FAA CIFP zip URL for a cycle, e.g. .../CIFP_261029.zip */
export function cifpUrl(cycle: Date): string {
  const yy = String(cycle.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(cycle.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(cycle.getUTCDate()).padStart(2, '0');
  return `https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_${yy}${mm}${dd}.zip`;
}
