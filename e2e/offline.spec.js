// The board has to work in a theatre whose wifi is not to be counted on.

import { test, expect, BUNDLED_TITLES, openBoard, pad } from './helpers.js';

// Let context.route see and route the service worker's own requests, as it
// does the page's: that is how these tests make the wifi weak. In a browser of
// their own, since a worker seen this way crashes Chromium now and then once
// its context is gone, taking down whatever test runs next (#78). Setting a
// worker-scoped option gives this file its own worker process.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

test('once loaded, the board comes back with the network off', async ({ page, context }) => {
  await openBoard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The worker caches the shell as it installs; give it the page to control.
  await page.reload();
  await expect(page.locator('#grid .pad--filled')).toHaveCount(BUNDLED_TITLES.length);

  await context.setOffline(true);
  await page.reload();
  for (const title of BUNDLED_TITLES) await expect(pad(page, title)).toBeVisible();

  const crickets = pad(page, 'Crickets');
  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
});

/** Load the board and let the worker cache it and take the page over. */
async function underWorker(page) {
  await openBoard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator('#grid .pad--filled')).toHaveCount(BUNDLED_TITLES.length);
}

test('on wifi that never answers, the board opens from its copy', async ({ page, context }) => {
  await underWorker(page);
  // Requests that hang, as they do on a weak signal: neither an answer nor a failure.
  await context.route('**/*', () => {});
  await page.reload();
  for (const title of BUNDLED_TITLES) await expect(pad(page, title)).toBeVisible({ timeout: 10000 });
});

test('an error from the server does not replace the copy the board keeps', async ({ page, context }) => {
  await underWorker(page);
  await context.route('**/js/gels.js', (route) => route.fulfill({ status: 500, body: 'Server error' }));
  await page.reload();
  for (const title of BUNDLED_TITLES) await expect(pad(page, title)).toBeVisible();

  await context.unroute('**/js/gels.js');
  await context.setOffline(true);
  await page.reload();
  for (const title of BUNDLED_TITLES) await expect(pad(page, title)).toBeVisible();
});

test('offline, a file the board does not have fails instead of coming back as the page', async ({ page, context }) => {
  await underWorker(page);
  await context.route('**/*', (route) => route.abort('internetdisconnected'));
  const answer = await page.evaluate(() => fetch('js/nothing-here.js').then(
    (res) => res.headers.get('content-type'),
    () => 'failed',
  ));
  expect(answer).toBe('failed');
});

test('the board draws in its own fonts without asking another site for anything', async ({ page, baseURL }) => {
  const elsewhere = [];
  page.on('request', (req) => {
    if (new URL(req.url()).origin !== new URL(baseURL).origin) elsewhere.push(req.url());
  });
  await openBoard(page);
  const drawn = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some((f) => f.family.includes('IBM Plex Sans Condensed') && f.status === 'loaded');
  });
  expect(drawn).toBe(true);
  expect(elsewhere).toEqual([]);
});
