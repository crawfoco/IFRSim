/**
 * Setting the panel from a laptop: type a frequency, heading or course into its window,
 * and a trackpad swipe on a knob steps a few times rather than spinning the dial.
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

test('glass panel: heading and course windows under the knobs', async ({ page }) => {
  await fly(page, 'glass');
  await typeInto(page, 'knob-hdg-sel', '293');
  await expect(page.getByTestId('knob-hdg-sel')).toHaveText('293');
  await typeInto(page, 'knob-crs-sel', '263');
  await expect(page.getByTestId('knob-crs-sel')).toHaveText('263');
});
