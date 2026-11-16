/**
 * V2 G5: fly KCFO ILS 26 on the Glass PFD with the real controls, from radar vectors to DA:
 * the PFD mode bar shows armed and active modes (flashing on change) instead of the AP panel's
 * own row, and at DA the MINIMUMS alert shows with the DA in the minimums box.
 */
import { expect, test, type Page } from '@playwright/test';

async function turn(page: Page, testId: string, key: string, times: number) {
  const knob = page.getByTestId(testId);
  await knob.focus();
  for (let i = 0; i < times; i++) await knob.press(key);
}

/** Running CSS animations on an element (the mode-change flash). */
const animations = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((el) => el.getAnimations().length);

test('glass: vectors to the KCFO ILS 26, coupled down to DA, MINIMUMS alert', async ({ page }) => {
  test.setTimeout(360_000);
  await page.goto('/');
  await page.getByTestId('pick-kcfo-ils26').click();
  await page.getByTestId('start-vectors-final').check();
  await page.getByTestId('panel-glass').check();
  await page.getByTestId('fly').click();
  await expect(page.getByTestId('pfd')).toBeVisible();
  // The AP panel's own mode row is not shown on the glass panel.
  await expect(page.getByTestId('annunciator')).toHaveCount(0);
  await expect(page.getByTestId('pfd-ann-ap')).toHaveCount(0);
  await expect(page.getByTestId('pfd-mins-box-value')).toHaveText('5,689');

  // NAV1 → I-FTG 109.30: auto-ID shows it (no ID press needed on glass). CRS 263, DME on NAV1.
  await expect(page.getByTestId('nav1-autoid')).toHaveText('FQF');
  await turn(page, 'nav1-mhz', 'ArrowDown', 7);
  await page.getByTestId('nav1-swap').click();
  await expect(page.getByTestId('nav1-autoid')).toHaveText('I-FTG');
  await turn(page, 'knob-crs', 'PageDown', 10);
  await turn(page, 'knob-crs', 'ArrowUp', 3);
  await expect(page.getByTestId('pfd-crs-box-value')).toHaveText('263°');
  await expect(page.getByTestId('pfd-dme-station')).toHaveText('I-FTG');

  // AP, HDG 293, APR. The mode bar shows them, and a new mode flashes.
  await page.getByTestId('btn-AP').click();
  await expect(page.getByTestId('pfd-ann-ap')).toHaveText('AP');
  await page.getByTestId('btn-HDG').click();
  await expect(page.getByTestId('pfd-ann-lateral')).toHaveText('HDG');
  expect(await animations(page, 'pfd-ann-lateral')).toBeGreaterThan(0);
  await turn(page, 'knob-hdg', 'PageDown', 4);
  await turn(page, 'knob-hdg', 'ArrowUp', 3);
  await page.getByTestId('btn-APR').click();
  await expect(page.getByTestId('pfd-ann-lateral-armed')).toHaveText('LOC');
  await expect(page.getByTestId('pfd-ann-vertical-armed')).toContainText('GS');
  // The flash stops after about 3 s.
  await expect.poll(() => animations(page, 'pfd-ann-lateral'), { timeout: 5_000 }).toBe(0);

  await page.getByTestId('speed-4').click();
  await expect(page.getByTestId('pfd-ann-lateral')).toHaveText('LOC', { timeout: 150_000 });
  await expect(page.getByTestId('pfd-ann-vertical')).toHaveText('GS', { timeout: 150_000 });
  await expect(page.getByTestId('pfd-minimums')).toHaveCount(0);

  // DA: the callout and the PFD's MINIMUMS alert.
  await expect(page.getByTestId('callout')).toHaveText('Minimums.', { timeout: 200_000 });
  await page.getByTestId('pause').click();
  await expect(page.getByTestId('pfd-minimums')).toBeVisible();
  await expect(page.getByTestId('pfd-minimums')).toContainText('MINIMUMS');
  await page.getByTestId('pause').click();

  const view = page.getByTestId('outside-view');
  if ((await view.getAttribute('data-runway')) !== 'in-sight') {
    // Go around: the alert clears and GA shows in the mode bar.
    await page.getByTestId('btn-GA').click();
    await expect(page.getByTestId('pfd-ann-vertical')).toHaveText('GA');
    await expect(page.getByTestId('pfd-ann-lateral')).toHaveText('ROL');
    await expect(page.getByTestId('pfd-minimums')).toHaveCount(0);
  } else {
    // Landing: the alert goes out 5 s (sim time) after DA, or when the flight ends.
    await expect(page.getByTestId('pfd-minimums')).toHaveCount(0, { timeout: 30_000 });
  }

  // Restart keeps the glass panel (new hidden weather), and the debrief names the panel.
  await page.getByTestId('restart').click();
  await expect(page.getByTestId('pfd')).toBeVisible();
  await expect(page.getByTestId('hsi')).toHaveCount(0);
  await page.getByTestId('end-flight').click();
  await expect(page.getByTestId('debrief-panel')).toHaveText('Panel: Glass PFD');
});
