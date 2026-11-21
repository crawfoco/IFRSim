/**
 * Setting the panel with a mouse or trackpad: type a frequency, heading or course into its
 * window's popover or use its step buttons; a trackpad swipe on a knob steps a few times
 * rather than spinning the dial, and a scroll that passes over a knob doesn't turn it.
 * Touch is in touch-entry.spec.ts.
 */
import { expect, test, type Page } from '@playwright/test';

async function fly(page: Page, panel: 'steam' | 'glass' = 'steam') {
  await page.goto('/');
  await page.getByTestId('pick-kcfo-ils26').click();
  await page.getByTestId('start-vectors-final').check();
  if (panel === 'glass') await page.getByTestId('panel-glass').check();
  await page.getByTestId('fly').click();
  await expect(page.getByTestId('nav1-standby')).toHaveText('108.00');
}

/** Click a value window, type into it and press Enter. */
async function typeInto(page: Page, testId: string, text: string) {
  await page.getByTestId(`${testId}-edit`).click();
  await expect(page.getByTestId(`${testId}-input`)).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test.describe('steam panel', () => {
  test.beforeEach(({ page }) => fly(page));

  test('click the standby window, type a frequency, Enter sets it', async ({ page }) => {
    await page.getByTestId('nav1-standby-edit').click();
    const input = page.getByTestId('nav1-standby-input');
    await expect(input).toBeFocused();
    // The current value is selected, so typing replaces it.
    await page.keyboard.type('109.3');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('nav1-standby')).toHaveText('109.30');
    // Focus goes back to the window, so Enter opens it again from the keyboard.
    await expect(page.getByTestId('nav1-standby-edit')).toBeFocused();
    await page.getByTestId('nav1-swap').click();
    await expect(page.getByTestId('nav1-active')).toHaveText('109.30');
  });

  test('an invalid entry stays marked; Escape cancels; leaving the field sets a valid one', async ({
    page,
  }) => {
    await page.getByTestId('nav2-standby-edit').click();
    const input = page.getByTestId('nav2-standby-input');
    await page.keyboard.type('113.87');
    await page.keyboard.press('Enter');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('nav2-standby')).toHaveText('108.00');

    await page.getByTestId('nav2-standby-edit').click();
    await page.keyboard.type('11385');
    await page.getByTestId('nav1-active').click(); // click away
    await expect(page.getByTestId('nav2-standby')).toHaveText('113.85');
  });

  test('a trackpad swipe on the kHz knob steps a few times, not once per event', async ({
    page,
  }) => {
    const box = (await page.getByTestId('nav1-khz').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // 40 small events, as a trackpad sends them: 200 px of scroll up.
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -5);
    const text = await page.getByTestId('nav1-standby').textContent();
    const steps = Math.round((Number(text) - 108) * 20);
    expect(steps).toBeGreaterThanOrEqual(1);
    expect(steps).toBeLessThanOrEqual(5);
  });

  test('type the selected heading and both courses', async ({ page }) => {
    await typeInto(page, 'ann-hdg-sel', '263');
    await expect(page.getByTestId('ann-hdg-sel')).toHaveText('263°');
    await typeInto(page, 'knob-crs1-sel', '263');
    await expect(page.getByTestId('knob-crs1-sel')).toHaveText('263');
    await expect(page.getByTestId('hsi').getByRole('img')).toHaveAccessibleName(/course 263/);
    await typeInto(page, 'knob-crs2-sel', '0');
    await expect(page.getByTestId('knob-crs2-sel')).toHaveText('360');
    // Out of range: marked, not set.
    await typeInto(page, 'knob-crs2-sel', '400');
    await expect(page.getByTestId('knob-crs2-sel-input')).toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('knob-crs2-sel')).toHaveText('360');
    // The knob tooltip tells how to take big steps.
    await expect(page.getByTestId('knob-crs1')).toHaveAttribute(
      'title',
      /Shift or Page Up\/Down: 10°/,
    );
  });
});

