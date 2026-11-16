/**
 * V3 R5: fly KLAA RNAV (GPS) RWY 18 with the GPS panel. Glass: vectors-to-final, CDI on GPS,
 * APR arms GPS and GP, coupled to the LPV DA. Steam: the NAV/GPS switch, load and activate
 * WEYYI, NAV on the GPS. Both: the flight screen with the GPS unit in the radio stack fits
 * desktop and tablet.
 */
import { expect, test, type Page } from '@playwright/test';

const SHOT_DIR = process.env.LAYOUT_SHOTS ?? 'test-results';

async function turn(page: Page, testId: string, key: string, times: number) {
  const knob = page.getByTestId(testId);
  await knob.focus();
  for (let i = 0; i < times; i++) await knob.press(key);
}

async function brief(page: Page, start: string, panel: 'steam' | 'glass') {
  await page.goto('/');
  await page.getByTestId('tab-rnav').click();
  await page.getByTestId('pick-klaa-rnav18').click();
  await page.getByTestId(`start-${start}`).check();
  await page.getByTestId(`panel-${panel}`).check();
  await page.getByTestId('waas-available').check();
  await page.getByTestId('weather-above').check();
  await expect(page.getByTestId('brief-gs')).toContainText('WAAS channel 86613');
  await page.getByTestId('fly').click();
  await expect(page.getByTestId('gps-panel')).toBeVisible();
}

test('glass: KLAA RNAV 18 vectors-to-final on the GPS, GP coupled to the LPV DA', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await brief(page, 'vectors-final', 'glass');
  await expect(page.getByTestId('gps-loaded')).toHaveText('No approach loaded');
  await page.getByTestId('gps-proc').click();
  await page.getByTestId('gps-transition').selectOption('VTF');
  await page.getByTestId('gps-load-activate').click();
  await expect(page.getByTestId('gps-wpt')).toHaveText('LOLME');
  // CDI: VLOC1 → VLOC2 → GPS. No CRS knob on the GPS (auto course).
  await page.getByTestId('btn-cdi').click();
  await page.getByTestId('btn-cdi').click();
  await expect(page.getByTestId('pfd-hsi-source')).toHaveText('GPS');
  await expect(page.getByTestId('knob-crs')).toHaveCount(0);
  // AP, HDG 230 (the vector), APR: GPS and GP armed.
  await page.getByTestId('btn-AP').click();
  await page.getByTestId('btn-HDG').click();
  await page.getByTestId('btn-APR').click();
  await expect(page.getByTestId('pfd-ann-lateral-armed')).toHaveText('GPS');
  await expect(page.getByTestId('pfd-ann-vertical-armed')).toContainText('GP');
  await page.getByTestId('speed-4').click();
  await expect(page.getByTestId('pfd-ann-lateral')).toHaveText('GPS', { timeout: 120_000 });
  // Down to the FAF altitude, then the GP captures near LOLME and the GPS annunciates LPV.
  await turn(page, 'knob-alt', 'ArrowDown', 5);
  await page.getByTestId('btn-VS').click();
  await turn(page, 'knob-vs', 'ArrowDown', 5);
  await expect(page.getByTestId('gps-annunciation')).toHaveText('LPV', { timeout: 150_000 });
  await expect(page.getByTestId('pfd-hsi-gps-mode')).toContainText('LPV');
  await expect(page.getByTestId('pfd-ann-vertical')).toHaveText('GP', { timeout: 150_000 });
  await expect(page.getByTestId('pfd-mins-box-value')).toHaveText('3,945');
  await expect(page.getByTestId('pfd-minimums')).toBeVisible({ timeout: 150_000 });
  await page.screenshot({ path: `${SHOT_DIR}/rnav-glass-minimums.png` });
});

