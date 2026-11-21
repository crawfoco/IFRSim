/**
 * Tuning from a laptop: type a frequency into the standby window, and a trackpad swipe on
 * a knob steps a few times rather than spinning the dial.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('pick-kcfo-ils26').click();
  await page.getByTestId('start-vectors-final').check();
  await page.getByTestId('fly').click();
  await expect(page.getByTestId('nav1-standby')).toHaveText('108.00');
});

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

test('a trackpad swipe on the kHz knob steps a few times, not once per event', async ({ page }) => {
  const box = (await page.getByTestId('nav1-khz').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // 40 small events, as a trackpad sends them: 200 px of scroll up.
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -5);
  const text = await page.getByTestId('nav1-standby').textContent();
  const steps = Math.round((Number(text) - 108) * 20);
  expect(steps).toBeGreaterThanOrEqual(1);
  expect(steps).toBeLessThanOrEqual(5);
});
