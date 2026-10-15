// Moving pads in edit mode: a mouse drags, a finger rests and then drags.

import { test, expect, openBoard, pad, showSounds } from './helpers.js';

/** The pad in this place on the board, counted from the top left. */
function slot(page, i) {
  return page.locator('#grid .pad').nth(i);
}

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
    await expectLayout(page, ['Gunshot', 'Crickets ambiance', 'Sexy', '']);

    await drag(page, pad(page, 'Gunshot'), slot(page, 4));
    await expectLayout(page, ['', 'Crickets ambiance', 'Sexy', '', 'Gunshot']);
    await expect(page.locator('#grid .pad--playing')).toHaveCount(0);

    await page.reload();
    await expectLayout(page, ['', 'Crickets ambiance', 'Sexy', '', 'Gunshot']);
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
    await drag(page, pad(page, 'Gunshot'), slot(page, 4));
    await expectLayout(page, ['', 'Crickets ambiance', 'Sexy', '', 'Gunshot']);
    await page.reload();
    await expectLayout(page, ['', 'Crickets ambiance', 'Sexy', '', 'Gunshot']);
  });

  test('a pad dragged onto another swaps places with it', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();

    await drag(page, pad(page, 'Crickets ambiance'), pad(page, 'Sexy'));
    await expectLayout(page, ['Gunshot', 'Sexy', 'Crickets ambiance']);
  });

  test('a press without a move plays the pad instead', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();
    const crickets = pad(page, 'Crickets ambiance');
    const at = await centre(crickets);

    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 2, at.y + 2);
    await page.mouse.up();
    await expect(crickets).toHaveClass(/pad--playing/);
    await expectLayout(page, ['Gunshot', 'Crickets ambiance', 'Sexy']);
  });

  test('a pad dragged onto the folder comes off the board, and its sound stays', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();
    await showSounds(page);
    await page.locator('#lib .tree__name', { hasText: 'default' }).click();
    const row = page.locator('#lib .lib__item', { hasText: 'sexy' });
    await expect(row).toHaveClass(/lib__item--used/);

    await drag(page, pad(page, 'Sexy'), page.locator('#lib'));
    await expect(page.locator('#toast')).toHaveText(/^sexy is off the board\. The sound is still under Sounds\.$/i);
    await expectLayout(page, ['Gunshot', 'Crickets ambiance', '']);
    await expect(row).toBeVisible();
    await expect(row).not.toHaveClass(/lib__item--used/);
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

  async function holdAndDrag(page, from, to) {
    const hand = await finger(page);
    const a = await centre(from);
    const b = await centre(to);
    await hand.down(a);
    // Resting picks the pad up.
    await expect(from).toHaveClass(/pad--dragging/);
    for (let n = 1; n <= 8; n++) {
      await hand.move({ x: a.x + ((b.x - a.x) * n) / 8, y: a.y + ((b.y - a.y) * n) / 8 });
    }
    await hand.up();
  }

  test('a pad held and dragged to an empty place moves there, and stays after a reload', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();

    await holdAndDrag(page, pad(page, 'Gunshot'), slot(page, 4));
    await expectLayout(page, ['', 'Crickets ambiance', 'Sexy', '', 'Gunshot']);

    await page.reload();
    await expectLayout(page, ['', 'Crickets ambiance', 'Sexy', '', 'Gunshot']);
  });

  test('a pad held and dragged onto another swaps places with it', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();

    await holdAndDrag(page, pad(page, 'Crickets ambiance'), pad(page, 'Sexy'));
    await expectLayout(page, ['Gunshot', 'Sexy', 'Crickets ambiance']);
  });

  test('a finger that moves at once scrolls instead of picking the pad up', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();
    const crickets = pad(page, 'Crickets ambiance');
    const hand = await finger(page);
    const a = await centre(crickets);
    const b = await centre(slot(page, 4));

    await hand.down(a);
    await hand.move({ x: a.x, y: a.y + 20 });
    await hand.move(b);
    // Well past the time a resting finger takes to pick a pad up, it has not.
    const started = Date.now();
    await expect.poll(async () => {
      if (await crickets.evaluate((el) => el.classList.contains('pad--dragging'))) return 'picked up';
      return Date.now() - started > 1000 ? 'left alone' : 'waiting';
    }, { intervals: [100] }).toBe('left alone');
    await hand.up();
    await expectLayout(page, ['Gunshot', 'Crickets ambiance', 'Sexy', '', '']);
  });

  test('a pad held and dragged onto the bar at the bottom comes off the board', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();

    await holdAndDrag(page, pad(page, 'Sexy'), page.locator('#btnBrowse'));
    await expect(page.locator('#toast')).toHaveText(/^sexy is off the board\. The sound is still under Sounds\.$/i);
    await expectLayout(page, ['Gunshot', 'Crickets ambiance', '']);

    await showSounds(page);
    await page.locator('#lib .tree__name', { hasText: 'default' }).click();
    const row = page.locator('#lib .lib__item', { hasText: 'sexy' });
    await expect(row).toBeVisible();
    await expect(row).not.toHaveClass(/lib__item--used/);
  });
});