test('steam: NAV/GPS switch, load and activate WEYYI, NAV on the GPS', async ({ page }) => {
  test.setTimeout(240_000);
  await brief(page, 'direct-weyyi', 'steam');
  await page.getByTestId('gps-proc').click();
  await page.getByTestId('gps-transition').selectOption('weyyi');
  await page.getByTestId('gps-load').click();
  await expect(page.getByTestId('gps-loaded')).toContainText('not active');
  await page.getByTestId('gps-activate').click();
  await expect(page.getByTestId('gps-wpt')).toHaveText('WEYYI');
  await page.getByTestId('gps-fpl-btn').click();
  await expect(page.getByTestId('gps-fpl').locator('li.active')).toHaveText('WEYYI');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('gps-fpl')).toHaveCount(0);
  await page.getByTestId('gps-cdi').click();
  await expect(page.getByTestId('gps-cdi')).toContainText('GPS');
  await expect(page.getByTestId('hsi-gps')).toBeVisible();
  await page.getByTestId('btn-AP').click();
  await page.getByTestId('btn-NAV').click();
  await expect(page.getByTestId('annunciator')).toContainText('GPS');
  await page.getByTestId('speed-4').click();
  // The start is 10 NM north of WEYYI, off the feeder: the GPS goes direct, then turns onto it.
  await expect(page.getByTestId('gps-wpt')).toHaveText('OBOZU', { timeout: 180_000 });
  // Direct-To LOLME from the flight plan.
  await page.getByTestId('gps-dto').click();
  await page.getByTestId('gps-direct-fix').selectOption('LOLME');
  await page.getByTestId('gps-direct').click();
  await expect(page.getByTestId('gps-wpt')).toHaveText('LOLME');
  // Debrief: score, plan and profiles (the final profile draws the GPS glidepath), the GPS
  // commands on the timeline, and the track on the calibrated plate.
  await page.getByTestId('end-flight').click();
  await expect(page.getByTestId('score')).toContainText('%');
  await expect(page.getByTestId('plan-view')).toBeVisible();
  await expect(page.getByTestId('final-profile-path')).toHaveCount(1);
  await expect(page.getByText('GPS: direct LOLME')).toBeVisible();
  await page.getByTestId('debrief-tab-plate').click();
  await expect(page.getByTestId('plate-track')).toHaveCount(1);
  await page.screenshot({ path: `${SHOT_DIR}/rnav-debrief-plate.png` });
});

for (const vp of [
  { name: 'desktop', width: 1366, height: 860 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
]) {
  for (const panel of ['steam', 'glass'] as const)
    test(`RNAV flight screen (${panel}) fits ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await brief(page, 'direct-weyyi', panel);
      await page.getByTestId('gps-proc').click();
      await page.getByTestId('gps-load').click();
      await page.getByTestId('gps-activate').click();
      const m = await page.evaluate(() => {
        const pp = document.querySelector('.panel-pane')!;
        const left = document.querySelector('.plate-pane')!;
        return {
          pageW: document.documentElement.scrollWidth,
          pageH: document.documentElement.scrollHeight,
          panelOverflowY: pp.scrollHeight - pp.clientHeight,
          leftOverflowY: left.scrollHeight - left.clientHeight,
        };
      });
      // The GPS unit sits in the radio stack on the right; the left pane is briefing and plate.
      await expect(page.locator('.panel-pane [data-testid="gps-panel"]')).toHaveCount(1);
      await expect(page.locator('.plate-pane [data-testid="gps-panel"]')).toHaveCount(0);
      expect(m.pageW).toBeLessThanOrEqual(vp.width);
      expect(m.pageH).toBeLessThanOrEqual(vp.height);
      expect(m.panelOverflowY).toBeLessThanOrEqual(0);
      expect(m.leftOverflowY).toBeLessThanOrEqual(0);
      for (const id of [
        'gps-proc',
        'gps-dto',
        'gps-fpl-btn',
        'gps-activate',
        'gps-susp',
        'btn-APR',
      ])
        await expect(page.getByTestId(id)).toBeInViewport();
      await page.screenshot({ path: `${SHOT_DIR}/rnav-flight-${panel}-${vp.name}.png` });
    });
}

test('home screen: the RNAV tab lists KLAA, the radio tab is unchanged', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await expect(page.getByTestId('pick-kcfo-ils26')).toBeVisible();
  await page.getByTestId('tab-rnav').click();
  await expect(page.getByTestId('pick-klaa-rnav18')).toBeVisible();
  await expect(page.getByTestId('pick-kcfo-ils26')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(768);
});
