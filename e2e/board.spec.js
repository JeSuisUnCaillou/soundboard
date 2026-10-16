// Running the show: the first board, firing pads, stopping them.

import { test, expect, BUNDLED_TITLES, isNarrow, openBoard, pad, pencil, showSounds, silentWav } from './helpers.js';

test('the first launch lays out the sounds that ship with the board', async ({ page }) => {
  await openBoard(page);
  for (const title of BUNDLED_TITLES) await expect(pad(page, title)).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('A board to start with. Add files when you have your own.');
  await expect(page.locator('#btnStop')).toBeDisabled();
});

test('the first board comes set up for an improv show', async ({ page }) => {
  await openBoard(page);
  await page.locator('#btnEdit').click();
  const sheet = page.locator('#padEditor');
  const gel = (name) => page.locator(`#padGels .gel[aria-label^="${name}"]`);

  // An effect fires at once and layers on a second tap.
  await pencil(page, 'Gunshot').click();
  await expect(page.locator('#padFadeIn')).toHaveValue('0');
  await expect(page.locator('#padTap')).toHaveValue('overlay');
  await expect(page.locator('#padLoop')).not.toBeChecked();
  await expect(gel('Daylight Blue')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#padCancel').click();
  await expect(sheet).toBeHidden();

  // Phone runs past five seconds and is still an effect, in the effects' blue.
  await pencil(page, 'Phone').click();
  await expect(page.locator('#padTap')).toHaveValue('fadeout');
  await expect(gel('Daylight Blue')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#padCancel').click();
  await expect(sheet).toBeHidden();

  // A place loops under the scene, quieter, and fades in and out.
  await pencil(page, 'Storm').click();
  await expect(page.locator('#padLoop')).toBeChecked();
  await expect(page.locator('#padFadeIn')).toHaveValue('2');
  await expect(page.locator('#padFadeOut')).toHaveValue('3');
  await expect(page.locator('#padGainOut')).toHaveText('50');
  await expect(gel('Moss Green')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#padCancel').click();
  await expect(sheet).toBeHidden();

  // Music loops too, in a colour of its own.
  await pencil(page, 'Happy').click();
  await expect(page.locator('#padLoop')).toBeChecked();
  await expect(page.locator('#padGainOut')).toHaveText('45');
  await expect(gel('Lavender')).toHaveAttribute('aria-pressed', 'true');
});

test('tapping a pad plays it, and Stop takes it out', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeEnabled();

  await page.locator('#btnStop').click();
  await expect(crickets).not.toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeDisabled();
});

test('Escape cuts everything dead', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets');
  const romance = pad(page, 'Romance');

  await crickets.click();
  await romance.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await expect(romance).toHaveClass(/pad--playing/);

  await page.keyboard.press('Escape');
  await expect(page.locator('#grid .pad--playing')).toHaveCount(0);
  await expect(page.locator('#btnStop')).toBeDisabled();
});

test('the master volume follows its slider', async ({ page }) => {
  await openBoard(page);
  await page.locator('#master').fill('35');
  await expect(page.locator('#masterValue')).toHaveText('35');
});

test('Space and Escape still work after the master volume is touched', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets');
  const master = page.locator('#master');

  // Grabbing the slider leaves the focus on it, as a hand on a mouse does.
  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await master.click();
  await expect(master).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#grid .pad--playing')).toHaveCount(0);

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await master.click();
  await page.keyboard.press(' ');
  await expect(crickets).not.toHaveClass(/pad--playing/);
});

/** Change a pad's settings in its sheet, then go back to running the show. */
async function setUpPad(page, title, fields) {
  await page.locator('#btnEdit').click();
  await pencil(page, title).click();
  for (const [id, value] of Object.entries(fields)) {
    const field = page.locator(`#${id}`);
    if (typeof value === 'boolean') await field.setChecked(value);
    else if (await field.evaluate((el) => el.tagName === 'SELECT')) await field.selectOption(value);
    else await field.fill(value);
  }
  await page.locator('#padSave').click();
  await expect(page.locator('#padEditor')).toBeHidden();
  await page.locator('#btnEdit').click();
  await expect(page.locator('#btnEdit')).toHaveAttribute('aria-pressed', 'false');
}

