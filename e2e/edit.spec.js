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
