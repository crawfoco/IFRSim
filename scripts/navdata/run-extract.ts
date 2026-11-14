/**
 * Write src/procedures/navdata.json from the NASR cycle in data/raw/.
 * Usage: npm run navdata -- [--cycle YYYY-MM-DD]   (defaults to the cycle in force today)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cycleEffectiveOn, isoDate, parseIsoDate } from './cycle';
import { buildNavData } from './extract';

function main() {
  const i = process.argv.indexOf('--cycle');
  const cycle = i > 0 ? parseIsoDate(process.argv[i + 1] ?? '') : cycleEffectiveOn(new Date());
  const cycleIso = isoDate(cycle);
  const dir = join('data', 'raw', `nasr-${cycleIso}`);
  const data = buildNavData(dir, cycleIso);
  const out = join('src', 'procedures', 'navdata.json');
  mkdirSync(join('src', 'procedures'), { recursive: true });
  writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
  console.log(
    `Wrote ${out} from NASR cycle ${cycleIso}: ${Object.keys(data.airports).length} airports, ` +
      `${data.runwayEnds.length} runway ends, ${Object.keys(data.navaids).length} navaids, ` +
      `${Object.keys(data.localizers).length} localizers, ${Object.keys(data.fixes).length} fixes`,
  );
}

main();
