// Building a board: edit mode, the pad sheet, Board settings, board files, emptying, adding sounds.

import { readFile } from 'node:fs/promises';
import { test, expect, BUNDLED_TITLES, openBoard, pad, pencil, showSounds, silentWav, isNarrow } from './helpers.js';

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

  await pencil(page, 'Gunshot').click();
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

test('an empty board offers the default board back, set up as it was', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();
  const button = page.locator('#btnEmpty');

  await button.click();
  await button.click();
  await expect(page.locator('#grid .pad--filled')).toHaveCount(0);
  await expect(button).toHaveText('Load the default board');

  // Nothing is lost by loading onto an empty board, so it does not ask twice.
  await button.click();
  await expect(page.locator('#grid .pad--filled')).toHaveCount(BUNDLED_TITLES.length);
  await expect(button).toHaveText('Empty the board');

  await pencil(page, 'Storm').click();
  await expect(page.locator('#padLoop')).toBeChecked();
  await expect(page.locator('#padGainOut')).toHaveText('50');
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
  // The first board is full; make room for the new sound.
  await pencil(page, 'Sting').click();
  await page.locator('#padClear').click();
  await expect(pad(page, 'Sting')).toHaveCount(0);
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

// Not a sound at all: the browser takes the file and cannot read it.
const notASound = (name) => ({ name, mimeType: 'audio/wav', buffer: Buffer.from('not a sound at all') });

async function addFiles(page, files, room = ['Sting']) {
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();
  // The first board is full; make room for the new sounds.
  for (const title of room) {
    await pencil(page, title).click();
    await page.locator('#padClear').click();
    await expect(pad(page, title)).toHaveCount(0);
  }
  await showSounds(page);
  await page.locator('#btnAdd').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAddFiles').click();
  await (await chooser).setFiles(files);
}

test('a pad whose file will not load says so before it is tapped', async ({ page }) => {
  await addFiles(page, [notASound('thunder.wav')]);
  await page.locator('#lib .lib__item', { hasText: 'thunder' }).locator('.lib__add').click();

  const thunder = pad(page, 'Thunder');
  await expect(thunder).toHaveClass(/pad--broken/);
  await expect(thunder).toHaveAttribute('aria-label', /will not load/);
  await expect(page.locator('#toast')).toHaveText(/^“thunder” will not load, so it will not play\.$/i);
  // The pads that do load are left as they were.
  await expect(pad(page, 'Crickets')).not.toHaveClass(/pad--broken/);

  // A tap tries again, and the pad still says what is wrong.
  await page.locator('#btnEdit').click();
  await thunder.click();
  await expect(page.locator('#toast')).toHaveText(/would not play/);
  await expect(thunder).not.toHaveClass(/pad--playing/);
  await expect(thunder).toHaveClass(/pad--broken/);
});

test('several pads that will not load are counted in one message', async ({ page }) => {
  await addFiles(page, [notASound('thunder.wav'), notASound('rain.wav')], ['Sting', 'Phone']);
  await page.locator('#lib .lib__item', { hasText: 'thunder' }).locator('.lib__add').click();
  await expect(pad(page, 'Thunder')).toHaveClass(/pad--broken/);
  await showSounds(page);
  await page.locator('#lib .lib__item', { hasText: 'rain' }).locator('.lib__add').click();
  await expect(pad(page, 'Rain')).toHaveClass(/pad--broken/);
  await expect(page.locator('#toast')).toHaveText('2 pads will not load, so they will not play.');
});

test('a pad that will not load is said once, not again each time the pads are set up', async ({ page }) => {
  await addFiles(page, [notASound('thunder.wav')]);
  await page.locator('#lib .lib__item', { hasText: 'thunder' }).locator('.lib__add').click();
  const thunder = pad(page, 'Thunder');
  await expect(thunder).toHaveClass(/pad--broken/);
  await expect(page.locator('#toast')).toHaveText(/will not load/);

  // Every message from here on.
  await page.evaluate(() => {
    window.said = [];
    new MutationObserver(() => window.said.push(document.getElementById('toast').textContent))
      .observe(document.getElementById('toast'), { childList: true, characterData: true, subtree: true });
  });

  // A smaller board sets every pad up again; Thunder fails again, and that is not news.
  await page.locator('#btnSetup').click();
  await page.locator('#setRows').fill('3');
  await page.locator('#setupDone').click();
  await expect(page.locator('#toast')).toHaveText('3 sounds came off the board. They are still under Sounds.');
  await expect(thunder).toHaveClass(/pad--broken/);
  expect(await page.evaluate(() => window.said)).toEqual(['3 sounds came off the board. They are still under Sounds.']);
});

test('a pad that would not load is itself again once given a sound that does', async ({ page }) => {
  test.skip(isNarrow(page), 'On a phone the tree covers the board, so nothing is dragged onto a pad.');
  await addFiles(page, [notASound('thunder.wav'), { name: 'wind.wav', mimeType: 'audio/wav', buffer: silentWav(10) }]);
  await page.locator('#lib .lib__item', { hasText: 'thunder' }).locator('.lib__add').click();
  const thunder = pad(page, 'Thunder');
  await expect(thunder).toHaveClass(/pad--broken/);

  await page.locator('#lib .lib__item', { hasText: 'wind' }).dragTo(thunder);
  await expect(thunder.locator('.pad__time')).toHaveText('0:10');
  await expect(thunder).not.toHaveClass(/pad--broken/);
  await expect(thunder).not.toHaveAttribute('aria-label', /will not load/);
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

test('without file handles, dropping two folders and a sound adds all of them', async ({ page }) => {
  // Firefox and Safari hand over a drop as entries, not handles. A test cannot
  // drop a real folder, so a dropped item named like a folder here gives a
  // folder entry holding one sound, as the browser's own entries would.
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
    const folders = { 'Act 1': 'rain.wav', 'Act 2': 'wind.wav' };
    const fileEntry = (file) => ({ isDirectory: false, name: file.name, file: (ok) => ok(file) });
    DataTransferItem.prototype.webkitGetAsEntry = function () {
      const file = this.getAsFile();
      const inside = folders[file.name];
      if (!inside) return fileEntry(file);
      let given = false;
      return {
        isDirectory: true,
        name: file.name,
        createReader: () => ({
          readEntries: (ok) => {
            const batch = given ? [] : [fileEntry(new File([file], inside, { type: 'audio/wav' }))];
            given = true;
            ok(batch);
          },
        }),
      };
    };
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await showSounds(page);

  const wav = silentWav().toString('base64');
  await page.evaluate((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    for (const name of ['Act 1', 'Act 2', 'door slam.wav']) {
      dt.items.add(new File([bytes], name, { type: 'audio/wav' }));
    }
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, wav);

  for (const folder of ['Act 1', 'Act 2']) {
    await page.locator('#lib .tree__name', { hasText: folder }).click();
  }
  for (const sound of ['rain', 'wind', 'door slam']) {
    await expect(page.locator('#lib .lib__item', { hasText: sound })).toBeVisible();
  }
});

test('a pad is set up, and a sound heard and put on a pad, from the keyboard', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();

  const pen = pencil(page, 'Gunshot');
  await pen.focus();
  await expect(pen).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#padEditor')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#padEditor')).toBeHidden();

  // The first board is full; make room for a second Crickets.
  await pencil(page, 'Sting').click();
  await page.locator('#padClear').click();
  await expect(pad(page, 'Sting')).toHaveCount(0);

  await showSounds(page);
  await page.locator('#lib .tree__name', { hasText: 'default' }).focus();
  await page.keyboard.press('Enter');
  const row = page.locator('#lib .lib__item', { hasText: 'crickets' });
  const hear = row.getByRole('button', { name: /^crickets/i });
  await hear.focus();
  await page.keyboard.press('Enter');
  await expect(row).toHaveClass(/lib__item--playing/);

  const put = page.getByRole('button', { name: /^Put crickets\.mp3 on a pad$/i });
  await put.focus();
  await page.keyboard.press('Enter');
  await expect(pad(page, 'Crickets')).toHaveCount(2);
});

test('a sound in the folder is heard from its row, and a second click stops it', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await showSounds(page);
  await page.locator('#lib .tree__name', { hasText: 'default' }).click();
  const row = page.locator('#lib .lib__item', { hasText: 'crickets' });

  await row.locator('.lib__play').click();
  await expect(row).toHaveClass(/lib__item--playing/);
  // A listen is not part of the show: no pad lights up, and nothing is left to stop.
  await expect(page.locator('#grid .pad--playing')).toHaveCount(0);

  await row.locator('.lib__play').click();
  await expect(row).not.toHaveClass(/lib__item--playing/);

  // Another sound takes over from the one being heard.
  const romance = page.locator('#lib .lib__item', { hasText: 'romance' });
  await row.locator('.lib__play').click();
  await expect(row).toHaveClass(/lib__item--playing/);
  await romance.locator('.lib__play').click();
  await expect(romance).toHaveClass(/lib__item--playing/);
  await expect(row).not.toHaveClass(/lib__item--playing/);
});

test('typing in the filter narrows the sounds to the ones that match, and clearing it brings them back', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await showSounds(page);
  const filter = page.locator('#libFilter');
  const rows = page.locator('#lib .lib__item');
  await expect(rows).toHaveCount(BUNDLED_TITLES.length);

  // Part of a name, in any case: the folder is flattened to what matches.
  await filter.fill('CRICK');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText('default/crickets.mp3');

  // The folder is part of each sound's path, so it matches all of them.
  await filter.fill('default/');
  await expect(rows).toHaveCount(BUNDLED_TITLES.length);

  await filter.fill('nothing like it');
  await expect(rows).toHaveCount(0);
  await expect(page.locator('#libEmpty')).toHaveText('No sound here matches that.');

  // The filter is still there after a reload.
  await filter.fill('roma');
  await page.reload();
  await expect(page.locator('#grid .pad--filled')).toHaveCount(BUNDLED_TITLES.length);
  await showSounds(page);
  await expect(filter).toHaveValue('roma');
  await expect(rows).toHaveCount(1);

  await filter.fill('');
  await expect(rows).toHaveCount(BUNDLED_TITLES.length);
  await expect(page.locator('#libEmpty')).toHaveText('');
});

test('Enter saves the pad sheet from the name, and presses whatever button has the focus', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();
  const sheet = page.locator('#padEditor');

  await pencil(page, 'Gunshot').click();
  await page.locator('#padName').fill('Pistol');
  await page.locator('#padCancel').focus();
  await page.keyboard.press('Enter');
  await expect(sheet).toBeHidden();
  await expect(pad(page, 'Gunshot')).toBeVisible();
  await expect(pad(page, 'Pistol')).toHaveCount(0);

  await pencil(page, 'Gunshot').click();
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

test('a board saved with the crickets under their old name still plays them', async ({ page }) => {
  await openBoard(page);
  const board = {
    version: 3,
    cols: 3,
    rows: 3,
    pads: [{ file: 'default/crickets ambiance.wav', name: 'Night' }],
  };
  await page.locator('#importFile').setInputFiles({
    name: 'show.soundboard.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(board)),
  });
  const night = pad(page, 'Night');
  await expect(night).not.toHaveClass(/pad--missing/);
  await night.click();
  await expect(night).toHaveClass(/pad--playing/);
});

test('a board file saved when pads had keys loads, and its pads answer to touch alone', async ({ page }) => {
  await openBoard(page);
  const board = {
    version: 3,
    cols: 3,
    rows: 3,
    pads: [
      { file: 'default/gunshot.mp3', name: 'Shot', key: 'Q' },
      { file: 'default/romance.mp3', name: 'Song', key: 'w' },
    ],
  };
  await page.locator('#importFile').setInputFiles({
    name: 'show.soundboard.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(board)),
  });
  const song = pad(page, 'Song');
  await expect(song).toBeVisible();
  await expect(page.locator('#grid .pad__key')).toHaveCount(0);

  await page.keyboard.press('w');
  await page.keyboard.press('q');
  await expect(page.locator('#grid .pad--playing')).toHaveCount(0);
  await song.click();
  await expect(song).toHaveClass(/pad--playing/);

  await page.locator('#btnEdit').click();
  await pencil(page, 'Song').click();
  await expect(page.locator('#padKey')).toHaveCount(0);
});

test('a board file saved from Board settings holds the size just typed there', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await page.locator('#btnSetup').click();
  await page.locator('#setCols').fill('4');

  const download = page.waitForEvent('download');
  await page.locator('#btnExport').click();
  const saved = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(saved.cols).toBe(4);
});

test('a sound dragged from the folder onto an empty pad goes on it, and stays after a reload', async ({ page }) => {
  test.skip(isNarrow(page), 'On a phone the tree covers the board, so nothing is dragged onto a pad.');
  await openBoard(page);
  await page.locator('#btnEdit').click();
  // The first board is full; make room.
  await pencil(page, 'Sting').click();
  await page.locator('#padClear').click();
  const empty = page.locator('#grid .pad').nth(3);
  await expect(empty).toHaveClass(/pad--empty/);
  await showSounds(page);
  await page.locator('#lib .tree__name', { hasText: 'default' }).click();

  await page.locator('#lib .lib__item', { hasText: 'crickets' }).dragTo(empty);
  await expect(pad(page, 'Crickets')).toHaveCount(2);
  await expect(page.locator('#grid .pad').nth(3)).toContainText('Crickets', { ignoreCase: true });

  await page.reload();
  await expect(page.locator('#grid .pad').nth(3)).toContainText('Crickets', { ignoreCase: true });
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
  await (await chooser).setFiles({ name: 'rain.wav', mimeType: 'audio/wav', buffer: silentWav(10) });

  await page.locator('#lib .lib__item', { hasText: 'rain' }).dragTo(pad(page, 'Gunshot'));
  await expect(pad(page, 'Gunshot').locator('.pad__time')).toHaveText('0:10');
  await pencil(page, 'Gunshot').click();
  await expect(page.locator('#padFileName')).toHaveText('rain.wav');
  await expect(page.locator('#padTap')).toHaveValue('fadeout');
});

test('a hit dropped on a cue’s pad takes back the blue the cue’s length gave it', async ({ page }) => {
  test.skip(isNarrow(page), 'On a phone the tree covers the board, so nothing is dragged onto a pad.');
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await showSounds(page);
  await page.locator('#lib .tree__name', { hasText: 'default' }).click();
  await page.locator('#lib .lib__item', { hasText: 'gunshot' }).dragTo(pad(page, 'Crickets'));
  await expect(pad(page, 'Crickets').locator('.pad__time')).toHaveText('0:02');

  await pencil(page, 'Crickets').click();
  await expect(page.locator('#padGels .gel[aria-label^="Daylight Blue"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a pad saved from its sheet keeps its second tap when a cue is dropped on it', async ({ page }) => {
  test.skip(isNarrow(page), 'On a phone the tree covers the board, so nothing is dragged onto a pad.');
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await pencil(page, 'Gunshot').click();
  await page.locator('#padTap').selectOption('overlay');
  await page.locator('#padSave').click();
  await expect(page.locator('#padEditor')).toBeHidden();

  await showSounds(page);
  await page.locator('#btnAdd').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAddFiles').click();
  await (await chooser).setFiles({ name: 'rain.wav', mimeType: 'audio/wav', buffer: silentWav(10) });
  await page.locator('#lib .lib__item', { hasText: 'rain' }).dragTo(pad(page, 'Gunshot'));
  await expect(pad(page, 'Gunshot').locator('.pad__time')).toHaveText('0:10');

  await pencil(page, 'Gunshot').click();
  await expect(page.locator('#padTap')).toHaveValue('overlay');
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
  await pencil(page, 'Door').click();
  await page.locator('#padTap').selectOption('fadeout');
  await page.locator('#padSave').click();
  await expect(page.locator('#padEditor')).toBeHidden();
  await pad(page, 'Door').click();
  await expect(page.locator('#toast')).toHaveText('“door.wav” is not in the open folder.');

  // The sound turns up, and it is short: a hit, were it left to its length.
  await showSounds(page);
  await page.locator('#btnAdd').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAddFiles').click();
  await (await chooser).setFiles({ name: 'door.wav', mimeType: 'audio/wav', buffer: silentWav(1) });
  if (isNarrow(page)) await page.locator('#btnBrowseDone').click();
  await expect(pad(page, 'Door').locator('.pad__time')).toHaveText('0:01');

  await pencil(page, 'Door').click();
  await expect(page.locator('#padTap')).toHaveValue('fadeout');
});

test('fewer columns and more rows at once keep every pad', async ({ page }) => {
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();

  // The first board is full: a new sound in the last place of the 3 × 4 board, instead of Happy.
  await pencil(page, 'Happy').click();
  await page.locator('#padClear').click();
  await expect(pad(page, 'Happy')).toHaveCount(0);
  await page.locator('#grid .pad--empty').last().click();
  // On a phone the waiting pad opens the sounds by itself.
  await expect(page.locator('#book')).toBeVisible();
  await page.locator('#btnAdd').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAddFiles').click();
  await (await chooser).setFiles({ name: 'door slam.wav', mimeType: 'audio/wav', buffer: silentWav() });
  await page.locator('#lib .lib__item', { hasText: 'door slam' }).locator('.lib__add').click();
  await expect(page.locator('#toast')).toContainText('is on row 4, column 3.');
  await expect(page.locator('#grid .pad--filled')).toHaveCount(12);

  // 2 × 8 has sixteen places, room for all twelve.
  await page.locator('#btnSetup').click();
  await page.locator('#setCols').fill('2');
  await page.locator('#setRows').fill('8');
  await page.locator('#setupDone').click();
  await expect(page.locator('#setup')).toBeHidden();

  await expect(page.locator('#grid .pad')).toHaveCount(16);
  await expect(page.locator('#grid .pad--filled')).toHaveCount(12);
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

test('a board saved to a file loads back as it was, with missing sounds struck through', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();

  // One pad set up away from its defaults, and a board of another size.
  await pencil(page, 'Gunshot').click();
  await page.locator('#padName').fill('Pistol');
  await page.locator('#padFadeIn').fill('2');
  await page.locator('#padFadeOut').fill('4');
  await page.locator('#padGels .gel[aria-label^="Primary Red"]').click();
  await page.locator('#padSave').click();
  await expect(page.locator('#padEditor')).toBeHidden();

  await page.locator('#btnSetup').click();
  await page.locator('#setCols').fill('4');
  await page.locator('#setRows').fill('2');
  // The sheet applies its fields as it closes, so the size is in place before
  // the board is saved (saving in the same visit is #45).
  await page.locator('#setupDone').click();
  await expect(page.locator('#grid .pad')).toHaveCount(8);

  await page.locator('#btnSetup').click();
  const download = page.waitForEvent('download');
  await page.locator('#btnExport').click();
  await expect(page.locator('#toast')).toHaveText('Board saved to your downloads.');
  const board = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(board.cols).toBe(4);
  expect(board.rows).toBe(2);
  // Pads are played by touch, so the file carries no keys.
  expect(board.pads.filter((p) => p && 'key' in p)).toEqual([]);

  // The file travels to a machine where one of its sounds is not open.
  const crickets = board.pads.find((p) => p && p.file.includes('crickets'));
  crickets.file = 'Show/thunder.wav';
  crickets.name = 'Thunder';

  // Throw this board away, size and all.
  await page.locator('#setupDone').click();
  await page.locator('#btnEmpty').click();
  await page.locator('#btnEmpty').click();
  await expect(page.locator('#grid .pad--filled')).toHaveCount(0);
  await page.locator('#btnSetup').click();
  await page.locator('#setCols').fill('3');
  await page.locator('#setRows').fill('3');
  await page.locator('#setupDone').click();
  await expect(page.locator('#grid .pad')).toHaveCount(9);

  await page.locator('#btnSetup').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnImport').click();
  await (await chooser).setFiles({
    name: 'show.soundboard.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(board)),
  });
  await expect(page.locator('#toast')).toHaveText('Board loaded. 1 pad point at files this folder does not have.');

  await expect(page.locator('#grid .pad')).toHaveCount(8);
  await expect(page.locator('#grid .pad--filled')).toHaveCount(8);
  await expect(pad(page, 'Storm')).not.toHaveClass(/pad--missing/);
  await expect(pad(page, 'Thunder')).toHaveClass(/pad--missing/);
  const pistol = pad(page, 'Pistol');
  await expect(pistol).not.toHaveClass(/pad--missing/);

  await pencil(page, 'Pistol').click();
  await expect(page.locator('#padFadeIn')).toHaveValue('2');
  await expect(page.locator('#padFadeOut')).toHaveValue('4');
  await expect(page.locator('#padGels .gel[aria-label^="Primary Red"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#padCancel').click();

  await page.locator('#btnSetup').click();
  await expect(page.locator('#setCols')).toHaveValue('4');
  await expect(page.locator('#setRows')).toHaveValue('2');
});

test('a pad’s level, fades and colour stay after a reload', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();

  await pencil(page, 'Crickets').click();
  await page.locator('#padGain').fill('40');
  await expect(page.locator('#padGainOut')).toHaveText('40');
  await page.locator('#padFadeIn').fill('2.5');
  await page.locator('#padFadeOut').fill('6');
  await page.locator('#padGels .gel[aria-label^="Fire"]').click();
  await page.locator('#padSave').click();
  await expect(page.locator('#padEditor')).toBeHidden();

  await page.reload();
  await pencil(page, 'Crickets').click();
  await expect(page.locator('#padGain')).toHaveValue('40');
  await expect(page.locator('#padGainOut')).toHaveText('40');
  await expect(page.locator('#padFadeIn')).toHaveValue('2.5');
  await expect(page.locator('#padFadeOut')).toHaveValue('6');
  await expect(page.locator('#padGels .gel[aria-label^="Fire"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#padGels .gel[aria-pressed="true"]')).toHaveCount(1);
});

test('Board settings sets the number of rows and columns', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await expect(page.locator('#grid .pad')).toHaveCount(12);

  await page.locator('#btnSetup').click();
  await page.locator('#setCols').fill('4');
  await page.locator('#setRows').fill('5');
  await page.locator('#setupDone').click();
  await expect(page.locator('#setup')).toBeHidden();
  await expect(page.locator('#grid .pad')).toHaveCount(20);
  await expect(page.locator('#grid .pad--filled')).toHaveCount(BUNDLED_TITLES.length);
  await expect(page.locator('#grid .pad').nth(19)).toHaveAttribute('aria-label', /row 5 column 4/);

  await page.reload();
  await expect(page.locator('#grid .pad')).toHaveCount(20);
});

test('a smaller board says which sounds it could not keep', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();

  // The last row holds Sad, Hero and Happy; a board one row shorter has no room for them.
  await page.locator('#btnSetup').click();
  await page.locator('#setRows').fill('3');
  await page.locator('#setupDone').click();
  await expect(page.locator('#toast')).toHaveText('3 sounds came off the board. They are still under Sounds.');
  await expect(page.locator('#grid .pad')).toHaveCount(9);
  await expect(pad(page, 'Happy')).toHaveCount(0);
  for (const title of BUNDLED_TITLES.slice(0, 9)) await expect(pad(page, title)).toBeVisible();

  await showSounds(page);
  await page.locator('#lib .tree__name', { hasText: 'default' }).click();
  await expect(page.locator('#lib .lib__item', { hasText: 'happy' })).toBeVisible();
});

test('a message covers no pad, and the button under it still answers a tap', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();
  // Emptying the board says so in a toast.
  await page.locator('#btnEmpty').click();
  await page.locator('#btnEmpty').click();
  const toast = page.locator('#toast');
  await expect(toast).toHaveText('The board is empty. The sounds are still under Sounds.');

  const over = await toast.boundingBox();
  const pads = page.locator('#grid .pad');
  for (let i = 0; i < await pads.count(); i++) {
    const box = await pads.nth(i).boundingBox();
    expect(box.y, `pad ${i} is below the message`).toBeGreaterThanOrEqual(over.y + over.height - 1);
  }

  // It lies over the top bar, whose buttons are still there to press.
  const setup = await page.locator('#btnSetup').boundingBox();
  expect(setup.y).toBeLessThan(over.y + over.height);
  await page.mouse.click(setup.x + setup.width / 2, setup.y + setup.height / 2);
  await expect(page.locator('#setup')).toBeVisible();
});
