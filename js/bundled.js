// The handful of sounds that ship with the board, so a first launch has
// something to press. They live in sounds/ and are served with the app, which
// means they need no permission, no copy in the browser's storage, and no
// folder: the pads point straight at them.
//
// To add one: drop the file in sounds/, add a line here, and add it to the
// service worker's shell so it is there with the network off. They are sounds
// like any other — their pads are set up by the same rules, not by their names.

export const BUNDLED_DIR = 'default';

export const BUNDLED = ['gunshot.mp3', 'crickets ambiance.wav', 'sexy.mp3'];

const PATHS = BUNDLED.map((file) => `${BUNDLED_DIR}/${file}`);

export function bundledPaths() {
  return [...PATHS];
}

export function isBundledPath(path) {
  return PATHS.includes(path);
}
