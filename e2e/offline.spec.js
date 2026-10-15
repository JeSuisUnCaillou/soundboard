// The board has to work in a theatre whose wifi is not to be counted on.

import { test, expect, BUNDLED_TITLES, openBoard, pad } from './helpers.js';

test('once loaded, the board comes back with the network off', async ({ page, context }) => {
  await openBoard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The worker caches the shell as it installs; give it the page to control.
  await page.reload();
  await expect(page.locator('#grid .pad--filled')).toHaveCount(BUNDLED_TITLES.length);

  await context.setOffline(true);
  await page.reload();
  for (const title of BUNDLED_TITLES) await expect(pad(page, title)).toBeVisible();

  const crickets = pad(page, 'Crickets ambiance');
  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
});