test.describe('steam panel, more', () => {
  test.beforeEach(({ page }) => fly(page));

  test('type the selected altitude; its steps move it 100 and 1,000 ft', async ({ page }) => {
    await expect(page.getByTestId('ann-alt-sel')).toHaveText('8,000');
    await typeInto(page, 'ann-alt-sel', '4500');
    await expect(page.getByTestId('ann-alt-sel')).toHaveText('4,500');
    await page.getByTestId('ann-alt-sel-edit').click();
    await page.getByTestId('ann-alt-sel-step-p1000').click();
    await page.getByTestId('ann-alt-sel-step-m100').click();
    await expect(page.getByTestId('ann-alt-sel')).toHaveText('5,400');
    // Off the hundreds: marked, not set.
    await page.keyboard.type('4550');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('ann-alt-sel-input')).toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('ann-alt-sel')).toHaveText('5,400');
  });

  test('after a rejected entry the next key starts a new one', async ({ page }) => {
    const input = page.getByTestId('nav1-standby-input');
    await page.getByTestId('nav1-standby-edit').click();
    await page.keyboard.type('113.87');
    await page.keyboard.press('Enter');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    // Typed on the keyboard: replaces, not appends.
    await page.keyboard.type('113.85');
    await expect(input).toHaveValue('113.85');
    await expect(input).not.toHaveAttribute('aria-invalid');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('nav1-standby')).toHaveText('113.85');

    // The keypad does the same, after Set.
    await page.getByTestId('nav1-standby-edit').click();
    for (const k of ['1', '0', '7']) await page.getByTestId(`nav1-standby-key-${k}`).click();
    await page.getByTestId('nav1-standby-set').click();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await page.getByTestId('nav1-standby-key-1').click();
    await expect(input).toHaveValue('1');
    // Delete after a rejected entry clears it.
    await page.keyboard.press('Enter'); // "1" is rejected too
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await page.getByTestId('nav1-standby-key-back').click();
    await expect(input).toHaveValue('');
  });

  test('frequency steps: MHz on the left, kHz on the right', async ({ page }) => {
    await page.getByTestId('nav1-standby-edit').click();
    const lefts = [];
    for (const id of ['mhz-down', 'mhz-up', 'khz-down', 'khz-up'])
      lefts.push((await page.getByTestId(`nav1-standby-step-${id}`).boundingBox())!.x);
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts);
  });
});

test('glass panel: heading, altitude and course windows under the knobs', async ({ page }) => {
  await fly(page, 'glass');
  await typeInto(page, 'knob-hdg-sel', '293');
  await expect(page.getByTestId('knob-hdg-sel')).toHaveText('293');
  await typeInto(page, 'knob-alt-sel', '6000');
  await expect(page.getByTestId('knob-alt-sel')).toHaveText('6,000');
  await typeInto(page, 'knob-crs-sel', '263');
  await expect(page.getByTestId('knob-crs-sel')).toHaveText('263');
});

test('popover step buttons act at once; Set closes; the knob hint is shown', async ({ page }) => {
  await fly(page);
  await page.getByTestId('ann-hdg-sel-edit').click();
  const pop = page.getByTestId('ann-hdg-sel-pop');
  await expect(pop).toBeInViewport({ ratio: 1 });
  await expect(pop).toContainText('Shift or Page Up/Down 10°');
  await page.getByTestId('ann-hdg-sel-step-m10').click();
  await page.getByTestId('ann-hdg-sel-step-m10').click();
  await page.getByTestId('ann-hdg-sel-step-p1').click();
  await expect(page.getByTestId('ann-hdg-sel')).toHaveText('311°'); // 330 − 20 + 1
  await expect(page.getByTestId('ann-hdg-sel-input')).toHaveValue('311');
  // Typing after a step replaces the value; focus stayed in the field.
  await page.keyboard.type('263');
  await page.getByTestId('ann-hdg-sel-set').click();
  await expect(pop).toHaveCount(0);
  await expect(page.getByTestId('ann-hdg-sel')).toHaveText('263°');

  await page.getByTestId('nav1-standby-edit').click();
  await page.getByTestId('nav1-standby-step-mhz-up').click();
  await page.getByTestId('nav1-standby-step-khz-up').click();
  await expect(page.getByTestId('nav1-standby')).toHaveText('109.05');
  await page.getByTestId('nav1-standby-cancel').click();
  await expect(page.getByTestId('nav1-standby-pop')).toHaveCount(0);
  await expect(page.getByTestId('nav1-standby')).toHaveText('109.05'); // steps already applied
});

test('a panel scroll that passes over a knob scrolls on instead of turning it', async ({
  page,
}) => {
  // Laptop height: the glass panel scrolls a little.
  await page.setViewportSize({ width: 1366, height: 700 });
  await fly(page, 'glass');
  const pane = page.locator('.panel-pane');
  const scrollTop = () => pane.evaluate((el) => el.scrollTop);
  const crs = page.getByTestId('knob-crs-sel');
  await expect(crs).toHaveText('360');
  const knob = (await page.getByTestId('knob-crs').boundingBox())!;
  const pfd = (await page.getByTestId('pfd').boundingBox())!;
  // Start scrolling over the PFD, then let the knob come under the pointer mid-gesture.
  await page.mouse.move(pfd.x + pfd.width / 2, pfd.y + pfd.height / 2);
  await page.mouse.wheel(0, 10);
  await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 10);
  await expect(crs).toHaveText('360');
  expect(await scrollTop()).toBeGreaterThan(0);
  // After a pause, a scroll on the knob turns it.
  await page.waitForTimeout(400);
  const k2 = (await page.getByTestId('knob-crs').boundingBox())!;
  await page.mouse.move(k2.x + k2.width / 2, k2.y + k2.height / 2);
  await page.mouse.wheel(0, -10);
  await expect(crs).toHaveText('001');
});

test('a trackpad pinch (Ctrl+wheel) over a knob does not turn it', async ({ page }) => {
  await fly(page);
  const box = (await page.getByTestId('knob-crs1').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -10);
  await page.keyboard.up('Control');
  await expect(page.getByTestId('knob-crs1-sel')).toHaveText('360');
});
