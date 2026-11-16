/** Debrief: end a short flight and check the score table, views, timeline and replay. */
import { expect, test } from '@playwright/test';

test('a short flight ends in a debrief with score, plan, profile, timeline and replay', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByTestId('pick-kcfo-ils26').click();
  await page.getByTestId('start-vectors-final').check();
  await page.getByTestId('fly').click();

  await page.getByTestId('btn-AP').click();
  await page.getByTestId('btn-HDG').click();
  const mhz = page.getByTestId('nav1-mhz');
  await mhz.focus();
  for (let i = 0; i < 7; i++) await mhz.press('ArrowDown');
  await page.getByTestId('nav1-swap').click();
  await page.getByTestId('nav1-ident').click();
  await page.getByTestId('speed-4').click();
  await page.waitForTimeout(10_000); // ~40 s of flight
  await page.getByTestId('end-flight').click();

  await expect(page.getByTestId('score')).toContainText('%');
  await expect(page.getByTestId('debrief-panel')).toHaveText('Panel: Steam gauges');
  await expect(page.getByTestId('item-ident:I-FTG')).toContainText('tuned and identified');
  await expect(page.getByTestId('plan-view')).toBeVisible();
  await expect(page.getByTestId('profile-view')).toBeVisible();
  await expect(page.getByTestId('final-profile')).toBeVisible();
  await expect(page.getByTestId('final-profile-fix-FAF')).toHaveCount(1);
  await expect(page.getByTestId('final-profile-path')).toHaveCount(1); // ILS glideslope

  // Plan / Plate toggle in the left panel.
  await page.getByTestId('debrief-tab-plate').click();
  await expect(page.getByTestId('chart')).toBeVisible();
  await expect(page.getByTestId('plan-view')).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: 'test-results/debrief-plate-1024.png' });
  await page.getByTestId('debrief-tab-plan').click();
  await expect(page.getByTestId('plan-view')).toBeVisible();
  await page.screenshot({ path: 'test-results/debrief-1024.png' });
  await expect(page.getByTestId('timeline').locator('li')).not.toHaveCount(0);

  // Replay from the start at 16×: the replay clock moves.
  await page.getByTestId('replay-scrub').fill('0');
  const t0 = await page.getByTestId('replay-time').textContent();
  await page.getByTestId('replay-16').click();
  await page.getByTestId('replay-play').click();
  await expect(page.getByTestId('replay-time')).not.toHaveText(t0 ?? '', { timeout: 5_000 });
  await page.setViewportSize({ width: 1366, height: 860 });
  await page.screenshot({ path: process.env.DEBRIEF_SHOT ?? 'test-results/debrief.png' });

  await page.getByTestId('fly-again').click();
  await expect(page.getByTestId('hsi')).toBeVisible();

  // Back from the debrief goes to the main menu (the approach list).
  await page.getByTestId('end-flight').click();
  await expect(page.getByTestId('debrief-back')).toHaveText('← Main menu');
  await page.getByTestId('debrief-back').click();
  await expect(page.getByTestId('pick-kcfo-ils26')).toBeVisible();
});
