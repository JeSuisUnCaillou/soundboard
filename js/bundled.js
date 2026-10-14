// The handful of sounds that ship with the board, so a first launch has
// something to press. They live in sounds/ and are served with the app, which
// means they need no permission, no copy in the browser's storage, and no
// folder: the pads point straight at them.
//
// To add one: drop the file in sounds/, add a line here, and add it to the
// service worker's shell so it is there with the network off.

export const BUNDLED_DIR = 'default';

export const BUNDLED = [
  // A gunshot that fades in is not a gunshot, and two shots are two shots.
  { file: 'gunshot.mp3', pad: { fadeIn: 0, tap: 'overlay' } },
  { file: 'crickets ambiance.wav', pad: { gel: 'moss' } },
  { file: 'sexy.mp3', pad: { gel: 'surprise-pink' } },
];

const BY_PATH = new Map(BUNDLED.map((s) => [`${BUNDLED_DIR}/${s.file}`, s]));

export function bundledPaths() {
  return BUNDLED.map((s) => `${BUNDLED_DIR}/${s.file}`);
}

/** How a pad for one of these should differ from the board's defaults. */
export function bundledPad(path) {
  const sound = BY_PATH.get(path);
  return (sound && sound.pad) || null;
}

export function isBundledPath(path) {
  return BY_PATH.has(path);
}
