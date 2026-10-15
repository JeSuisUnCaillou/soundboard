// Running the show: the first board, firing pads, stopping them.

import { test, expect, BUNDLED_TITLES, openBoard, pad, pencil } from './helpers.js';

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
  const left = async () => {
    const [m, sec] = (await crickets.locator('.pad__time').textContent()).replace('-', '').split(':');
    return Number(m) * 60 + Number(sec);
  };

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
  // Well past the end of the 1.5 s fade it interrupted, it is still running.
  await expectStillPlayingAfter(page, crickets, 3000);
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
  await setUpPad(page, 'Crickets ambiance', { padFadeIn: '0.5', padFadeOut: '4' });
  const crickets = pad(page, 'Crickets ambiance');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  // Wait for the fade in to reach full level: that node is the pad's.
  await expect.poll(() => page.evaluate(() => window.__levels.findIndex((e) => e.param.value > 0.9)))
    .toBeGreaterThan(-1);
  const which = await page.evaluate(() => window.__levels.findIndex((e) => e.param.value > 0.9));

  await crickets.click();
  await expect(crickets).not.toHaveClass(/pad--playing/);
  const before = await page.evaluate((n) => window.__levels[n].calls.length, which);
  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);

  // Coming back on, the pad never drops to silence on the way.
  const jumps = await page.evaluate(({ n, from }) => window.__levels[n].calls.slice(from)
    .filter((c) => c.kind === 'set').map((c) => c.value), { n: which, from: before });
  expect(jumps.length).toBeGreaterThan(0);
  expect(Math.min(...jumps)).toBeGreaterThan(0.01);
});

test('a solo pad fades the others out on their own fade out, even with none of its own', async ({ page }) => {
  await watchLevels(page);
  await openBoard(page);
  await setUpPad(page, 'Crickets ambiance', { padSolo: true, padFadeOut: '0' });
  const sexy = pad(page, 'Sexy');
  const crickets = pad(page, 'Crickets ambiance');

  await sexy.click();
  await expect(sexy).toHaveClass(/pad--playing/);
  const before = await page.evaluate(() => window.__levels.map((e) => e.calls.length));
  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await expect(sexy).not.toHaveClass(/pad--playing/);

  // Sexy keeps its fade out of 1.5 s: a ramp to silence, not a cut.
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

test('a pad’s own key fires it', async ({ page }) => {
  await openBoard(page);
  await setUpPad(page, 'Crickets ambiance', { padKey: 'm' });
  const crickets = pad(page, 'Crickets ambiance');
  await expect(crickets.locator('.pad__key')).toHaveText('m');

  await page.keyboard.press('m');
  await expect(crickets).toHaveClass(/pad--playing/);
  await page.keyboard.press('m');
  await expect(crickets).not.toHaveClass(/pad--playing/);
});

test.describe('a second tap', () => {
  test('fades out, by default', async ({ page }) => {
    await openBoard(page);
    const crickets = pad(page, 'Crickets ambiance');
    await crickets.click();
    await expect(crickets).toHaveClass(/pad--playing/);
    await crickets.click();
    await expect(crickets).not.toHaveClass(/pad--playing/);
    await expect(page.locator('#btnStop')).toBeDisabled();
  });

  test('starts over', async ({ page }) => {
    await openBoard(page);
    await setUpPad(page, 'Crickets ambiance', { padTap: 'restart' });
    const crickets = pad(page, 'Crickets ambiance');
    const time = crickets.locator('.pad__time');

    await crickets.click();
    await expect(time).toHaveText('-0:23', { timeout: 6000 });
    await crickets.click();
    await expect(time).toHaveText(/-0:2[56]/);
    await expect(crickets).toHaveClass(/pad--playing/);
  });

  test('pauses, and the next one carries on', async ({ page }) => {
    await openBoard(page);
    await setUpPad(page, 'Crickets ambiance', { padTap: 'pause' });
    const crickets = pad(page, 'Crickets ambiance');
    const time = crickets.locator('.pad__time');

    await crickets.click();
    await expect(time).toHaveText('-0:24', { timeout: 5000 });
    await crickets.click();
    await expect(crickets).toHaveClass(/pad--paused/);
    await expect(crickets).not.toHaveClass(/pad--playing/);
    const held = await time.textContent();
    expect(held).toMatch(/-0:2[34]/);

    await crickets.click();
    await expect(crickets).toHaveClass(/pad--playing/);
    await expect(crickets).not.toHaveClass(/pad--paused/);
    await expect(time).toHaveText(/-0:2[234]/);
  });

  test('layers the sound over itself', async ({ page }) => {
    await openBoard(page);
    await setUpPad(page, 'Crickets ambiance', { padTap: 'overlay' });
    const crickets = pad(page, 'Crickets ambiance');

    await crickets.click();
    await expect(crickets).toHaveClass(/pad--playing/);
    await crickets.click();
    await expect(crickets).toHaveClass(/pad--playing/);
    await expect(crickets.locator('.pad__stack')).toHaveText('×2');

    await page.locator('#btnStop').click();
    await expect(crickets).not.toHaveClass(/pad--playing/);
    await expect(crickets.locator('.pad__stack')).toHaveCount(0);
  });

  test('does nothing', async ({ page }) => {
    await openBoard(page);
    await setUpPad(page, 'Crickets ambiance', { padTap: 'ignore' });
    const crickets = pad(page, 'Crickets ambiance');
    const time = crickets.locator('.pad__time');

    await crickets.click();
    await expect(time).toHaveText('-0:24', { timeout: 5000 });
    await crickets.click();
    await expect(crickets).toHaveClass(/pad--playing/);
    await expect(crickets.locator('.pad__stack')).toHaveCount(0);
    // It runs on from where it was rather than starting over.
    await expect(time).toHaveText('-0:22', { timeout: 4000 });
  });
});

test('a pad with a start point plays from there', async ({ page }) => {
  await openBoard(page);
  await setUpPad(page, 'Crickets ambiance', { padStart: '20' });
  const crickets = pad(page, 'Crickets ambiance');

  await crickets.click();
  await expect(crickets).toHaveClass(/pad--playing/);
  await expect(crickets.locator('.pad__time')).toHaveText(/-0:0[56]/);
});

