/**
 * T14: fly the KCFO ILS 26 vectors scenario in the browser with the real controls
 * (mouse and keyboard only) until the autopilot captures the localizer.
 */
import { expect, test, type Page } from '@playwright/test';

async function turn(page: Page, testId: string, key: string, times: number) {
  const knob = page.getByTestId(testId);
  await knob.focus();
  for (let i = 0; i < times; i++) await knob.press(key);
}

test('arm APR on vectors and see the localizer capture', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await expect(page.getByTestId('hsi')).toBeVisible();

  // Tune NAV1 to I-FTG 109.30 (standby 116.30, MHz knob down 7) and swap it active.
  await turn(page, 'nav1-mhz', 'ArrowDown', 7);
  await expect(page.getByTestId('nav1-standby')).toHaveText('109.30');
  await page.getByTestId('nav1-swap').click();
  await expect(page.getByTestId('nav1-active')).toHaveText('109.30');

  // Course 263: from 360, ten big steps down (260) then three up.
  await turn(page, 'knob-crs1', 'PageDown', 10);
  await turn(page, 'knob-crs1', 'ArrowUp', 3);
  await expect(page.getByTestId('hsi').getByRole('img')).toHaveAccessibleName(/course 263/);

  // Autopilot on, heading 293, descend to 7000 at 500 fpm, arm the approach.
  await page.getByTestId('btn-AP').click();
  await page.getByTestId('btn-HDG').click();
  await turn(page, 'knob-hdg', 'PageDown', 4);
  await turn(page, 'knob-hdg', 'ArrowUp', 3);
  await expect(page.getByTestId('hsi').getByRole('img')).toHaveAccessibleName(/heading/);
  await turn(page, 'knob-alt', 'PageDown', 1);
  await expect(page.getByTestId('ann-alt-sel')).toHaveText('7,000 FT');
  await page.getByTestId('btn-VS').click();
  await turn(page, 'knob-vs', 'ArrowDown', 5);
  await expect(page.getByTestId('ann-vertical')).toHaveText('VS -500');
  await expect(page.getByTestId('ann-vertical-armed')).toHaveText('ALT');
  await page.getByTestId('btn-APR').click();
  await expect(page.getByTestId('ann-lateral')).toHaveText('HDG');
  await expect(page.getByTestId('ann-lateral-armed')).toHaveText('LOC');
  await expect(page.getByTestId('dme-value')).not.toHaveText('--.-');

  await page.getByTestId('speed-4').click();
  await expect(page.getByTestId('ann-lateral')).toHaveText('LOC', { timeout: 150_000 });
  await expect(page.getByTestId('ann-lateral-armed')).toHaveText('');
  await expect(page.getByTestId('ann-vertical-armed')).toContainText('GS');
});
