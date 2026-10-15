// Running the show: the first board, firing pads, stopping them.

import { test, expect, BUNDLED_TITLES, openBoard, pad } from './helpers.js';

test('the first launch lays out the sounds that ship with the board', async ({ page }) => {
  await openBoard(page);
  for (const title of BUNDLED_TITLES) await expect(pad(page, title)).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('A board to start with. Add files when you have your own.');
  await expect(page.locator('#btnStop')).toBeDisabled();
});

test('tapping a pad plays it, and Stop takes it out', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets ambiance');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeEnabled();

  await page.locator('#btnStop').click();
  await expect(crickets).not.toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeDisabled();
});

test('Escape cuts everything dead', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets ambiance');
  const sexy = pad(page, 'Sexy');

  await crickets.click();
  await sexy.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await expect(sexy).toHaveClass(/pad--playing/);

  await page.keyboard.press('Escape');
  await expect(page.locator('#grid .pad--playing')).toHaveCount(0);
  await expect(page.locator('#btnStop')).toBeDisabled();
});

test('the master volume follows its slider', async ({ page }) => {
  await openBoard(page);
  await page.locator('#master').fill('35');
  await expect(page.locator('#masterValue')).toHaveText('35');
});

/** Change a pad's settings in its sheet, then go back to running the show. */
async function setUpPad(page, title, fields) {
  await page.locator('#btnEdit').click();
  await pad(page, title).locator('.pad__pencil').click();
  for (const [id, value] of Object.entries(fields)) await page.locator(`#${id}`).fill(value);
  await page.locator('#padSave').click();
  await expect(page.locator('#padEditor')).toBeHidden();
  await page.locator('#btnEdit').click();
  await expect(page.locator('#btnEdit')).toHaveAttribute('aria-pressed', 'false');
}

test('Stop greys out as soon as everything is fading out', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets ambiance');
  const sexy = pad(page, 'Sexy');
  await crickets.click();
  await sexy.click();
  await expect(page.locator('#grid .pad--playing')).toHaveCount(2);

  // The fade out takes 1.5 s; the button must not wait for it.
  await page.locator('#btnStop').click();
  await expect(page.locator('#btnStop')).toBeDisabled({ timeout: 500 });
  await expect(page.locator('#grid .pad--playing')).toHaveCount(0);
});

test('a pad tapped while it fades out starts again, and keeps playing', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets ambiance');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await crickets.click();
  await expect(crickets).not.toHaveClass(/pad--playing/);

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeEnabled();
  // Well past the end of the fade it interrupted, it is still running.
  await expect(crickets.locator('.pad__time')).toHaveText('-0:23', { timeout: 6000 });
  await expect(crickets).toHaveClass(/pad--playing/);
});

test('a pad tapped after Stop, during the fade, starts again', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets ambiance');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await page.locator('#btnStop').click();
  await expect(crickets).not.toHaveClass(/pad--playing/);

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
});

test('a pad tapped while it fades in stops', async ({ page }) => {
  await openBoard(page);
  await setUpPad(page, 'Crickets ambiance', { padFadeIn: '3' });
  const crickets = pad(page, 'Crickets ambiance');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await crickets.click();
  await expect(crickets).not.toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeDisabled();
});

test('a pad fading towards its stop point still answers a tap by stopping', async ({ page }) => {
  await openBoard(page);
  // Stop at 4 s with a 3 s fade: the pad starts fading on its own after 1 s.
  await setUpPad(page, 'Crickets ambiance', { padEnd: '4', padFadeOut: '3' });
  const crickets = pad(page, 'Crickets ambiance');

  await crickets.click();
  await expect(crickets.locator('.pad__time')).toHaveText('-0:02', { timeout: 4000 });
  await expect(crickets).toHaveClass(/pad--playing/);

  await crickets.click();
  await expect(crickets).not.toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeDisabled();
});

test('holding a pad’s key is one tap', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets ambiance');
  const key = (await crickets.locator('.pad__key').textContent()).trim();

  // Every keydown after the first is a key repeat.
  for (let n = 0; n < 4; n++) await page.keyboard.down(key);
  await page.keyboard.up(key);
  await expect(crickets).toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeEnabled();
});
