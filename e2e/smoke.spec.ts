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
  // Build stamp: "IFRSim v1.2.3 · <commit or dev>[ · date]".
  await expect(page.getByTestId('build-stamp')).toHaveText(/^IFRSim v\d+\.\d+\.\d+ · \S+/);
  expect(externalRequests).toEqual([]);
});
