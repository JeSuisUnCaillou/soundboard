// Moving pads in edit mode, by mouse and by finger: press and move, and the pad comes along.

import { test, expect, makeRoom, openBoard, pad, showSounds } from './helpers.js';

/** The pad in this place on the board, counted from the top left. */
function slot(page, i) {
  return page.locator('#grid .pad').nth(i);
}

/** The first board is full: take Sting off it, leaving its place, the fourth, empty. */
async function centre(locator) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The board as it is laid out: each place's sound, or '' when empty. */
async function expectLayout(page, titles) {
  for (const [i, title] of titles.entries()) {
    if (title) await expect(slot(page, i)).toContainText(title, { ignoreCase: true });
    else await expect(slot(page, i)).toHaveClass(/pad--empty/);
  }
}

/** The place to drop a pad off the board is marked, with its label in the middle. */
async function expectDropZoneMarked(zone) {
  await expect(zone).toHaveClass(/drop--ready/);
  await expect(zone).not.toHaveClass(/drop--off/);
  await expect.poll(() => zone.evaluate((el) => getComputedStyle(el, '::after').content))
    .toBe('"Drop to take it off the board"');
}

test.describe('with a mouse', () => {
  test.skip(({ hasTouch }) => hasTouch, 'a phone has a finger, not a mouse');

  async function drag(page, from, to) {
    const a = await centre(from);
    const b = await centre(to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
  }

  test('a pad dragged to an empty place moves there, and stays after a reload', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();
    await makeRoom(page);
    await expectLayout(page, ['Gunshot', 'Explosion', 'Phone', '']);

    await drag(page, pad(page, 'Gunshot'), slot(page, 3));
    await expectLayout(page, ['', 'Explosion', 'Phone', 'Gunshot']);
    await expect(page.locator('#grid .pad--playing')).toHaveCount(0);

    await page.reload();
    await expectLayout(page, ['', 'Explosion', 'Phone', 'Gunshot']);
  });

  test('a pad moved is kept even if the page then goes without a word', async ({ page }) => {
    // No beforeunload, pagehide or visibilitychange to save from, as when a
    // page is torn down at once.
    await page.addInitScript(() => {
      for (const target of [window, document]) {
        const add = target.addEventListener;
        target.addEventListener = function (type, ...rest) {
          if (['beforeunload', 'pagehide', 'visibilitychange'].includes(type)) return undefined;
          return add.call(this, type, ...rest);
        };
      }
    });
    await openBoard(page);
    await page.locator('#btnEdit').click();
    await makeRoom(page);
    await drag(page, pad(page, 'Gunshot'), slot(page, 3));
    await expectLayout(page, ['', 'Explosion', 'Phone', 'Gunshot']);
    await page.reload();
    await expectLayout(page, ['', 'Explosion', 'Phone', 'Gunshot']);
  });

  test('a pad dragged onto another swaps places with it', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();

    await drag(page, pad(page, 'Crickets'), pad(page, 'Romance'));
    await expectLayout(page, ['Gunshot', 'Explosion', 'Phone', 'Sting', 'Storm', 'Romance', 'Birds', 'Suspense', 'Crickets']);
  });

  test('a press without a move plays the pad instead', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();
    const crickets = pad(page, 'Crickets');
    const at = await centre(crickets);

    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 2, at.y + 2);
    await page.mouse.up();
    await expect(crickets).toHaveClass(/pad--playing/);
    await expectLayout(page, ['Gunshot', 'Explosion', 'Phone', 'Sting', 'Storm', 'Crickets', 'Birds', 'Suspense', 'Romance']);
  });

  test('a pad dragged onto the folder comes off the board, and its sound stays', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();
    await showSounds(page);
    await page.locator('#lib .tree__name', { hasText: 'default' }).click();
    const row = page.locator('#lib .lib__item', { hasText: 'romance' });
    await expect(row).toHaveClass(/lib__item--used/);

    await drag(page, pad(page, 'Romance'), page.locator('#lib'));
    await expect(page.locator('#toast')).toHaveText(/^romance is off the board\. The sound is still under Sounds\.$/i);
    await expectLayout(page, ['Gunshot', 'Explosion', 'Phone', 'Sting', 'Storm', 'Crickets', 'Birds', 'Suspense', '']);
    await expect(row).toBeVisible();
    await expect(row).not.toHaveClass(/lib__item--used/);
  });

  test('picking a pad up marks the folder as the place to drop it off, before it gets there', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();
    const zone = page.locator('#book');
    const phone = pad(page, 'Phone');
    const a = await centre(phone);

    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 10, a.y);
    await expect(phone).toHaveClass(/pad--dragging/);
    await expectDropZoneMarked(zone);

    const b = await centre(page.locator('#lib'));
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await expect(zone).toHaveClass(/drop--off/);
    await page.mouse.move(a.x, a.y, { steps: 4 });
    await expectDropZoneMarked(zone);

    await page.mouse.up();
    await expect(phone).not.toHaveClass(/pad--dragging/);
    await expect(zone).not.toHaveClass(/drop--ready/);
    await expectLayout(page, ['Gunshot', 'Explosion', 'Phone', 'Sting', 'Storm', 'Crickets', 'Birds', 'Suspense', 'Romance']);
  });
});

