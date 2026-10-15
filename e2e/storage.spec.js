// What the board keeps between launches, and how it copes when it cannot.

import { test, expect, openBoard, pad, pencil, showSounds } from './helpers.js';

test('a browser that keeps nothing still opens the board, and says nothing done now will be kept', async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new DOMException('Storage is turned off.', 'UnknownError');
    };
  });
  await openBoard(page);
  await expect(page.locator('#toast')).toHaveText("The browser's storage is not answering, so nothing done now will be kept.");
  await pad(page, 'Crickets ambiance').click();
  await expect(pad(page, 'Crickets ambiance')).toHaveClass(/pad--playing/);
});

test('a launch whose storage fails once leaves the saved board as it was for the next', async ({ page }) => {
  // When asked to, the next launch's first read from storage fails.
  await page.addInitScript(() => {
    if (!localStorage.getItem('failOnce')) return;
    localStorage.removeItem('failOnce');
    const get = IDBObjectStore.prototype.get;
    let first = true;
    IDBObjectStore.prototype.get = function (...args) {
      if (first) {
        first = false;
        throw new DOMException('Storage is busy.', 'UnknownError');
      }
      return get.apply(this, args);
    };
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await pencil(page, 'Gunshot').click();
  await page.locator('#padName').fill('Pistol');
  await page.locator('#padSave').click();
  await expect(pad(page, 'Pistol')).toBeVisible();
  await page.reload();
  await expect(pad(page, 'Pistol')).toBeVisible();

  // That launch cannot read the board, and shows a board to start with.
  await page.evaluate(() => localStorage.setItem('failOnce', '1'));
  await page.reload();
  await expect(page.locator('#toast')).toHaveText("The browser's storage is not answering, so nothing done now will be kept.");
  await expect(pad(page, 'Gunshot')).toBeVisible();

  // The one after finds the board as the operator left it.
  await page.reload();
  await expect(pad(page, 'Pistol')).toBeVisible();
});

test('a kept folder the browser cannot even ask about is offered for reconnecting', async ({ page }) => {
  await openBoard(page);
  // A stored place that no longer answers questions about its permission.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('soundboard');
    req.onsuccess = () => {
      const tx = req.result.transaction('handles', 'readwrite');
      tx.objectStore('handles').put([{ kind: 'directory', name: 'Show' }], 'default-board');
      tx.oncomplete = () => { req.result.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  }));
  await page.reload();
  await expect(pad(page, 'Gunshot')).toBeVisible();
  await expect(page.locator('#btnReconnect')).toHaveText('Reconnect “Show”');
});

test('a change is kept when the page is hidden and then closed without beforeunload, as on a phone', async ({ page }) => {
  // A phone switching apps hides the page, and may later close it with no
  // beforeunload at all.
  await page.addInitScript(() => {
    const add = window.addEventListener;
    window.addEventListener = function (type, ...rest) {
      if (type === 'beforeunload') return undefined;
      return add.call(this, type, ...rest);
    };
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await pencil(page, 'Gunshot').click();
  await page.locator('#padName').fill('Pistol');
  await page.locator('#padSave').click();
  await expect(pad(page, 'Pistol')).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.reload();
  await expect(pad(page, 'Pistol')).toBeVisible();
});

test('copies kept for a board that can no longer be opened are cleared', async ({ page }) => {
  await openBoard(page);
  // A board left in storage from before, with a sound kept for it.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('soundboard');
    req.onsuccess = () => {
      const tx = req.result.transaction(['boards', 'sounds'], 'readwrite');
      tx.objectStore('boards').put({ id: 'old-show', cols: 3, rows: 3, pads: [] });
      tx.objectStore('sounds').put({
        key: 'old-show\nOld show/rain.wav',
        boardId: 'old-show',
        path: 'Old show/rain.wav',
        name: 'rain.wav',
        size: 4,
        lastModified: 0,
        blob: new Blob(['RIFF']),
      });
      tx.oncomplete = () => { req.result.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  }));

  await page.reload();
  await expect(pad(page, 'Gunshot')).toBeVisible();
  const leftover = () => page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('soundboard');
    req.onsuccess = () => {
      const tx = req.result.transaction(['boards', 'sounds'], 'readonly');
      const boards = tx.objectStore('boards').getAllKeys();
      const sounds = tx.objectStore('sounds').getAllKeys();
      tx.oncomplete = () => {
        req.result.close();
        resolve([...boards.result, ...sounds.result].filter((key) => key.startsWith('old-show')).length);
      };
    };
  }));
  await expect.poll(leftover).toBe(0);
});

test('the screen wake lock is asked for once, however many presses ask at once', async ({ page }) => {
  // A slow answer, as from a busy phone, leaves room for presses to ask again.
  await page.addInitScript(() => {
    window.__wakeRequests = 0;
    const request = navigator.wakeLock.request;
    navigator.wakeLock.request = (...args) => {
      window.__wakeRequests += 1;
      return new Promise((resolve) => setTimeout(() => resolve(request(...args)), 1500));
    };
  });
  await openBoard(page);
  await pad(page, 'Crickets ambiance').click();
  await pad(page, 'Sexy').click();
  await expect(pad(page, 'Sexy')).toHaveClass(/pad--playing/);
  expect(await page.evaluate(() => window.__wakeRequests)).toBe(1);
});

test('a file picker dismissed without a word is cleared away when the next one opens', async ({ page }) => {
  await page.addInitScript(() => {
    delete window.showOpenFilePicker;
    delete window.showDirectoryPicker;
    // Some browsers say nothing when a picker is dismissed.
    const add = HTMLInputElement.prototype.addEventListener;
    HTMLInputElement.prototype.addEventListener = function (type, ...rest) {
      if (type === 'cancel') return undefined;
      return add.call(this, type, ...rest);
    };
  });
  await openBoard(page);
  await page.locator('#btnEdit').click();
  await showSounds(page);
  await page.locator('#btnAdd').click();
  const pickers = page.locator('input[type=file]:not(#importFile)');

  let chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAddFiles').click();
  await chooser;
  await expect(pickers).toHaveCount(1);

  chooser = page.waitForEvent('filechooser');
  await page.locator('#btnAddFiles').click();
  await chooser;
  await expect(pickers).toHaveCount(1);
});
