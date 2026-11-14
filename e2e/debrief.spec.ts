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
  await expect(page.getByTestId('item-ident:I-FTG')).toContainText('tuned and identified');
  await expect(page.getByTestId('plan-view')).toBeVisible();
  await expect(page.getByTestId('profile-view')).toBeVisible();
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
});