test('Stop greys out as soon as everything is fading out', async ({ page }) => {
  await openBoard(page);
  // Fades longer than an assertion waits: passing proves the button did not
  // wait for them, however slow the machine.
  await setUpPad(page, 'Crickets', { padFadeOut: '20' });
  await setUpPad(page, 'Romance', { padFadeOut: '20' });
  const crickets = pad(page, 'Crickets');
  const romance = pad(page, 'Romance');
  await crickets.click();
  await romance.click();
  await expect(page.locator('#grid .pad--playing')).toHaveCount(2);

  await page.locator('#btnStop').click();
  await expect(page.locator('#btnStop')).toBeDisabled();
  await expect(page.locator('#grid .pad--playing')).toHaveCount(0);
});

test('a pad tapped while it fades out starts again, and keeps playing', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets');
  const left = () => secondsLeft(crickets);

  // Far enough in that starting again from the top shows on the clock, however
  // slowly the steps below run.
  await crickets.click();
  await expect.poll(left, { timeout: 15000 }).toBeLessThanOrEqual(21);
  await crickets.click();
  await expect(crickets).not.toHaveClass(/pad--playing/);

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeEnabled();
  expect(await left()).toBeGreaterThan(22);
  // Well past the end of the 3 s fade it interrupted, it is still running.
  await expectStillPlayingAfter(page, crickets, 4500);
});

test('a pad tapped after Stop, during the fade, starts again', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await page.locator('#btnStop').click();
  await expect(crickets).not.toHaveClass(/pad--playing/);

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
});

/**
 * Note every level the board sets on a gain node: a set is a jump, a ramp a
 * fade towards a level. Each node's level is kept in window.__levels, in the
 * order the nodes were first touched.
 */
async function watchLevels(page) {
  await page.addInitScript(() => {
    window.__levels = [];
    const note = (param, kind, value, time) => {
      let entry = window.__levels.find((e) => e.param === param);
      if (!entry) window.__levels.push((entry = { param, calls: [] }));
      entry.calls.push({ kind, value, time });
    };
    const set = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (value, time) {
      note(this, 'set', value, time);
      return set.call(this, value, time);
    };
    const ramp = AudioParam.prototype.exponentialRampToValueAtTime;
    AudioParam.prototype.exponentialRampToValueAtTime = function (value, time) {
      note(this, 'ramp', value, time);
      return ramp.call(this, value, time);
    };
  });
}

test('a pad tapped back on while it fades out comes up from where the fade got to', async ({ page }) => {
  await watchLevels(page);
  await openBoard(page);
  // A pad at full level, so its gain node is the one that rises above 0.9.
  await setUpPad(page, 'Suspense', { padFadeIn: '0.5', padFadeOut: '4' });
  const suspense = pad(page, 'Suspense');

  await suspense.click();
  await expect(suspense).toHaveClass(/pad--playing/);
  // Wait for the fade in to reach full level: that node is the pad's.
  await expect.poll(() => page.evaluate(() => window.__levels.findIndex((e) => e.param.value > 0.9)))
    .toBeGreaterThan(-1);
  const which = await page.evaluate(() => window.__levels.findIndex((e) => e.param.value > 0.9));

  await suspense.click();
  await expect(suspense).not.toHaveClass(/pad--playing/);
  const before = await page.evaluate((n) => window.__levels[n].calls.length, which);
  await suspense.click();
  await expect(suspense).toHaveClass(/pad--playing/);

  // Coming back on, the pad never drops to silence on the way.
  const jumps = await page.evaluate(({ n, from }) => window.__levels[n].calls.slice(from)
    .filter((c) => c.kind === 'set').map((c) => c.value), { n: which, from: before });
  expect(jumps.length).toBeGreaterThan(0);
  expect(Math.min(...jumps)).toBeGreaterThan(0.01);
});

