// Building a board: edit mode, the pad sheet, emptying, adding sounds.

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

test('dropping several sounds at once adds every one of them', async ({ page }) => {
  // A real drop of files cannot be made from a test. This one stands in for
  // Chromium's: each dropped item gives a real file handle, but only while the
  // drop is being handled; asked for later, it gives nothing, as Chromium does.
  await page.addInitScript(() => {
    window.dropOpen = false;
    DataTransferItem.prototype.getAsFileSystemHandle = function () {
      if (!window.dropOpen) return Promise.resolve(null);
      const file = this.getAsFile();
      return (async () => {
        const root = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle(file.name, { create: true });
        const out = await handle.createWritable();
        await out.write(file);
        await out.close();
        return handle;
      })();
    };
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await showSounds(page);

  const wav = silentWav().toString('base64');
  await page.evaluate((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    for (const name of ['door slam.wav', 'phone ring.wav']) {
      dt.items.add(new File([bytes], name, { type: 'audio/wav' }));
    }
    window.dropOpen = true;
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    window.dropOpen = false;
  }, wav);

  await expect(page.locator('#lib .lib__item', { hasText: 'door slam' })).toBeVisible();
  await expect(page.locator('#lib .lib__item', { hasText: 'phone ring' })).toBeVisible();
});
