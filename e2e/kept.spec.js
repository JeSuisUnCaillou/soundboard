// Coming back to it: the copies the board keeps of every sound, and the places
// on disk it goes back to, with Reconnect when the browser asks again.

import { test, expect, openBoard, pad, showSounds, silentWav } from './helpers.js';

/** A row of the folder's tree, by the sound's name. */
function row(page, name) {
  return page.locator('#lib .lib__item', { hasText: name });
}

/** Open the sounds in edit mode, wherever this layout keeps them. */
async function editing(page) {
  const edit = page.locator('#btnEdit');
  if ((await edit.getAttribute('aria-pressed')) !== 'true') await edit.click();
  await showSounds(page);
}

/** Open a folder in the tree, unless it is open already. */
async function openFolder(page, name) {
  const dir = page.locator('#lib details.tree__dir', { has: page.locator('.tree__label', { hasText: name }) }).first();
  if ((await dir.getAttribute('open')) === null) await dir.locator('.tree__name').first().click();
  await expect(dir).toHaveAttribute('open', '');
}

/** Back to the board, from wherever the sounds were open. */
async function running(page) {
  if (await page.locator('#btnBrowseDone').isVisible()) await page.locator('#btnBrowseDone').click();
  const edit = page.locator('#btnEdit');
  if ((await edit.getAttribute('aria-pressed')) === 'true') await edit.click();
  await expect(edit).toHaveAttribute('aria-pressed', 'false');
}

test('sounds added from the file picker come back after a reload, and with the network off', async ({ page, context }) => {
  // The plain file input, as in every browser that cannot hand over a file
  // handle: a copy is all that can outlive the page.
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
  });
  await openBoard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);

  await editing(page);
  await page.locator('#btnAdd').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAddFiles').click();
  await (await chooser).setFiles([
    { name: 'rain.wav', mimeType: 'audio/wav', buffer: silentWav(30) },
    { name: 'thunder.wav', mimeType: 'audio/wav', buffer: silentWav(30) },
  ]);
  await row(page, 'rain').locator('.lib__add').click();
  await expect(pad(page, 'Rain')).toHaveCount(1);

  for (const offline of [false, true]) {
    await context.setOffline(offline);
    await page.reload();
    const rain = pad(page, 'Rain');
    await expect(rain).toBeVisible();
    await expect(rain).not.toHaveClass(/pad--missing/);
    // Not only the sounds on pads: the whole folder is kept.
    await editing(page);
    await expect(row(page, 'thunder')).toBeVisible();

    await running(page);
    await rain.click();
    await expect(rain).toHaveClass(/pad--playing/);
    await page.keyboard.press('Escape');
    await expect(rain).not.toHaveClass(/pad--playing/);
  }
});

test.describe('a folder opened with a handle', () => {
  // A real folder handle, from the browser's own private file system, stands
  // in for a folder picked on disk. Setting test:ask makes the browser ask
  // for permission again, as it does after a restart, until it is granted.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Show');
      const query = FileSystemHandle.prototype.queryPermission;
      FileSystemHandle.prototype.queryPermission = function (...args) {
        return localStorage.getItem('test:ask') ? Promise.resolve('prompt') : query.apply(this, args);
      };
      FileSystemHandle.prototype.requestPermission = function () {
        localStorage.removeItem('test:ask');
        return Promise.resolve('granted');
      };
    });
  });

  /** Put a file in the folder on "disk". */
  async function onDisk(page, name, buffer) {
    await page.evaluate(async ({ name, bytes }) => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('Show', { create: true });
      const out = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await out.write(Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0)));
      await out.close();
    }, { name, bytes: buffer.toString('base64') });
  }

  test('comes back by itself while the browser still allows it', async ({ page }) => {
    await openBoard(page);
    await onDisk(page, 'rain.wav', silentWav(30));
    await editing(page);
    await page.locator('#btnAdd').click();
    await page.locator('#btnAddFolder').click();
    await expect(page.locator('#toast')).toHaveText(/^1 sound added/);
    await openFolder(page, 'Show');
    await row(page, 'rain').locator('.lib__add').click();
    await expect(pad(page, 'Rain')).toHaveCount(1);

    // A sound put in the folder since is there on the next launch.
    await onDisk(page, 'wind.wav', silentWav(30));
    await page.reload();
    await expect(pad(page, 'Rain')).toBeVisible();
    await expect(page.locator('#btnReconnect')).toBeHidden();
    await editing(page);
    await expect(row(page, 'wind')).toBeVisible();
  });

  test('plays from its copies until Reconnect, which brings the folder back', async ({ page }) => {
    await openBoard(page);
    await onDisk(page, 'rain.wav', silentWav(30));
    await editing(page);
    await page.locator('#btnAdd').click();
    await page.locator('#btnAddFolder').click();
    await openFolder(page, 'Show');
    await row(page, 'rain').locator('.lib__add').click();
    await expect(pad(page, 'Rain')).toHaveCount(1);

    await onDisk(page, 'wind.wav', silentWav(30));
    await page.evaluate(() => localStorage.setItem('test:ask', 'yes'));
    await page.reload();

    // The show can go on from the copies: nothing is asked before a pad plays.
    await running(page);
    const reconnect = page.locator('#btnReconnect');
    await expect(reconnect).toHaveText('Reconnect “Show”');
    const rain = pad(page, 'Rain');
    await expect(rain).not.toHaveClass(/pad--missing/);
    await rain.click();
    await expect(rain).toHaveClass(/pad--playing/);
    await page.keyboard.press('Escape');
    await expect(rain).not.toHaveClass(/pad--playing/);

    // Until then the folder is what was kept of it.
    await editing(page);
    await expect(row(page, 'rain')).toBeVisible();
    await expect(row(page, 'wind')).toHaveCount(0);

    await running(page);
    await reconnect.click();
    await expect(reconnect).toBeHidden();
    await rain.click();
    await expect(rain).toHaveClass(/pad--playing/);

    await editing(page);
    await expect(row(page, 'wind')).toBeVisible();
  });
});

test('a pad whose sound is missing says so, and plays once the sound is added', async ({ page }) => {
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
  });
  await openBoard(page);
  const board = { version: 3, cols: 3, rows: 4, pads: [{ file: 'thunder.wav', name: 'Thunder' }] };
  await page.locator('#importFile').setInputFiles({
    name: 'storm.soundboard.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(board)),
  });
  const thunder = pad(page, 'Thunder');
  await expect(thunder).toHaveClass(/pad--missing/);

  await thunder.click();
  await expect(page.locator('#toast')).toHaveText('“thunder.wav” is not in the open folder.');
  await expect(thunder).not.toHaveClass(/pad--playing/);

  await editing(page);
  await page.locator('#btnAdd').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAddFiles').click();
  await (await chooser).setFiles({ name: 'thunder.wav', mimeType: 'audio/wav', buffer: silentWav(30) });
  await expect(thunder).not.toHaveClass(/pad--missing/);

  await running(page);
  await thunder.click();
  await expect(thunder).toHaveClass(/pad--playing/);
});