test('a solo pad fades the others out on their own fade out, even with none of its own', async ({ page }) => {
  await watchLevels(page);
  await openBoard(page);
  await setUpPad(page, 'Crickets', { padSolo: true, padFadeOut: '0' });
  const romance = pad(page, 'Romance');
  const crickets = pad(page, 'Crickets');

  await romance.click();
  await expect(romance).toHaveClass(/pad--playing/);
  const before = await page.evaluate(() => window.__levels.map((e) => e.calls.length));
  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await expect(romance).not.toHaveClass(/pad--playing/);

  // Romance keeps its fade out of 3 s: a ramp to silence, not a cut.
  const fades = await page.evaluate((from) => window.__levels.flatMap((e, n) => {
    const calls = e.calls.slice(from[n] || 0);
    return calls.flatMap((c, k) => (c.kind === 'ramp' && c.value < 0.001 && k > 0 ? [c.time - calls[k - 1].time] : []));
  }), before);
  expect(fades.some((seconds) => seconds > 1)).toBe(true);
});

test('every pad on a big board is ready before it is tapped', async ({ page }) => {
  // Count the pads whose sound is loaded ahead of the show: the board loads
  // each pad's sound once, into an element it keeps for that pad.
  await page.addInitScript(() => {
    window.__loaded = 0;
    const load = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load = function () {
      if (this.preload === 'auto') window.__loaded += 1;
      return load.call(this);
    };
  });
  await openBoard(page);
  const board = {
    version: 3,
    cols: 10,
    rows: 6,
    pads: Array.from({ length: 60 }, (_, n) => ({ file: 'default/gunshot.mp3', name: `Shot ${n + 1}` })),
  };
  await page.evaluate(() => { window.__loaded = 0; });
  await page.locator('#importFile').setInputFiles({
    name: 'big.soundboard.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(board)),
  });
  await expect(page.locator('#grid .pad--filled')).toHaveCount(60);
  await expect.poll(() => page.evaluate(() => window.__loaded)).toBe(60);
});

test('a pad tapped while it fades in stops', async ({ page }) => {
  await openBoard(page);
  await setUpPad(page, 'Crickets', { padFadeIn: '3' });
  const crickets = pad(page, 'Crickets');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await crickets.click();
  await expect(crickets).not.toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeDisabled();
});

test('a pad fading towards its stop point still answers a tap by stopping', async ({ page }) => {
  await openBoard(page);
  // Stop at 4 s with a 3 s fade: the pad starts fading on its own after 1 s.
  await setUpPad(page, 'Crickets', { padEnd: '4', padFadeOut: '3', padLoop: false });
  const crickets = pad(page, 'Crickets');

  await crickets.click();
  await expect.poll(() => secondsLeft(crickets), { timeout: 4000 }).toBeLessThanOrEqual(2);
  await expect(crickets).toHaveClass(/pad--playing/);

  await crickets.click();
  await expect(crickets).not.toHaveClass(/pad--playing/);
  await expect(page.locator('#btnStop')).toBeDisabled();
});

/**
 * The seconds a playing pad's clock says are left. Tests compare it with a
 * margin rather than wait for one exact reading, which shows for a second
 * only and a busy machine can poll straight past.
 */
async function secondsLeft(padEl) {
  const [m, sec] = (await padEl.locator('.pad__time').textContent()).replace('-', '').split(':');
  return Number(m) * 60 + Number(sec);
}

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
  await setUpPad(page, 'Crickets', { padEnd: '2', padFadeOut: '1', padLoop: true });
  const crickets = pad(page, 'Crickets');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await expectStillPlayingAfter(page, crickets, 4500);

  await crickets.click();
  await expect(crickets).not.toHaveClass(/pad--playing/);
});

