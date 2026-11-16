/**
 * V2 G4 on the glass panel, with the real controls:
 * - switching the CDI drops an active NAV/APR to ROL (and cancels an armed one, keeping HDG);
 * - a bearing pointer points at the station;
 * - double-clicking the HDG knob syncs the bug to the current heading.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseProcedure } from '../src/procedures/schema';
import { initialBearingTrueDeg } from '../src/sim/geo/geodesy';
import type { NavData } from '../src/sim/navdata/types';
import { buildScenario } from '../src/sim/scenario/scenario';

// Playwright's loader can't import JSON modules, so read the app's data files directly.
const readJson = (f: string): unknown =>
  JSON.parse(readFileSync(new URL(`../src/procedures/${f}`, import.meta.url), 'utf8'));
const NAVDATA = readJson('navdata.json') as NavData;
const KCFO = parseProcedure(readJson('kcfo-ils26.json'), 'kcfo-ils26.json');

async function turn(page: Page, testId: string, key: string, times: number) {
  const knob = page.getByTestId(testId);
  await knob.focus();
  for (let i = 0; i < times; i++) await knob.press(key);
}

/** KCFO radar vectors on the glass panel. NAV1 and NAV2 both start on FQF 116.30, heading 330. */
async function startGlass(page: Page) {
  await page.goto('/');
  await page.getByTestId('pick-kcfo-ils26').click();
  await page.getByTestId('start-vectors-final').check();
  await page.getByTestId('panel-glass').check();
  await page.getByTestId('fly').click();
  await expect(page.getByTestId('pfd')).toBeVisible();
}

/** The rotate() angle of an SVG group, normalised to −180…180. */
async function rotation(page: Page, testId: string): Promise<number> {
  const t = (await page.getByTestId(testId).getAttribute('transform')) ?? '';
  const m = /rotate\(\s*(-?[\d.]+)/.exec(t);
  if (!m) throw new Error(`no rotate() in ${testId}: ${t}`);
  return ((Number(m[1]) + 540) % 360) - 180;
}

test('CDI switch: active NAV drops to ROL; armed NAV is cancelled and HDG kept', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await startGlass(page);
  // NAV2 → I-FTG 109.30; the aircraft starts south of the localizer. Auto-ID shows the ident.
  await turn(page, 'nav2-mhz', 'ArrowDown', 7);
  await page.getByTestId('nav2-swap').click();
  await expect(page.getByTestId('nav2-active')).toHaveText('109.30');
  await expect(page.getByTestId('nav2-autoid')).toHaveText('I-FTG');
  // One CRS knob sets the course of the CDI's source: switch the CDI to VLOC2, then set 263.
  await page.getByTestId('btn-cdi').click();
  await expect(page.getByTestId('btn-cdi')).toContainText('VLOC2');
  await turn(page, 'knob-crs', 'PageDown', 10);
  await turn(page, 'knob-crs', 'ArrowUp', 3);
  await expect(page.getByTestId('pfd-crs-box-value')).toHaveText('263°');
  await expect(page.getByTestId('knob-crs1')).toHaveCount(0);
  await expect(page.getByTestId('knob-crs2')).toHaveCount(0);
  await expect(page.getByTestId('pfd-hsi-source')).toHaveText('VLOC2');

  // AP on, HDG 293 (the ATC vector), NAV: captures the localizer on NAV2.
  await page.getByTestId('btn-AP').click();
  await page.getByTestId('btn-HDG').click();
  await turn(page, 'knob-hdg', 'PageDown', 4);
  await turn(page, 'knob-hdg', 'ArrowUp', 3);
  await expect(page.getByTestId('pfd-hdg-box-value')).toHaveText('293°');
  await page.getByTestId('btn-NAV').click();
  await expect(page.getByTestId('pfd-ann-lateral-armed')).toHaveText('LOC');
  await page.getByTestId('speed-4').click();
  await expect(page.getByTestId('pfd-ann-lateral')).toHaveText('LOC', { timeout: 150_000 });
  await page.getByTestId('speed-1').click();

  // CDI back to VLOC1: NAV drops to ROL.
  await page.getByTestId('btn-cdi').click();
  await expect(page.getByTestId('btn-cdi')).toContainText('VLOC1');
  await expect(page.getByTestId('pfd-ann-lateral')).toHaveText('ROL');
  await expect(page.getByTestId('pfd-ann-lateral-armed')).toHaveCount(0);

  // HDG, arm NAV on VLOC1 (FQF, CRS 360: far from capture), then switch the CDI.
  // Back on VLOC1 the course is CRS1 (360), not CRS2.
  await expect(page.getByTestId('pfd-crs-box-value')).toHaveText('360°');
  await page.getByTestId('btn-HDG').click();
  await page.getByTestId('btn-NAV').click();
  await expect(page.getByTestId('pfd-ann-lateral')).toHaveText('HDG');
  await expect(page.getByTestId('pfd-ann-lateral-armed')).toHaveText('VOR');
  await page.getByTestId('btn-cdi').click();
  await expect(page.getByTestId('pfd-ann-lateral')).toHaveText('HDG');
  await expect(page.getByTestId('pfd-ann-lateral-armed')).toHaveCount(0);
});

