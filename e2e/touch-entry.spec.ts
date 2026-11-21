/**
 * Setting the panel on a touch screen (iPad landscape): tap a value window, use the
 * popover's keypad and step buttons without the system keyboard, and the panel still fits
 * with the bigger touch targets.
 */
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });

async function fly(page: Page, panel: 'steam' | 'glass') {
  await page.goto('/');
  await page.getByTestId('pick-kcfo-ils26').tap();
  await page.getByTestId('start-vectors-final').check();
  await page.getByTestId(`panel-${panel}`).check();
  await page.getByTestId('fly').tap();
  await expect(page.getByTestId('nav1-standby')).toHaveText('108.00');
}

/** Tap a value window, then keys, then Set. */
async function keyIn(page: Page, testId: string, keys: string) {
  await page.getByTestId(`${testId}-edit`).tap();
  await expect(page.getByTestId(`${testId}-pop`)).toBeInViewport({ ratio: 1 });
  for (const k of keys) await page.getByTestId(`${testId}-key-${k === '.' ? 'dot' : k}`).tap();
  await page.getByTestId(`${testId}-set`).tap();
  await expect(page.getByTestId(`${testId}-pop`)).toHaveCount(0);
}

for (const panel of ['steam', 'glass'] as const)
  test(`${panel}: keypad sets frequency, heading and course; no system keyboard`, async ({
    page,
  }) => {
    await fly(page, panel);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

    await page.getByTestId('nav1-standby-edit').tap();
    await expect(page.getByTestId('nav1-standby-input')).toHaveAttribute('inputmode', 'none');
    // On touch the knob hint isn't shown: the step buttons are the touch way to step.
    await expect(page.getByTestId('nav1-standby-pop')).not.toContainText('Knobs:');
    await page.getByTestId('nav1-standby-cancel').tap();

    await keyIn(page, 'nav1-standby', '109.3');
    await expect(page.getByTestId('nav1-standby')).toHaveText('109.30');

    const hdg = panel === 'glass' ? 'knob-hdg-sel' : 'ann-hdg-sel';
    await keyIn(page, hdg, '263');
    await expect(page.getByTestId(hdg)).toContainText('263');

    const crs = panel === 'glass' ? 'knob-crs-sel' : 'knob-crs1-sel';
    await keyIn(page, crs, '263');
    await expect(page.getByTestId(crs)).toHaveText('263');

    // Backspace, and an invalid entry stays open, marked.
    await page.getByTestId(`${crs}-edit`).tap();
    for (const k of ['4', '0', '0', 'back', 'back', '5'])
      await page.getByTestId(`${crs}-key-${k}`).tap();
    await expect(page.getByTestId(`${crs}-input`)).toHaveValue('45');
    await page.getByTestId(`${crs}-key-9`).tap();
    await page.getByTestId(`${crs}-set`).tap();
    await expect(page.getByTestId(`${crs}-input`)).toHaveAttribute('aria-invalid', 'true');
    // A tap outside drops the invalid entry.
    await page.getByTestId('nav1-active').tap();
    await expect(page.getByTestId(`${crs}-pop`)).toHaveCount(0);
    await expect(page.getByTestId(crs)).toHaveText('263');

    // Step buttons and heading sync.
    await page.getByTestId(`${hdg}-edit`).tap();
    await page.getByTestId(`${hdg}-step-p10`).tap();
    await expect(page.getByTestId(hdg)).toContainText('273');
    await page.getByTestId(`${hdg}-step-sync`).tap();
    await expect(page.getByTestId(hdg)).toContainText('330');
  });

for (const panel of ['steam', 'glass'] as const)
  test(`${panel}: fits 1024×768 with touch targets; small controls take a 44 px touch`, async ({
    page,
  }) => {
    await fly(page, panel);
    const m = await page.evaluate(() => {
      const pp = document.querySelector('.panel-pane')!;
      return {
        pageW: document.documentElement.scrollWidth,
        pageH: document.documentElement.scrollHeight,
        panelOverflowY: pp.scrollHeight - pp.clientHeight,
        panelOverflowX: pp.scrollWidth - pp.clientWidth,
      };
    });
    expect(m.pageW).toBeLessThanOrEqual(1024);
    expect(m.pageH).toBeLessThanOrEqual(768);
    expect(m.panelOverflowX).toBeLessThanOrEqual(0);
    expect(m.panelOverflowY).toBeLessThanOrEqual(0);
    // A touch just outside a small control still lands on it (the invisible touch ring).
    const hitsNear = async (id: string, dx: number, dy: number) => {
      const b = (await page.getByTestId(id).boundingBox())!;
      const x = b.x + b.width / 2 + Math.sign(dx) * (b.width / 2 + Math.abs(dx));
      const y = b.y + b.height / 2 + Math.sign(dy) * (b.height / 2 + Math.abs(dy));
      return page.evaluate(
        ([x, y, id]) => !!document.elementFromPoint(x, y)?.closest(`[data-testid="${id}"]`),
        [x, y, id] as const,
      );
    };
    expect(await hitsNear('nav1-khz', 3, 0)).toBe(true);
    expect(await hitsNear('nav1-mhz', -3, 0)).toBe(true);
    expect(await hitsNear('nav1-ident', 0, 8)).toBe(true);
    expect(await hitsNear('nav1-swap', 0, 4)).toBe(true);
    // MHz and kHz knobs: a finger between them is unambiguous (the rings don't overlap).
    const mhz = (await page.getByTestId('nav1-mhz').boundingBox())!;
    const khz = (await page.getByTestId('nav1-khz').boundingBox())!;
    expect(khz.x - (mhz.x + mhz.width)).toBeGreaterThanOrEqual(10);
  });
