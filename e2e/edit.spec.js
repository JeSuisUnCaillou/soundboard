// Building a board: edit mode, the pad sheet, Board settings, emptying, adding sounds.

import { readFileSync } from 'node:fs';
import { test, expect, BUNDLED_TITLES, openBoard, pad, showSounds, silentWav, isNarrow } from './helpers.js';

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
  await expect(pads).toHaveCount(12);

  await page.locator('#btnSetup').click();
  await page.locator('#setRows').fill('5');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(pads).toHaveCount(12);

  await page.locator('#btnSetup').click();
  await expect(page.locator('#setRows')).toHaveValue('4');
  await page.locator('#setRows').fill('5');
  await page.locator('#setupDone').click();
  await expect(sheet).toBeHidden();
  await expect(pads).toHaveCount(15);
});

test('a new board starts three columns by four rows', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await expect(page.locator('#grid .pad')).toHaveCount(12);
  await page.locator('#btnSetup').click();
  await expect(page.locator('#setCols')).toHaveValue('3');
  await expect(page.locator('#setRows')).toHaveValue('4');
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
  await expect(pad(page, 'Shot').locator('.pad__key')).toHaveText('');
});

test('a board file saved from Board settings holds the size just typed there', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await page.locator('#btnSetup').click();
  await page.locator('#setCols').fill('4');

  const download = page.waitForEvent('download');
  await page.locator('#btnExport').click();
  const saved = JSON.parse(readFileSync(await (await download).path(), 'utf8'));
  expect(saved.cols).toBe(4);
});

test('a cue dropped on a hit’s pad fades out on a second tap, as a cue does', async ({ page }) => {
  // Dragging from the tree needs the tree beside the board.
  test.skip(isNarrow(page), 'On a phone the tree covers the board, so nothing is dragged onto a pad.');
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await showSounds(page);
  await page.locator('#btnAdd').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAddFiles').click();
  await (await chooser).setFiles({ name: 'storm.wav', mimeType: 'audio/wav', buffer: silentWav(10) });

  await page.locator('#lib .lib__item', { hasText: 'storm' }).dragTo(pad(page, 'Gunshot'));
  await expect(pad(page, 'Gunshot').locator('.pad__time')).toHaveText('0:10');
  await pad(page, 'Gunshot').locator('.pad__pencil').click();
  await expect(page.locator('#padFileName')).toHaveText('storm.wav');
  await expect(page.locator('#padTap')).toHaveValue('fadeout');
});

test('a pad set up before its sound is open keeps what was chosen once the sound arrives', async ({ page }) => {
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
  });
  await openBoard(page);
  // A board whose sound is not open yet, so its length is not known.
  const board = { version: 3, cols: 3, rows: 3, pads: [{ file: 'door.wav', name: 'Door' }] };
  await page.locator('#importFile').setInputFiles({
    name: 'show.soundboard.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(board)),
  });
  await page.locator('#btnEdit').click();
  await pad(page, 'Door').locator('.pad__pencil').click();
  await page.locator('#padTap').selectOption('fadeout');
  await page.locator('#padSave').click();
  await expect(page.locator('#padEditor')).toBeHidden();

  // The sound turns up, and it is short: a hit, were it left to its length.
  await showSounds(page);
  await page.locator('#btnAdd').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAddFiles').click();
  await (await chooser).setFiles({ name: 'door.wav', mimeType: 'audio/wav', buffer: silentWav(1) });
  if (isNarrow(page)) await page.locator('#btnBrowseDone').click();
  await expect(pad(page, 'Door').locator('.pad__time')).toHaveText('0:01');

  await pad(page, 'Door').locator('.pad__pencil').click();
  await expect(page.locator('#padTap')).toHaveValue('fadeout');
});
