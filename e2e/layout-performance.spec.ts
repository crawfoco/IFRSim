/**
 * T30: the flight screen fits desktop and tablet-landscape viewports without scrolling
 * sideways, and it renders at display rate with the sim keeping up at 4×.
 * Measured numbers are attached to the test report (and printed).
 */
import { expect, test, type Page } from '@playwright/test';

const SHOT_DIR = process.env.LAYOUT_SHOTS ?? 'test-results';

type Panel = 'steam' | 'glass';

async function startFlight(page: Page, panel: Panel = 'steam') {
  await page.goto('/');
  await page.getByTestId('pick-kcfo-ils26').click();
  await page.getByTestId('start-vectors-final').check();
  await page.getByTestId(`panel-${panel}`).check();
  await page.getByTestId('fly').click();
  await expect(page.getByTestId(panel === 'glass' ? 'pfd' : 'hsi')).toBeVisible();
}

for (const vp of [
  { name: 'desktop', width: 1366, height: 860 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
]) {
  for (const panel of ['steam', 'glass'] as const)
    test(`flight screen (${panel}) fits ${vp.name} (${vp.width}×${vp.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await startFlight(page, panel);
      await page.getByTestId('map-toggle').click();
      await expect(page.getByTestId('moving-map')).toBeVisible();
      const m = await page.evaluate(() => {
        const pp = document.querySelector('.panel-pane')!;
        return {
          pageW: document.documentElement.scrollWidth,
          pageH: document.documentElement.scrollHeight,
          panelOverflowY: pp.scrollHeight - pp.clientHeight,
          panelOverflowX: pp.scrollWidth - pp.clientWidth,
        };
      });
      expect(m.pageW).toBeLessThanOrEqual(vp.width);
      expect(m.pageH).toBeLessThanOrEqual(vp.height);
      expect(m.panelOverflowX).toBeLessThanOrEqual(0);
      expect(m.panelOverflowY).toBeLessThanOrEqual(0);
      // Every control is on screen.
      for (const id of [
        'btn-AP',
        'btn-APR',
        'knob-hdg',
        'knob-power',
        'nav2-khz',
        'dme-src-2',
        'timer-reset',
      ]) {
        await expect(page.getByTestId(id)).toBeInViewport();
      }
      if (panel === 'glass') await expect(page.getByTestId('pfd')).toBeInViewport({ ratio: 1 });
      // The DME readout: the PFD's DME window on glass, the separate DME unit on steam.
      if (panel === 'glass') {
        await expect(page.getByTestId('pfd-dme')).toBeVisible();
        await expect(page.getByTestId('dme')).toHaveCount(0);
      } else {
        await expect(page.getByTestId('dme')).toBeInViewport({ ratio: 1 });
        await expect(page.getByTestId('dme-value')).toBeVisible();
      }
      await page.screenshot({ path: `${SHOT_DIR}/flight-${panel}-${vp.name}.png` });
    });
}

async function pageSize(page: Page) {
  return page.evaluate(() => ({
    pageW: document.documentElement.scrollWidth,
    pageH: document.documentElement.scrollHeight,
  }));
}

for (const vp of [
  { name: 'desktop', width: 1366, height: 860 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
]) {
  test(`home screen fits ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await expect(page.getByTestId('how-to-fly')).toBeVisible();
    const m = await pageSize(page);
    expect(m.pageW).toBeLessThanOrEqual(vp.width);
    expect(m.pageH).toBeLessThanOrEqual(vp.height);
    const cards = page.locator('[data-testid^="pick-"]');
    expect(await cards.count()).toBeGreaterThan(0);
    for (const card of await cards.all()) await expect(card).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('how-to-fly')).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('build-stamp')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `${SHOT_DIR}/home-${vp.name}.png` });
  });

  test(`briefing screen fits ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.getByTestId('pick-kcfo-ils26').click();
    await expect(page.getByTestId('fly')).toBeVisible();
    const m = await pageSize(page);
    expect(m.pageW).toBeLessThanOrEqual(vp.width);
    expect(m.pageH).toBeLessThanOrEqual(vp.height);
    await expect(page.getByTestId('fly')).toBeInViewport({ ratio: 1 });
    // The chart viewer's Fit still brings the plate back to the pane width.
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await expect(page.locator('.chart-zoom')).toHaveText('100%');
    const fit = await page.evaluate(() => {
      const box = document.querySelector('.chart-box')!.getBoundingClientRect();
      const img = document.querySelector('.chart-box img')!.getBoundingClientRect();
      return { boxW: box.width, imgW: img.width, left: img.left - box.left };
    });
    expect(fit.imgW).toBeLessThanOrEqual(fit.boxW + 1);
    expect(Math.abs(fit.left)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOT_DIR}/briefing-${vp.name}.png` });
  });
}

for (const panel of ['steam', 'glass'] as const)
  test(`renders at display rate (${panel}); the sim keeps up at 4×`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1366, height: 860 });
    await startFlight(page, panel);
    await page.getByTestId('btn-AP').click();
    await page.getByTestId('speed-4').click();
    const r = await page.evaluate(async () => {
      const tickOf = () => Number(document.querySelector('.flight')!.getAttribute('data-tick'));
      await new Promise((res) => setTimeout(res, 500));
      const t0 = performance.now();
      const k0 = tickOf();
      let frames = 0;
      let worst = 0;
      let last = t0;
      await new Promise<void>((res) => {
        const f = (now: number) => {
          frames++;
          worst = Math.max(worst, now - last);
          last = now;
          if (now - t0 < 5000) requestAnimationFrame(f);
          else res();
        };
        requestAnimationFrame(f);
      });
      const secs = (performance.now() - t0) / 1000;
      return { fps: frames / secs, worstFrameMs: worst, stepsPerSec: (tickOf() - k0) / secs };
    });
    const msg = `${panel}: fps ${r.fps.toFixed(1)}, worst frame ${r.worstFrameMs.toFixed(1)} ms, sim ${r.stepsPerSec.toFixed(1)} steps/s at 4× (target 80)`;
    console.log(msg);
    info.annotations.push({ type: 'performance', description: msg });
    expect(r.fps).toBeGreaterThanOrEqual(55);
    expect(r.stepsPerSec).toBeGreaterThanOrEqual(80 * 0.95);
  });