test('a looping pad with no start or stop point goes round when its file ends', async ({ page }) => {
  await openBoard(page);
  // The gunshot lasts 2.9 s; with nothing trimmed, the file loops by itself.
  await setUpPad(page, 'Gunshot', { padLoop: true });
  const gunshot = pad(page, 'Gunshot');

  await gunshot.click();
  await expect(gunshot).toHaveClass(/pad--playing/);
  await expectStillPlayingAfter(page, gunshot, 4500);

  await page.locator('#btnStop').click();
  await expect(gunshot).not.toHaveClass(/pad--playing/);
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

test('Space stops the show after a button is clicked, and does not press it again', async ({ page }) => {
  await openBoard(page);
  const crickets = pad(page, 'Crickets');
  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);

  // Into edit mode and out again: the focus stays on the button, as it does
  // under a mouse.
  const edit = page.locator('#btnEdit');
  await edit.click();
  await edit.click();
  await expect(edit).toHaveAttribute('aria-pressed', 'false');
  await expect(edit).toBeFocused();

  await page.keyboard.press(' ');
  await expect(crickets).not.toHaveClass(/pad--playing/);
  await expect(edit).toHaveAttribute('aria-pressed', 'false');
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
  await setUpPad(page, 'Crickets', { padEnd: '2', padFadeOut: '0', padLoop: false });
  const crickets = pad(page, 'Crickets');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await page.evaluate(() => window.switchTab(true));

  // The operator is reading the script elsewhere; the cue still ends on time.
  await expect(crickets).not.toHaveClass(/pad--playing/, { timeout: 5000 });
  await expect(page.locator('#btnStop')).toBeDisabled();
  await page.evaluate(() => window.switchTab(false));
  await expect(crickets).not.toHaveClass(/pad--playing/);
});

test('the pads are played by touch: a letter on a keyboard fires none of them', async ({ page }) => {
  await openBoard(page);
  await expect(page.locator('#grid .pad__key')).toHaveCount(0);

  // The keys the first board's pads used to answer to.
  for (const key of ['1', 'q', 'e', 'a', 'z', 'x']) await page.keyboard.press(key);
  await page.locator('#btnStop').focus();
  await expect(page.locator('#grid .pad--playing')).toHaveCount(0);
  await expect(page.locator('#btnStop')).toBeDisabled();
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
    // Loud from its first second, and looping, so it is still sounding when measured.
    const storm = pad(page, 'Storm');
    await storm.click();
    await expect(storm).toHaveClass(/pad--playing/);

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
    const crickets = pad(page, 'Crickets');

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

test('Reconnect in the middle of a cue cuts nothing', async ({ page }) => {
  // A real folder handle, from the browser's own private storage, stands in
  // for the operator's folder. Each page load starts without permission to
  // read it, as browsers do, so the board offers Reconnect.
  await page.addInitScript(() => {
    let granted = false;
    FileSystemHandle.prototype.queryPermission = async () => (granted ? 'granted' : 'prompt');
    FileSystemHandle.prototype.requestPermission = async () => {
      granted = true;
      return 'granted';
    };
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle('Show');
    };
  });
  await openBoard(page);
  const writeRain = (seconds) => page.evaluate(async (bytes) => {
    const root = await navigator.storage.getDirectory();
    const show = await root.getDirectoryHandle('Show', { create: true });
    const file = await show.getFileHandle('rain.wav', { create: true });
    const out = await file.createWritable();
    await out.write(new Uint8Array(bytes));
    await out.close();
  }, [...silentWav(seconds)]);
  await writeRain(30);

  await page.locator('#btnEdit').click();
  // The first board is full; make room for the folder's sound.
  await pencil(page, 'Sting').click();
  await page.locator('#padClear').click();
  await expect(pad(page, 'Sting')).toHaveCount(0);
  await showSounds(page);
  await page.locator('#btnAdd').click();
  await page.locator('#btnAddFolder').click();
  await page.locator('#lib .tree__name', { hasText: 'Show' }).click();
  await page.locator('#lib .lib__item', { hasText: 'rain' }).locator('.lib__add').click();
  await expect(pad(page, 'Rain')).toHaveCount(1);
  await expect(page.locator('#toast')).toContainText('is on row');
  if (isNarrow(page)) await expect(page.locator('#book')).toBeHidden();
  await page.locator('#btnEdit').click();

  await page.reload();
  const reconnect = page.locator('#btnReconnect');
  await expect(reconnect).toHaveText('Reconnect “Show”');

  // Both pads play from what the board kept: a sound that ships with it, and
  // the copy of the folder's.
  const crickets = pad(page, 'Crickets');
  const rain = pad(page, 'Rain');
  await crickets.click();
  await rain.click();
  await expect(page.locator('#grid .pad--playing')).toHaveCount(2);

  // Meanwhile the file in the folder has been made longer than its copy.
  await writeRain(45);
  await reconnect.click();
  await expect(reconnect).toBeHidden();
  await expectStillPlayingAfter(page, rain, 1500);
  await expect(crickets).toHaveClass(/pad--playing/);

  // Once stopped, the pad plays again, now from the folder's longer file.
  await page.keyboard.press('Escape');
  await expect(rain).not.toHaveClass(/pad--playing/);
  await rain.click();
  await expect(rain).toHaveClass(/pad--playing/);
  await expect(rain.locator('.pad__time')).toHaveText(/^-0:4[0-5]$/);
});

test.describe('a second tap', () => {
  test('fades out, by default', async ({ page }) => {
    await openBoard(page);
    const crickets = pad(page, 'Crickets');
    await crickets.click();
    await expect(crickets).toHaveClass(/pad--playing/);
    await crickets.click();
    await expect(crickets).not.toHaveClass(/pad--playing/);
    await expect(page.locator('#btnStop')).toBeDisabled();
  });

  test('starts over', async ({ page }) => {
    await openBoard(page);
    await setUpPad(page, 'Crickets', { padTap: 'restart' });
    const crickets = pad(page, 'Crickets');
    const left = () => secondsLeft(crickets);

    // Far enough in that starting over shows on the clock.
    await crickets.click();
    await expect.poll(left, { timeout: 15000 }).toBeLessThanOrEqual(21);
    await crickets.click();
    await expect.poll(left).toBeGreaterThan(22);
    await expect(crickets).toHaveClass(/pad--playing/);
  });

  test('pauses, and the next one carries on', async ({ page }) => {
    await openBoard(page);
    await setUpPad(page, 'Crickets', { padTap: 'pause' });
    const crickets = pad(page, 'Crickets');
    const left = () => secondsLeft(crickets);

    await crickets.click();
    await expect.poll(left, { timeout: 15000 }).toBeLessThanOrEqual(24);
    await crickets.click();
    await expect(crickets).toHaveClass(/pad--paused/);
    await expect(crickets).not.toHaveClass(/pad--playing/);
    const held = await left();
    expect(held).toBeLessThanOrEqual(24);

    await crickets.click();
    await expect(crickets).toHaveClass(/pad--playing/);
    await expect(crickets).not.toHaveClass(/pad--paused/);
    // From where it was held, not from the top.
    expect(await left()).toBeLessThanOrEqual(held);
  });

  test('layers the sound over itself', async ({ page }) => {
    await openBoard(page);
    await setUpPad(page, 'Crickets', { padTap: 'overlay' });
    const crickets = pad(page, 'Crickets');

    await crickets.click();
    await expect(crickets).toHaveClass(/pad--playing/);
    await crickets.click();
    await expect(crickets).toHaveClass(/pad--playing/);
    await expect(crickets.locator('.pad__stack')).toHaveText('×2');
    await crickets.click();
    await expect(crickets.locator('.pad__stack')).toHaveText('×3');

    await page.locator('#btnStop').click();
    await expect(crickets).not.toHaveClass(/pad--playing/);
    await expect(crickets.locator('.pad__stack')).toHaveCount(0);
  });

  test('does nothing', async ({ page }) => {
    await openBoard(page);
    await setUpPad(page, 'Crickets', { padTap: 'ignore' });
    const crickets = pad(page, 'Crickets');
    const left = () => secondsLeft(crickets);

    await crickets.click();
    await expect.poll(left, { timeout: 15000 }).toBeLessThanOrEqual(24);
    const before = await left();
    await crickets.click();
    await expect(crickets).toHaveClass(/pad--playing/);
    await expect(crickets.locator('.pad__stack')).toHaveCount(0);
    // It runs on from where it was rather than starting over.
    expect(await left()).toBeLessThanOrEqual(before);
    await expect.poll(left, { timeout: 5000 }).toBeLessThanOrEqual(before - 2);
  });
});

test('a pad with a start point plays from there', async ({ page }) => {
  await openBoard(page);
  await setUpPad(page, 'Crickets', { padStart: '20' });
  const crickets = pad(page, 'Crickets');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  // From 20 s into a 26 s sound: 6 s or a little less are left, never more.
  await expect.poll(() => secondsLeft(crickets)).toBeLessThanOrEqual(6);
  expect(await secondsLeft(crickets)).toBeGreaterThan(2);
});

