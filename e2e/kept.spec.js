// Coming back to it: the copies the board keeps of every sound, and the places
// on disk it goes back to, with Reconnect when the browser asks again.

import { test, expect, makeRoom, openBoard, pad, showSounds, silentWav } from './helpers.js';

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
  await page.locator('#btnEdit').click();
  await makeRoom(page);

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
      // With test:refuse set too, the operator says no when asked.
      FileSystemHandle.prototype.requestPermission = function () {
        if (localStorage.getItem('test:refuse')) return Promise.resolve('denied');
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
    await page.locator('#btnEdit').click();
    await makeRoom(page);
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

  test('stays on its copies, and keeps offering Reconnect, when permission is refused', async ({ page }) => {
    await openBoard(page);
    await page.locator('#btnEdit').click();
    await makeRoom(page);
    await onDisk(page, 'rain.wav', silentWav(30));
    await editing(page);
    await page.locator('#btnAdd').click();
    await page.locator('#btnAddFolder').click();
    await openFolder(page, 'Show');
    await row(page, 'rain').locator('.lib__add').click();
    await expect(pad(page, 'Rain')).toHaveCount(1);

    await page.evaluate(() => {
      localStorage.setItem('test:ask', 'yes');
      localStorage.setItem('test:refuse', 'yes');
    });
    await page.reload();
    // The board comes back in edit mode, as it was left, once it has loaded.
    await expect(page.locator('#btnEdit')).toHaveAttribute('aria-pressed', 'true');
    await running(page);
    const reconnect = page.locator('#btnReconnect');
    await reconnect.click();
    await expect(page.locator('#toast')).toHaveText('Without permission to read them, the board stays on the copies it kept.');
    await expect(reconnect).toBeVisible();

    const rain = pad(page, 'Rain');
    await rain.click();
    await expect(rain).toHaveClass(/pad--playing/);
  });
});

test('a browser out of room says so, and what it kept still comes back', async ({ page }) => {
  // While window.full is set, the browser refuses to keep another sound.
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (window.full && this.name === 'sounds') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await makeRoom(page);
  const add = async (name) => {
    await editing(page);
    await page.locator('#btnAdd').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#btnAddFiles').click();
    await (await chooser).setFiles({ name, mimeType: 'audio/wav', buffer: silentWav(30) });
    await expect(row(page, name.replace('.wav', ''))).toBeVisible();
  };

  await add('rain.wav');
  await row(page, 'rain').locator('.lib__add').click();
  await expect(pad(page, 'Rain')).toHaveCount(1);
  // Back after a reload, so its copy is kept before the browser fills up.
  await page.reload();
  await expect(pad(page, 'Rain')).not.toHaveClass(/pad--missing/);

  await page.evaluate(() => { window.full = true; });
  await add('wind.wav');
  await expect(page.locator('#toast')).toHaveText('This browser is out of room. What is already kept will come back; the rest needs the folder again.');
  // The show goes on meanwhile.
  await running(page);
  await pad(page, 'Rain').click();
  await expect(pad(page, 'Rain')).toHaveClass(/pad--playing/);

  await page.reload();
  await expect(pad(page, 'Rain')).not.toHaveClass(/pad--missing/);
  await editing(page);
  await expect(row(page, 'rain')).toBeVisible();
  await expect(row(page, 'wind')).toHaveCount(0);
});