test('BRG1 on NAV1 points at FQF; BRG2 on a localizer shows NO BRG', async ({ page }) => {
  await startGlass(page);
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('pfd-brg1')).toHaveCount(0);

  await page.getByTestId('btn-brg1').click();
  await expect(page.getByTestId('btn-brg1')).toContainText('NAV1');
  await expect(page.getByTestId('pfd-brg1-station')).toHaveText('FQF');
  await expect(page.getByTestId('pfd-brg1-dme')).toHaveText(/^\d+\.\d NM$/);

  // Expected: great-circle bearing from the start position to FQF, magnetic by FQF's
  // declination, relative to the 330° heading (paused at the start, wings level).
  const sc = buildScenario(KCFO, NAVDATA, {
    startId: 'vectors-final',
    ceiling: 'above',
    gsOutOfService: false,
  });
  const fqf = NAVDATA.navaids['FQF']!;
  const brgMag =
    initialBearingTrueDeg(sc.initial.aircraft.position, fqf.position) - fqf.declinationEastDeg;
  const expected = ((brgMag - 330 + 540) % 360) - 180;
  const actual = await rotation(page, 'pfd-brg1');
  expect(Math.abs(((actual - expected + 540) % 360) - 180)).toBeLessThan(1);

  // NAV2 → I-FTG; BRG2 → NAV2: a localizer has no bearing.
  await turn(page, 'nav2-mhz', 'ArrowDown', 7);
  await page.getByTestId('nav2-swap').click();
  await page.getByTestId('btn-brg2').click();
  await page.getByTestId('btn-brg2').click();
  await expect(page.getByTestId('btn-brg2')).toContainText('NAV2');
  await expect(page.getByTestId('pfd-brg2-box')).toHaveAttribute('data-no-brg', 'true');
  await expect(page.getByTestId('pfd-brg2-station')).toContainText('NO BRG');
  await expect(page.getByTestId('pfd-brg2')).toHaveCount(0);
});

test('double-clicking the HDG knob syncs the bug to the current heading', async ({ page }) => {
  await startGlass(page);
  await page.getByTestId('pause').click();
  await turn(page, 'knob-hdg', 'PageDown', 3);
  await expect(page.getByTestId('pfd-hdg-box-value')).toHaveText('300°');
  await page.getByTestId('knob-hdg').dblclick();
  await expect(page.getByTestId('pfd-hdg-box-value')).toHaveText('330°');
  // Keyboard: Enter on the focused knob does the same.
  await turn(page, 'knob-hdg', 'ArrowUp', 5);
  await expect(page.getByTestId('pfd-hdg-box-value')).toHaveText('335°');
  await page.getByTestId('knob-hdg').press('Enter');
  await expect(page.getByTestId('pfd-hdg-box-value')).toHaveText('330°');
});

test('the DME window shows the DME source radio and its distance', async ({ page }) => {
  await startGlass(page);
  await page.getByTestId('pause').click();
  // Glass: no separate DME readout, just the source buttons; the PFD shows the distance.
  await expect(page.getByTestId('dme')).toHaveCount(0);
  await expect(page.getByTestId('pfd-dme-source')).toHaveText('NAV1');
  await expect(page.getByTestId('pfd-dme-station')).toHaveText('FQF');
  await expect(page.getByTestId('pfd-dme-nm')).toHaveText(/^\d+\.\d NM$/);
  // NAV2 → I-FTG (LOC/DME) and DME source NAV2.
  await turn(page, 'nav2-mhz', 'ArrowDown', 7);
  await page.getByTestId('nav2-swap').click();
  await page.getByTestId('dme-src-2').click();
  await expect(page.getByTestId('pfd-dme-source')).toHaveText('NAV2');
  await expect(page.getByTestId('pfd-dme-station')).toHaveText('I-FTG');
  await expect(page.getByTestId('pfd-dme-nm')).toHaveText(/^1\d\.\d NM$/);
});
