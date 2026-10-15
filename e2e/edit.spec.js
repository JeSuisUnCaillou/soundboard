// Building a board: edit mode, the pad sheet, Board settings, emptying, adding sounds.

import { test, expect, BUNDLED_TITLES, openBoard, pad, showSounds, silentWav } from './helpers.js';

test('edit mode shows the folder and the board controls', async ({ page }) => {
  await openBoard(page);
  const edit = page.locator('#btnEdit');

  await edit.click();
  await expect(edit).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#btnSetup')).toBeVisible();

  await showSounds(page);
  await page.locator('#lib .tree__name', { hasText: 'default' }).click();
  await expect(page.locator('#lib .lib__item')).toHaveCount(BUNDLED_TITLES.length);
});

test('a pad renamed in its sheet keeps the name after a reload', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();

  await pad(page, 'Gunshot').locator('.pad__pencil').click();
  const sheet = page.locator('#padEditor');
  await expect(sheet).toBeVisible();
  await expect(page.locator('#padFileName')).toHaveText('gunshot.mp3');

  await page.locator('#padName').fill('Pistol, act two');
  await page.locator('#padSave').click();
  await expect(sheet).toBeHidden();
  await expect(pad(page, 'Pistol, act two')).toBeVisible();

  await page.reload();
  await expect(pad(page, 'Pistol, act two')).toBeVisible();
  await expect(page.locator('#btnEdit')).toHaveAttribute('aria-pressed', 'true');
});

test('emptying the board asks twice', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();
  const empty = page.locator('#btnEmpty');

  await empty.click();
  await expect(empty).toHaveText('Really empty it?');
  await expect(page.locator('#grid .pad--filled')).toHaveCount(BUNDLED_TITLES.length);

  await empty.click();
  await expect(page.locator('#grid .pad--filled')).toHaveCount(0);
  await expect(page.locator('#toast')).toHaveText('The board is empty. The sounds are still under Sounds.');
});

test('sounds added from the file picker land in the folder and can go on a pad', async ({ page }) => {
  // Take away the File System Access pickers, which a test cannot answer, so
  // the board falls back to the plain file input every other browser uses.
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await showSounds(page);

  await page.locator('#btnAdd').click();
  await expect(page.locator('#picker')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAddFiles').click();
  await (await chooser).setFiles({ name: 'door slam.wav', mimeType: 'audio/wav', buffer: silentWav() });

  const row = page.locator('#lib .lib__item', { hasText: 'door slam' });
  await expect(row).toBeVisible();
  await row.locator('.lib__add').click();
  await expect(pad(page, 'Door slam')).toHaveCount(1);
});

test('sounds added to an emptied board wait under Sounds instead of filling pads', async ({ page }) => {
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();
  const empty = page.locator('#btnEmpty');
  await empty.click();
  await empty.click();
  await expect(page.locator('#grid .pad--filled')).toHaveCount(0);

  await showSounds(page);
  await page.locator('#btnAdd').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAddFiles').click();
  await (await chooser).setFiles([
    { name: 'door slam.wav', mimeType: 'audio/wav', buffer: silentWav() },
    { name: 'phone ring.wav', mimeType: 'audio/wav', buffer: silentWav() },
  ]);

  await expect(page.locator('#toast')).toHaveText('2 sounds added, under Sounds in edit mode. The board is left as it is.');
  await expect(page.locator('#lib .lib__item', { hasText: 'door slam' })).toBeVisible();
  await expect(page.locator('#lib .lib__item', { hasText: 'phone ring' })).toBeVisible();
  await expect(page.locator('#grid .pad--filled')).toHaveCount(0);
});

test('Enter saves the pad sheet from the name, and presses whatever button has the focus', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();
  const sheet = page.locator('#padEditor');

  await pad(page, 'Gunshot').locator('.pad__pencil').click();
  await page.locator('#padName').fill('Pistol');
  await page.locator('#padCancel').focus();
  await page.keyboard.press('Enter');
  await expect(sheet).toBeHidden();
  await expect(pad(page, 'Gunshot')).toBeVisible();
  await expect(pad(page, 'Pistol')).toHaveCount(0);

  await pad(page, 'Gunshot').locator('.pad__pencil').click();
  await page.locator('#padName').fill('Pistol');
  await page.keyboard.press('Enter');
  await expect(sheet).toBeHidden();
  await expect(pad(page, 'Pistol')).toBeVisible();
});

test('Escape leaves Board settings without changing the board, and Done keeps the change', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();
  const sheet = page.locator('#setup');
  const pads = page.locator('#grid .pad');
  await expect(pads).toHaveCount(9);

  await page.locator('#btnSetup').click();
  await page.locator('#setRows').fill('4');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(pads).toHaveCount(9);

  await page.locator('#btnSetup').click();
  await expect(page.locator('#setRows')).toHaveValue('3');
  await page.locator('#setRows').fill('4');
  await page.locator('#setupDone').click();
  await expect(sheet).toBeHidden();
  await expect(pads).toHaveCount(12);
});

