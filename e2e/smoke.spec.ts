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
  // Build stamp: "IFRSim v1.2.3[-beta.1] · <commit or dev>[ · date]".
  await expect(page.getByTestId('build-stamp')).toHaveText(
    /^IFRSim v\d+\.\d+\.\d+(-[\w.]+)? · \S+/,
  );
  // Where to report bugs and ask for enhancements: a link to the repo's issues, in a new tab.
  const issues = page.getByTestId('report-issues');
  await expect(issues).toContainText(/bug/i);
  const link = issues.getByRole('link');
  await expect(link).toHaveAttribute('href', 'https://github.com/crawfoco/IFRSim/issues');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  expect(externalRequests).toEqual([]);
});
