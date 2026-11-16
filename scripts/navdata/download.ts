/**
 * Download one NASR CSV cycle and the matching CIFP from the FAA into data/raw/nasr-<cycle>/ and
 * data/raw/cifp-<cycle>/ (git-ignored), and unzip them.
 * Dev-time only; the app never touches the network.
 * Usage: npm run navdata:download -- [--cycle YYYY-MM-DD]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cifpUrl, cycleEffectiveOn, isoDate, nasrCsvUrl, parseIsoDate } from './cycle';

async function main() {
  const i = process.argv.indexOf('--cycle');
  const cycle = i > 0 ? parseIsoDate(process.argv[i + 1] ?? '') : cycleEffectiveOn(new Date());
  await fetchAndUnzip(
    join('data', 'raw', `nasr-${isoDate(cycle)}`),
    nasrCsvUrl(cycle),
    'NAV_BASE.csv',
  );
  await fetchAndUnzip(join('data', 'raw', `cifp-${isoDate(cycle)}`), cifpUrl(cycle), 'FAACIFP18');
}

async function fetchAndUnzip(dir: string, url: string, expected: string) {
  if (existsSync(join(dir, expected))) {
    console.log(`${dir} already has this cycle; nothing to do.`);
    return;
  }
  mkdirSync(dir, { recursive: true });
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  const zipPath = join(dir, url.slice(url.lastIndexOf('/') + 1));
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  console.log(`Saved ${zipPath}; extracting`);
  // bsdtar (Windows 10+, macOS) reads zip archives; fall back to unzip elsewhere.
  try {
    execFileSync('tar', ['-xf', zipPath, '-C', dir], { stdio: 'inherit' });
  } catch {
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', dir], { stdio: 'inherit' });
  }
  if (!existsSync(join(dir, expected)))
    throw new Error(`${expected} not found after extracting ${zipPath}`);
  console.log(`Done: ${dir}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
