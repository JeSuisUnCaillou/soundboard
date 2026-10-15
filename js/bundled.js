// The sounds that ship with the board, so a first launch is a board an improv
// troupe can play a show on: four effects, three places and five moods. They
// live in sounds/ and are served with the app, which means they need no
// permission, no copy in the browser's storage, and no folder: the pads point
// straight at them.
//
// Each comes with how its pad is set up on the Default board: a short title;
// the effects fire at once and layer, the places and the music loop and fade;
// and the levels even out sounds recorded far louder or quieter than the rest.
// The colour says which group a pad belongs to. These settings are only where the
// Default board starts; a pad the operator makes from one later is set up by
// the same rules as any other sound.
//
// To add one: drop the file in sounds/, add a line here, and add it to the
// service worker's shell so it is there with the network off.

export const BUNDLED_DIR = 'default';

const HIT = { gel: 'daylight', fadeIn: 0, fadeOut: 0.5, tap: 'overlay' };
const PLACE = { gel: 'moss', fadeIn: 2, fadeOut: 3, loop: true };
const MOOD = { gel: 'lavender', fadeIn: 1, fadeOut: 3, loop: true };

export const BUNDLED = [
  { file: 'gunshot.mp3', name: 'Gunshot', ...HIT },
  { file: 'explosion.mp3', name: 'Explosion', ...HIT, gain: 0.55 },
  { file: 'phone.mp3', name: 'Phone', ...HIT, gain: 0.35, tap: 'fadeout' },
  { file: 'sting.mp3', name: 'Sting', ...HIT },
  { file: 'storm.mp3', name: 'Storm', ...PLACE, gain: 0.5 },
  { file: 'crickets.mp3', name: 'Crickets', ...PLACE, gain: 0.8 },
  { file: 'birds.mp3', name: 'Birds', ...PLACE },
  { file: 'suspense.mp3', name: 'Suspense', ...MOOD },
  { file: 'romance.mp3', name: 'Romance', ...MOOD, gain: 0.85 },
  { file: 'sad.mp3', name: 'Sad', ...MOOD, gain: 0.75 },
  { file: 'hero.mp3', name: 'Hero', ...MOOD, gain: 0.65 },
  { file: 'happy.mp3', name: 'Happy', ...MOOD, gain: 0.45 },
];

const SETUP = new Map(BUNDLED.map(({ file, ...setup }) => [`${BUNDLED_DIR}/${file}`, setup]));

export function bundledPaths() {
  return [...SETUP.keys()];
}

export function isBundledPath(path) {
  return SETUP.has(path);
}

/** How the Default board sets up the pad for a bundled sound. */
export function bundledSetup(path) {
  return { ...SETUP.get(path) };
}
