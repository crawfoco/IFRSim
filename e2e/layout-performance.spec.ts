/**
 * T30: the flight screen fits desktop and tablet-landscape viewports without scrolling
 * sideways, and it renders at display rate with the sim keeping up at 4×.
 * Measured numbers are attached to the test report (and printed).
 */
import { expect, test, type Page } from '@playwright/test';

const SHOT_DIR = process.env.LAYOUT_SHOTS ?? 'test-results';

async function startFlight(page: Page) {
  await page.goto('/');
  await page.getByTestId('pick-kcfo-ils26').click();
  await page.getByTestId('start-vectors-final').check();
  await page.getByTestId('fly').click();
  await expect(page.getByTestId('hsi')).toBeVisible();
}

for (const vp of [
  { name: 'desktop', width: 1366, height: 860 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
]) {
  test(`flight screen fits ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await startFlight(page);
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
    await page.screenshot({ path: `${SHOT_DIR}/flight-${vp.name}.png` });
  });
}

test('renders at display rate; the sim keeps up at 4×', async ({ page }, info) => {
  await page.setViewportSize({ width: 1366, height: 860 });
  await startFlight(page);
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
  const msg = `fps ${r.fps.toFixed(1)}, worst frame ${r.worstFrameMs.toFixed(1)} ms, sim ${r.stepsPerSec.toFixed(1)} steps/s at 4× (target 80)`;
  console.log(msg);
  info.annotations.push({ type: 'performance', description: msg });
  expect(r.fps).toBeGreaterThanOrEqual(55);
  expect(r.stepsPerSec).toBeGreaterThanOrEqual(80 * 0.95);
});
