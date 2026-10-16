// Shared steps for the board's end-to-end tests.

import { test as base, expect } from '@playwright/test';

/**
 * Every test runs with a screen wake lock that is granted, as it is on a phone
 * that allows one. Headless Chromium refuses it, and the board's warning about
 * that would cover whatever a test is waiting to read.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const sentinel = () => Object.assign(new EventTarget(), {
        released: false,
        type: 'screen',
        release: async () => {},
      });
      Object.defineProperty(navigator, 'wakeLock', {
        value: { request: async () => sentinel() },
      });
    });
    await use(page);
  },
});

export { expect };

/** The sounds that ship with the board, as their pads name them. */
export const BUNDLED_TITLES = [
  'Gunshot', 'Explosion', 'Phone', 'Sting',
  'Storm', 'Crickets', 'Birds',
  'Suspense', 'Romance', 'Sad', 'Hero', 'Happy',
];

/** A pad on the board, found by the name it shows. */
export function pad(page, title) {
  return page.locator('#grid .pad--filled', { hasText: title });
}

/**
 * The pencil that opens a pad's settings in edit mode, found by its label. The
 * label has the name as stored; the pad shows it capitalised.
 */
export function pencil(page, title) {
  const name = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.getByRole('button', { name: new RegExp(`^Set up ${name}$`, 'i') });
}

/**
 * The first board is full: take Sting, its fourth pad, off it so a sound can
 * go on the board. Edit mode must be on.
 */
export async function makeRoom(page) {
  await pencil(page, 'Sting').click();
  await page.locator('#padClear').click();
  await expect(page.locator('#grid .pad').nth(3)).toHaveClass(/pad--empty/);
}

/** Open the board fresh, and wait for the first launch to lay out its sounds. */
export async function openBoard(page) {
  await page.goto('/');
  await expect(page.locator('#grid .pad--filled')).toHaveCount(BUNDLED_TITLES.length);
}

/** The narrow layout: the sounds open over the board instead of beside it. */
export function isNarrow(page) {
  return page.viewportSize().width <= 900;
}

/** Show the folder's tree, wherever this layout keeps it, if it is not open already. */
export async function showSounds(page) {
  // Asked by the button rather than by the tree's visibility, and asked again
  // until the tree shows: the board may be opening the tree itself (after a
  // reload, or for a waiting pad), and once open it covers the button.
  const browse = page.locator('#btnBrowse');
  const book = page.locator('#book');
  await expect(async () => {
    if (isNarrow(page) && (await browse.getAttribute('aria-expanded')) !== 'true') await browse.click({ timeout: 1000 });
    await expect(book).toBeVisible({ timeout: 1000 });
  }).toPass();
}

/**
 * A short, silent WAV, made here rather than kept in the repository: enough
 * for the browser to read its length and play it.
 */
export function silentWav(seconds = 1, rate = 8000) {
  const samples = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(1, 22);          // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples * 2, 40);
  return buf;
}
