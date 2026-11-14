import { expect, test } from '@playwright/test';

test('home page renders offline with the training disclaimer', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (req) => {
    const host = new URL(req.url()).hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') externalRequests.push(req.url());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'IFRSim' })).toBeVisible();
  await expect(page.getByText(/not for navigation/i)).toBeVisible();
  expect(externalRequests).toEqual([]);
});