test.describe('with a finger', () => {
  test.skip(({ hasTouch }) => !hasTouch, 'a desktop has a mouse, not a finger');

  /** A finger on the screen, through the browser's own touch input. */
  async function finger(page) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, at) => cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: at ? [{ x: at.x, y: at.y }] : [],
    });
    return {
      down: (at) => touch('touchStart', at),
      move: (at) => touch('touchMove', at),
      up: () => touch('touchEnd'),
    };
  }

  async function fingerDrag(page, from, to) {
    const hand = await finger(page);
    const a = await centre(from);
    const b = await centre(to);
    await hand.down(a);
    for (let n = 1; n <= 8; n++) {
      await hand.move({ x: a.x + ((b.x - a.x) * n) / 8, y: a.y + ((b.y - a.y) * n) / 8 });
    }
    await hand.up();
  }

  test('a pad dragged by a finger to an empty place moves there, and stays after a reload', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();
    await makeRoom(page);

    await fingerDrag(page, pad(page, 'Gunshot'), slot(page, 3));
    await expectLayout(page, ['', 'Explosion', 'Phone', 'Gunshot']);

    await page.reload();
    await expectLayout(page, ['', 'Explosion', 'Phone', 'Gunshot']);
  });

  test('a pad dragged by a finger onto another swaps places with it', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();

    await fingerDrag(page, pad(page, 'Crickets'), pad(page, 'Romance'));
    await expectLayout(page, ['Gunshot', 'Explosion', 'Phone', 'Sting', 'Storm', 'Romance', 'Birds', 'Suspense', 'Crickets']);
  });

  test('a finger that moves at once takes the pad along, with no wait', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();
    await makeRoom(page);
    const crickets = pad(page, 'Crickets');
    const hand = await finger(page);
    const a = await centre(crickets);

    await hand.down(a);
    await hand.move({ x: a.x, y: a.y - 20 });
    await expect(crickets).toHaveClass(/pad--dragging/);
    await hand.move(await centre(slot(page, 3)));
    await hand.up();
    await expectLayout(page, ['Gunshot', 'Explosion', 'Phone', 'Crickets', 'Storm', '']);
  });

  test('a finger that touches a pad and lifts plays it', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();
    const crickets = pad(page, 'Crickets');
    const a = await centre(crickets);

    await page.touchscreen.tap(a.x, a.y);
    await expect(crickets).toHaveClass(/pad--playing/);
    await expectLayout(page, ['Gunshot', 'Explosion', 'Phone', 'Sting', 'Storm', 'Crickets', 'Birds', 'Suspense', 'Romance']);
  });

  test('a pad dragged by a finger onto the bar at the bottom comes off the board', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();

    await fingerDrag(page, pad(page, 'Romance'), page.locator('#btnBrowse'));
    await expect(page.locator('#toast')).toHaveText(/^romance is off the board\. The sound is still under Sounds\.$/i);
    await expectLayout(page, ['Gunshot', 'Explosion', 'Phone', 'Sting', 'Storm', 'Crickets', 'Birds', 'Suspense', '']);

    await showSounds(page);
    await page.locator('#lib .tree__name', { hasText: 'default' }).click();
    const row = page.locator('#lib .lib__item', { hasText: 'romance' });
    await expect(row).toBeVisible();
    await expect(row).not.toHaveClass(/lib__item--used/);
  });

  test('picking a pad up marks the bar at the bottom as the place to drop it off, before it gets there', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();
    // The whole bar, not just the button in it.
    const zone = page.locator('#transport');
    const phone = pad(page, 'Phone');
    const hand = await finger(page);
    const a = await centre(phone);

    await hand.down(a);
    await hand.move({ x: a.x, y: a.y + 20 });
    await expect(phone).toHaveClass(/pad--dragging/);
    await expectDropZoneMarked(zone);

    const bar = await zone.boundingBox();
    await hand.move({ x: bar.x + 4, y: bar.y + 4 });
    await expect(zone).toHaveClass(/drop--off/);
    await hand.move(a);
    await expectDropZoneMarked(zone);

    await hand.up();
    await expect(phone).not.toHaveClass(/pad--dragging/);
    await expect(zone).not.toHaveClass(/drop--ready/);
    await expectLayout(page, ['Gunshot', 'Explosion', 'Phone', 'Sting', 'Storm', 'Crickets', 'Birds', 'Suspense', 'Romance']);
  });
});
