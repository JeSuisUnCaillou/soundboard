// Running the show: the first board, firing pads, stopping them.

import { test, expect, BUNDLED_TITLES, openBoard, pad } from './helpers.js';

test('the first launch lays out the sounds that ship with the board', async ({ page }) => {
  await openBoard(page);
  for (const title of BUNDLED_TITLES) await expect(pad(page, title)).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('A board to start with. Add files when you have your own.');
  await expect(page.locator('#btnStop')).toBeDisabled();
});

test('tapping a pad plays it, and Stop takes it out', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets ambiance');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeEnabled();

  await page.locator('#btnStop').click();
  await expect(crickets).not.toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeDisabled();
});

test('Escape cuts everything dead', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets ambiance');
  const sexy = pad(page, 'Sexy');

  await crickets.click();
  await sexy.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await expect(sexy).toHaveClass(/pad--playing/);

  await page.keyboard.press('Escape');
  await expect(page.locator('#grid .pad--playing')).toHaveCount(0);
  await expect(page.locator('#btnStop')).toBeDisabled();
});

test('the master volume follows its slider', async ({ page }) => {
  await openBoard(page);
  await page.locator('#master').fill('35');
  await expect(page.locator('#masterValue')).toHaveText('35');
});

test('the keys still work after the master volume is touched', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets ambiance');
  const key = (await crickets.locator('.pad__key').textContent()).trim();

  // Grabbing the slider leaves the focus on it, as a hand on a mouse does.
  const master = page.locator('#master');
  await master.click();
  await expect(master).toBeFocused();

  await page.keyboard.press(key);
  await expect(crickets).toHaveClass(/pad--playing/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#grid .pad--playing')).toHaveCount(0);

  await page.keyboard.press(key);
  await expect(crickets).toHaveClass(/pad--playing/);
  await page.keyboard.press(' ');
  await expect(crickets).not.toHaveClass(/pad--playing/);
});

/** Change a pad's settings in its sheet, then go back to running the show. */
async function setUpPad(page, title, fields) {
  await page.locator('#btnEdit').click();
  await pad(page, title).locator('.pad__pencil').click();
  for (const [id, value] of Object.entries(fields)) {
    const field = page.locator(`#${id}`);
    if (typeof value === 'boolean') await field.setChecked(value);
    else await field.fill(value);
  }
  await page.locator('#padSave').click();
  await expect(page.locator('#padEditor')).toBeHidden();
  await page.locator('#btnEdit').click();
  await expect(page.locator('#btnEdit')).toHaveAttribute('aria-pressed', 'false');
}

test('Stop greys out as soon as everything is fading out', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets ambiance');
  const sexy = pad(page, 'Sexy');
  await crickets.click();
  await sexy.click();
  await expect(page.locator('#grid .pad--playing')).toHaveCount(2);

  // The fade out takes 1.5 s; the button must not wait for it.
  await page.locator('#btnStop').click();
  await expect(page.locator('#btnStop')).toBeDisabled({ timeout: 500 });
  await expect(page.locator('#grid .pad--playing')).toHaveCount(0);
});

test('a pad tapped while it fades out starts again, and keeps playing', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets ambiance');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await crickets.click();
  await expect(crickets).not.toHaveClass(/pad--playing/);

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeEnabled();
  // Well past the end of the fade it interrupted, it is still running.
  await expect(crickets.locator('.pad__time')).toHaveText('-0:23', { timeout: 6000 });
  await expect(crickets).toHaveClass(/pad--playing/);
});

test('a pad tapped after Stop, during the fade, starts again', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets ambiance');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await page.locator('#btnStop').click();
  await expect(crickets).not.toHaveClass(/pad--playing/);

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
});

test('a pad tapped while it fades in stops', async ({ page }) => {
  await openBoard(page);
  await setUpPad(page, 'Crickets ambiance', { padFadeIn: '3' });
  const crickets = pad(page, 'Crickets ambiance');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await crickets.click();
  await expect(crickets).not.toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeDisabled();
});

test('a pad fading towards its stop point still answers a tap by stopping', async ({ page }) => {
  await openBoard(page);
  // Stop at 4 s with a 3 s fade: the pad starts fading on its own after 1 s.
  await setUpPad(page, 'Crickets ambiance', { padEnd: '4', padFadeOut: '3' });
  const crickets = pad(page, 'Crickets ambiance');

  await crickets.click();
  await expect(crickets.locator('.pad__time')).toHaveText('-0:02', { timeout: 4000 });
  await expect(crickets).toHaveClass(/pad--playing/);

  await crickets.click();
  await expect(crickets).not.toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeDisabled();
});

/**
 * Wait until a pad has played for this long, failing as soon as it stops
 * rather than at the end of the wait.
 */
async function expectStillPlayingAfter(page, padEl, ms) {
  const started = Date.now();
  let stopped = false;
  await expect.poll(async () => {
    if (stopped || !(await padEl.evaluate((el) => el.classList.contains('pad--playing')))) {
      stopped = true;
      return 'stopped';
    }
    return Date.now() - started >= ms ? 'still playing' : 'waiting';
  }, { timeout: ms + 5000, intervals: [100] }).toBe('still playing');
}

test('a looping pad with a stop point and a fade out goes round, not out', async ({ page }) => {
  await openBoard(page);
  // Stop at 2 s with a 1 s fade: without the loop it would be over after 2 s.
  await setUpPad(page, 'Crickets ambiance', { padEnd: '2', padFadeOut: '1', padLoop: true });
  const crickets = pad(page, 'Crickets ambiance');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await expectStillPlayingAfter(page, crickets, 4500);

  await crickets.click();
  await expect(crickets).not.toHaveClass(/pad--playing/);
});

