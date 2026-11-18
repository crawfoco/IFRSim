/**
 * The moving map takes the plate's place while it is on (issue #7: it used to squeeze the plate
 * to a sliver). The MAP/PLATE switch at the view's upper right switches back. Both panels,
 * desktop and tablet.
 */
import { expect, test } from '@playwright/test';

for (const vp of [
  { name: 'desktop', width: 1366, height: 860 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
]) {
  test(`moving map replaces the plate and the switch brings it back (${vp.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.getByTestId('pick-kcfo-ils26').click();
    await page.getByTestId('start-vectors-final').check();
    await page.getByTestId('fly').click();
    const chart = page.getByTestId('chart');
    const map = page.getByTestId('moving-map');
    await expect(chart).toBeVisible();
    // Steam: no auto-ID next to the radios (the learner presses ID).
    await expect(page.getByTestId('nav1-autoid')).toHaveCount(0);
    const plateH = (await chart.boundingBox())!.height;

    await page.getByTestId('map-toggle').click();
    await expect(map).toBeVisible();
    await expect(chart).toBeHidden();
    // The map gets the room the plate had (not a strip above a squeezed plate).
    const mapH = (await map.boundingBox())!.height;
    expect(mapH).toBeGreaterThan(plateH * 0.8);
    expect(mapH).toBeGreaterThan(vp.height * 0.3);
    const pageH = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(pageH).toBeLessThanOrEqual(vp.height);

    await page.getByTestId('map-toggle').click();
    await expect(map).toHaveCount(0);
    await expect(chart).toBeVisible();
    expect((await chart.boundingBox())!.height).toBeCloseTo(plateH, -1);
  });
}
