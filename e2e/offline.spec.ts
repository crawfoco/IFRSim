/**
 * T31 / SPEC success criterion 6: after loading, the app runs with no network at all.
 * Any request to a non-local host is blocked and recorded; then the network is cut and a
 * short flight is flown through to the debrief on every procedure's plate.
 */
import { expect, test } from '@playwright/test';

test('no external requests, and a full select → fly → debrief cycle works offline', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const external: string[] = [];
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(r.url()));

  await page.goto('/');
  await expect(page.getByTestId('pick-kcfo-ils26')).toBeVisible();
  await page.waitForLoadState('networkidle'); // plates preloaded
  await context.setOffline(true);

  // Every plate still shows offline.
  for (const id of [
    'kcfo-ils26',
    'kgxy-ils35',
    'kmtj-ils17',
    'kako-vor29',
    'klar-vor30',
    'ksny-vor13',
  ]) {
    await page.getByTestId(`pick-${id}`).click();
    const img = page.getByTestId('chart').locator('img');
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true);
    await page.getByTestId('back').click();
  }

  // Fly a little and debrief, still offline.
  await page.getByTestId('pick-kcfo-ils26').click();
  await page.getByTestId('fly').click();
  await page.getByTestId('btn-AP').click();
  await page.getByTestId('nav1-ident').click();
  await page.getByTestId('speed-4').click();
  await page.waitForTimeout(3_000);
  await page.getByTestId('end-flight').click();
  await expect(page.getByTestId('score')).toContainText('%');

  expect(external).toEqual([]);
  expect(failed).toEqual([]);
});
