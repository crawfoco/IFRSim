/**
 * Pick KCFO ILS 26, brief radar vectors, and fly the intercept with the real controls
 * (mouse and keyboard only) until the autopilot captures the localizer.
 */
import { expect, test, type Page } from '@playwright/test';

async function turn(page: Page, testId: string, key: string, times: number) {
  const knob = page.getByTestId(testId);
  await knob.focus();
  for (let i = 0; i < times; i++) await knob.press(key);
}

test('select → briefing → fly: arm APR on vectors and see the localizer capture', async ({
  page,
}) => {
  test.setTimeout(360_000);
  await page.goto('/');
  await page.getByTestId('pick-kcfo-ils26').click();

  // Briefing: chart with banner and cycle, start condition and weather choices.
  await expect(page.getByTestId('chart-cycle')).toHaveText(/AL-6851 Amdt 6B · valid 29 OCT 2026/);
  await expect(page.getByText(/Training use only/).first()).toBeVisible();
  await page.getByTestId('start-vectors-final').check();
  await expect(page.getByTestId('clearance')).toContainText('heading 293');
  await page.getByTestId('gs-out').check();
  await expect(page.getByTestId('brief-minimums')).toContainText('MDA 5,900');
  await page.getByTestId('gs-out').uncheck();
  await expect(page.getByTestId('brief-minimums')).toContainText('DA 5,689');
  await page.getByTestId('fly').click();
  await expect(page.getByTestId('hsi')).toBeVisible();

  // Tune NAV1 to I-FTG 109.30 (standby 116.30, MHz knob down 7), swap, identify.
  await turn(page, 'nav1-mhz', 'ArrowDown', 7);
  await expect(page.getByTestId('nav1-standby')).toHaveText('109.30');
  await page.getByTestId('nav1-swap').click();
  await expect(page.getByTestId('nav1-active')).toHaveText('109.30');
  await page.getByTestId('nav1-ident').click();
  await expect(page.getByTestId('nav1-morse')).toHaveText(/^\.\.\s+\.\.-\.\s+-\s+--\.$/);

  // Course 263: from 360, ten big steps down (260) then three up.
  await turn(page, 'knob-crs1', 'PageDown', 10);
  await turn(page, 'knob-crs1', 'ArrowUp', 3);
  await expect(page.getByTestId('hsi').getByRole('img')).toHaveAccessibleName(/course 263/);

  // Autopilot on, heading 293, arm the approach. Timer runs.
  await page.getByTestId('btn-AP').click();
  await page.getByTestId('btn-HDG').click();
  await turn(page, 'knob-hdg', 'PageDown', 4);
  await turn(page, 'knob-hdg', 'ArrowUp', 3);
  await page.getByTestId('btn-APR').click();
  await expect(page.getByTestId('ann-lateral')).toHaveText('HDG');
  await expect(page.getByTestId('ann-lateral-armed')).toHaveText('LOC');
  await page.getByTestId('timer-startstop').click();
  await expect(page.getByTestId('timer-value')).not.toHaveText('00:00', { timeout: 5_000 });

  await page.getByTestId('speed-4').click();
  await expect(page.getByTestId('ann-lateral')).toHaveText('LOC', { timeout: 150_000 });
  await expect(page.getByTestId('ann-vertical-armed')).toContainText('GS');

  // Coupled to the glideslope down to DA; ceiling above minimums ends the scenario.
  await expect(page.getByTestId('ann-vertical')).toHaveText('GS', { timeout: 150_000 });
  await expect(page.getByTestId('outcome')).toHaveText(/Runway in sight/, { timeout: 200_000 });
  await expect(page.getByTestId('callout')).toContainText('DA 5,689');
  await expect(page.getByTestId('pause')).toBeDisabled();
});
