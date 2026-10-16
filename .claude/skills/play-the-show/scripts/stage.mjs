// The operator's browser, kept open between commands, so a show can be played
// one move at a time: act, look at the screen, decide the next move.
//
//   node stage.mjs open [--phone] [--fresh] [--out DIR]   start it (run in the background)
//   node stage.mjs do '<js>'                               act, then take a screenshot
//   node stage.mjs close                                   shut it down
//
// `do` runs its code as the body of an async function. In scope: `page`,
// `context`, `pad(title)`, `pick(paths)`, `ear()`, `wait(seconds)`,
// `note(text)`. It prints what the code returns, what the board logged to the
// console since the last command, and the path of the screenshot.
//
// The browser profile is kept in DIR/profile, so closing and opening again is
// the operator coming back the next day: same board, same kept copies.
// --fresh wipes it first, a first launch.

import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CONTROL = 4180;
const SITE = 4174;
const TOKEN = join(tmpdir(), 'soundboard-stage.token');
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => rest.includes(name);
const option = (name, fallback) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : fallback;
};

if (cmd === 'open') await open();
else if (cmd === 'do') await send({ code: rest.join(' ') });
else if (cmd === 'close') await send({ close: true });
else {
  console.error('usage: stage.mjs open [--phone] [--fresh] [--out DIR] | do <js> | close');
  process.exit(2);
}

async function open() {
  // The control port is taken first: a second stage stops here, before it
  // launches a browser on a profile the first one holds.
  const server = createServer();
  await new Promise((done) => {
    server.once('error', () => {
      console.error(`A stage is already open on port ${CONTROL}: close it first.`);
      process.exit(1);
    });
    server.listen(CONTROL, '127.0.0.1', done);
  });
  // Only this checkout's shell can drive the stage: the token is in a file
  // only this user reads, and a web page cannot send the header without asking.
  const token = randomBytes(16).toString('hex');
  writeFileSync(TOKEN, token, { mode: 0o600 });

  const { chromium, devices } = await import(join(REPO, 'node_modules/@playwright/test/index.mjs'));
  const out = resolve(option('--out', join(tmpdir(), 'soundboard-stage')));
  const profile = join(out, 'profile');
  if (flag('--fresh')) rmSync(profile, { recursive: true, force: true });
  mkdirSync(join(out, 'shots'), { recursive: true });

  // The stage serves this checkout itself, on a port of its own, so it never
  // plays a show on a server another clone or the test suite left running.
  if (await reachable(`http://localhost:${SITE}/`)) {
    console.error(`Something already answers on port ${SITE}: stop it first.`);
    process.exit(1);
  }
  const site = spawn('node', [join(REPO, 'e2e/serve.js'), String(SITE)], { stdio: 'ignore' });
  process.on('exit', () => site.kill());
  while (!(await reachable(`http://localhost:${SITE}/`))) await sleep(0.2);

  const device = flag('--phone') ? devices['Pixel 7'] : devices['Desktop Chrome'];
  const { defaultBrowserType, ...look } = device;
  const context = await chromium.launchPersistentContext(profile, {
    ...look,
    channel: 'chromium',
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  await context.addInitScript(stagecraft);

  const page = context.pages()[0] || (await context.newPage());
  // A move that cannot be made says so in seconds, as a missing button would
  // to an operator, rather than hanging the show for half a minute.
  page.setDefaultTimeout(5000);
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  let picked = [];
  page.on('filechooser', (chooser) => chooser.setFiles(picked).catch((e) => logs.push(`filechooser: ${e.message}`)));
  await page.goto(`http://localhost:${SITE}/`);

  const scope = {
    page,
    context,
    pad: (title) => page.locator('#grid .pad--filled', { hasText: title }),
    pick: (paths) => { picked = [].concat(paths); },
    ear: () => page.evaluate(() => window.__ear()),
    wait: (seconds) => sleep(seconds),
    note: (text) => appendFileSync(join(out, 'log.md'), `- ${new Date().toISOString().slice(11, 19)} ${text}\n`),
  };
  const AsyncFunction = (async () => {}).constructor;
  let shot = 0;

  server.on('request', async (req, res) => {
    if (req.headers['x-stage-token'] !== token) return void res.writeHead(403).end();
    let body;
    try {
      body = JSON.parse(await text(req));
    } catch {
      return void res.writeHead(400).end('not a command\n');
    }
    if (body.close) {
      res.end('closed\n');
      await context.close();
      site.kill();
      rmSync(TOKEN, { force: true });
      server.close();
      return;
    }
    const lines = [];
    try {
      const run = new AsyncFunction(...Object.keys(scope), body.code);
      const value = await run(...Object.values(scope));
      if (value !== undefined) lines.push(`=> ${JSON.stringify(value)}`);
    } catch (e) {
      lines.push(`error: ${e.message.split('\n')[0]}`);
    }
    if (logs.length) lines.push(...logs.splice(0).map((l) => `console ${l}`));
    const file = join(out, 'shots', `${String(++shot).padStart(3, '0')}.png`);
    try {
      await page.screenshot({ path: file });
      lines.push(`screen: ${file}`);
    } catch (e) {
      lines.push(`screen: none (${e.message.split('\n')[0]})`);
    }
    res.end(lines.join('\n') + '\n');
  });
  console.log(`stage open on ${look.viewport.width}px, profile ${profile}`);
}

// Runs in the page before the board does. What a test would stub, the
// operator's own browser simply has; and the ear stands in for the speakers.
function stagecraft() {
  // A phone that allows the screen to stay awake: headless Chromium refuses,
  // and the board's warning would cover the pads all show long.
  Object.defineProperty(navigator, 'wakeLock', {
    value: {
      request: async () => Object.assign(new EventTarget(), { released: false, type: 'screen', release: async () => {} }),
    },
  });
  // The pickers cannot be answered from here; without them the board offers
  // the file input, which `pick()` answers, as it does in Firefox or Safari.
  delete window.showOpenFilePicker;
  delete window.showDirectoryPicker;

  // Whatever reaches the speakers also reaches a meter.
  const ears = new Map();
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...more) {
    if (target instanceof AudioDestinationNode) {
      let meter = ears.get(target.context);
      if (!meter) {
        meter = target.context.createAnalyser();
        meter.fftSize = 2048;
        ears.set(target.context, meter);
      }
      connect.call(this, meter);
    }
    return connect.call(this, target, ...more);
  };
  // The loudest level reaching the speakers right now, in dB; -100 is silence.
  window.__ear = () => {
    let peak = 0;
    for (const meter of ears.values()) {
      const data = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(data);
      for (const v of data) peak = Math.max(peak, Math.abs(v));
    }
    return peak ? Math.max(-100, Math.round(20 * Math.log10(peak) * 10) / 10) : -100;
  };
}

async function send(body) {
  let token = '';
  try {
    token = readFileSync(TOKEN, 'utf8');
  } catch { /* no stage open: the request below says so */ }
  const req = request({ host: '127.0.0.1', port: CONTROL, method: 'POST', path: '/', headers: { 'x-stage-token': token } });
  req.on('error', () => {
    console.error('The stage is not open: run `stage.mjs open` in the background first.');
    process.exit(1);
  });
  req.end(JSON.stringify(body));
  const res = await new Promise((done) => req.on('response', done));
  process.stdout.write(await text(res));
}

function text(stream) {
  return new Promise((done) => {
    let data = '';
    stream.on('data', (chunk) => (data += chunk));
    stream.on('end', () => done(data));
  });
}

async function reachable(url) {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
}

function sleep(seconds) {
  return new Promise((done) => setTimeout(done, seconds * 1000));
}