test('a key loaded in capitals from a board file is still taken from its pad when another pad wants it', async ({ page }) => {
  await openBoard(page);
  const board = {
    version: 3,
    cols: 3,
    rows: 3,
    pads: [
      { file: 'default/gunshot.mp3', name: 'Shot', key: 'Q' },
      { file: 'default/sexy.mp3', name: 'Song', key: 'w' },
    ],
  };
  await page.locator('#importFile').setInputFiles({
    name: 'show.soundboard.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(board)),
  });
  await expect(pad(page, 'Shot')).toBeVisible();

  await page.locator('#btnEdit').click();
  await pad(page, 'Song').locator('.pad__pencil').click();
  await page.locator('#padKey').fill('q');
  await page.locator('#padSave').click();
  await expect(page.locator('#toast')).toHaveText('Q was taken, so it moved to this pad.');
});

test('fewer columns and more rows at once keep every pad', async ({ page }) => {
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();

  // A fourth pad in the last place of the 3 × 3 board.
  await page.locator('#grid .pad--empty').last().click();
  // On a phone the waiting pad opens the sounds by itself.
  await expect(page.locator('#book')).toBeVisible();
  await page.locator('#btnAdd').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAddFiles').click();
  await (await chooser).setFiles({ name: 'door slam.wav', mimeType: 'audio/wav', buffer: silentWav() });
  await page.locator('#lib .lib__item', { hasText: 'door slam' }).locator('.lib__add').click();
  await expect(page.locator('#toast')).toContainText('is on row 3, column 3.');
  await expect(page.locator('#grid .pad--filled')).toHaveCount(4);

  // 2 × 6 has twelve places, room for all four.
  await page.locator('#btnSetup').click();
  await page.locator('#setCols').fill('2');
  await page.locator('#setRows').fill('6');
  await page.locator('#setupDone').click();
  await expect(page.locator('#setup')).toBeHidden();

  await expect(page.locator('#grid .pad')).toHaveCount(12);
  await expect(page.locator('#grid .pad--filled')).toHaveCount(4);
  await expect(page.locator('#toast')).not.toContainText('came off the board');
});

test('sounds added while others are being kept are kept too, past one that cannot be', async ({ page }) => {
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
    // The browser cannot read one file when it comes to copy it, as when it
    // changed on disk after it was opened; and copying another takes until
    // the test lets it finish, as a long file on a slow disk does.
    const put = IDBObjectStore.prototype.put;
    const complete = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
    const held = new Promise((resolve) => {
      window.finishCopying = resolve;
    });
    IDBObjectStore.prototype.put = function (value, ...rest) {
      const path = String(value && value.path);
      if (path.includes('broken')) throw new DOMException('The file could not be read.', 'NotReadableError');
      const req = put.call(this, value, ...rest);
      if (path.includes('rain')) {
        const tx = this.transaction;
        Object.defineProperty(tx, 'oncomplete', {
          set(fn) {
            complete.set.call(tx, (e) => held.then(() => fn(e)));
          },
        });
      }
      return req;
    };
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await showSounds(page);
  const add = async (files) => {
    await page.locator('#btnAdd').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#btnAddFiles').click();
    await (await chooser).setFiles(files.map((name) => ({ name, mimeType: 'audio/wav', buffer: silentWav() })));
  };

  await add(['rain.wav']);
  await expect(page.locator('#toast')).toHaveText('1 sound added, under Sounds in edit mode. The board is left as it is.');
  // Rain is still being copied when these arrive.
  await add(['broken.wav', 'door slam.wav']);
  await expect(page.locator('#toast')).toHaveText('2 sounds added, under Sounds in edit mode. The board is left as it is.');
  await page.evaluate(() => window.finishCopying());
  await expect(page.locator('#toast')).toHaveText(
    '“broken.wav” could not be kept in this browser. Next time it needs the folder again.',
  );

  await page.reload();
  await expect(page.locator('#grid .pad--filled')).toHaveCount(BUNDLED_TITLES.length);
  // The board comes back where the operator was: editing, with the sounds open.
  await expect(page.locator('#btnEdit')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#book')).toBeVisible();
  await expect(page.locator('#lib .lib__item', { hasText: 'rain' })).toBeVisible();
  await expect(page.locator('#lib .lib__item', { hasText: 'door slam' })).toBeVisible();
  await expect(page.locator('#lib .lib__item', { hasText: 'broken' })).toHaveCount(0);
});