test('a looping pad with a start point goes round when its file ends', async ({ page }) => {
  await openBoard(page);
  // The gunshot lasts 2.9 s; looping from 0.2 s means looping by hand.
  await setUpPad(page, 'Gunshot', { padStart: '0.2', padLoop: true });
  const gunshot = pad(page, 'Gunshot');

  await gunshot.click();
  await expect(gunshot).toHaveClass(/pad--playing/);
  await expectStillPlayingAfter(page, gunshot, 4500);

  // A sound this short layers on a tap, so Stop is what ends it.
  await page.locator('#btnStop').click();
  await expect(gunshot).not.toHaveClass(/pad--playing/);
});

test('a stop point is honoured while the board is in another tab', async ({ page }) => {
  // Headless Chromium keeps every tab visible, so switching away is played
  // out here the way the browser announces it.
  await page.addInitScript(() => {
    let away = false;
    Object.defineProperty(Document.prototype, 'hidden', { get: () => away, configurable: true });
    Object.defineProperty(Document.prototype, 'visibilityState', {
      get: () => (away ? 'hidden' : 'visible'),
      configurable: true,
    });
    window.switchTab = (gone) => {
      away = gone;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
  await openBoard(page);
  await setUpPad(page, 'Crickets ambiance', { padEnd: '2', padFadeOut: '0' });
  const crickets = pad(page, 'Crickets ambiance');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await page.evaluate(() => window.switchTab(true));

  // The operator is reading the script elsewhere; the cue still ends on time.
  await expect(crickets).not.toHaveClass(/pad--playing/, { timeout: 5000 });
  await expect(page.locator('#btnStop')).toBeDisabled();
  await page.evaluate(() => window.switchTab(false));
  await expect(crickets).not.toHaveClass(/pad--playing/);
});

test('holding a pad’s key is one tap', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets ambiance');
  const key = (await crickets.locator('.pad__key').textContent()).trim();

  // Every keydown after the first is a key repeat.
  for (let n = 0; n < 4; n++) await page.keyboard.down(key);
  await page.keyboard.up(key);
  await expect(crickets).toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeEnabled();
});

test.describe('a sound served from another origin', () => {
  // The service worker would answer the board's requests before the routes
  // below could see them.
  test.use({ serviceWorkers: 'block' });

  test('is heard, not played as silence', async ({ page }) => {
    // Measure what reaches the speakers: tap whatever is wired to the output.
    await page.addInitScript(() => {
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (dest, ...rest) {
        if (dest instanceof AudioDestinationNode) {
          window.__meter = dest.context.createAnalyser();
          connect.call(this, window.__meter);
        }
        return connect.call(this, dest, ...rest);
      };
    });
    // Hand the sounds over from another origin, as a host that redirects to
    // where it keeps its files does. The test server, reached as 127.0.0.1, is
    // that origin, and allows CORS as such hosts do.
    await page.route(/\/\/localhost:\d+\/sounds\//, (route) =>
      route.fulfill({ status: 302, headers: { Location: route.request().url().replace('//localhost:', '//127.0.0.1:') } }));

    await openBoard(page);
    const crickets = pad(page, 'Crickets ambiance');
    await crickets.click();
    await expect(crickets).toHaveClass(/pad--playing/);

    await expect.poll(() => page.evaluate(() => {
      const data = new Float32Array(window.__meter.fftSize);
      window.__meter.getFloatTimeDomainData(data);
      return Math.max(...data.map(Math.abs));
    }), { timeout: 5000 }).toBeGreaterThan(0.001);
  });
});

test.describe('a pad stopped while its sound is still starting', () => {
  test('answers the next tap with sound, and no complaint', async ({ page }) => {
    await page.addInitScript(() => {
      // Measure what reaches the speakers: tap whatever is wired to the output.
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (dest, ...rest) {
        if (dest instanceof AudioDestinationNode) {
          window.__meter = dest.context.createAnalyser();
          connect.call(this, window.__meter);
        }
        return connect.call(this, dest, ...rest);
      };
      // A slow start, as on a busy phone: while window.__slowPlay is set,
      // play() takes a second to begin, and a pause() in that second rejects
      // it the way the browser does.
      const play = HTMLMediaElement.prototype.play;
      const pause = HTMLMediaElement.prototype.pause;
      HTMLMediaElement.prototype.play = function () {
        if (!window.__slowPlay) return play.call(this);
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            this.__pending = null;
            play.call(this).then(resolve, reject);
          }, 1000);
          this.__pending = () => {
            clearTimeout(timer);
            reject(new DOMException('The play() request was interrupted by a call to pause().', 'AbortError'));
          };
        });
      };
      HTMLMediaElement.prototype.pause = function () {
        if (this.__pending) {
          this.__pending();
          this.__pending = null;
        }
        return pause.call(this);
      };
    });
    const level = () => page.evaluate(() => {
      const data = new Float32Array(window.__meter.fftSize);
      window.__meter.getFloatTimeDomainData(data);
      return Math.max(...data.map(Math.abs));
    });

    await openBoard(page);
    const crickets = pad(page, 'Crickets ambiance');

    // A first tap wakes the board's sound; it starts as it always does.
    await crickets.click();
    await expect(crickets).toHaveClass(/pad--playing/);
    await page.keyboard.press('Escape');
    await expect(crickets).not.toHaveClass(/pad--playing/);

    // Escape lands while the sound is still starting.
    await page.evaluate(() => { window.__slowPlay = true; });
    await crickets.click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.__slowPlay = false; });
    await expect(crickets).not.toHaveClass(/pad--playing/);

    await crickets.click();
    await expect(crickets).toHaveClass(/pad--playing/);
    await expect.poll(level, { timeout: 5000 }).toBeGreaterThan(0.001);
    await expect(page.locator('#toast')).not.toContainText('would not play');
  });
});
