// Reading sounds off the local disk, four ways, in order of how much the
// browser is willing to remember afterwards.
//
//  1. File System Access API (Chrome and Edge on the desktop): a real folder
//     handle that can be stored and reopened on the next launch.
//  2. A folder dropped onto the window: the same handle where available,
//     otherwise the older webkitGetAsEntry walk, which Firefox and Safari do.
//  3. <input type="file" webkitdirectory>: a snapshot of the folder's files
//     and nothing that outlives the session. Chrome on Android included.
//  4. Plain multi-file picking, for iOS, where a folder cannot be chosen at all.
//
// Every one of them reads the audio straight from disk; none of them upload it.

const AUDIO = /\.(mp3|m4a|m4r|aac|wav|aif|aiff|flac|ogg|oga|opus|weba|webm)$/i;
const SKIP = /^(\.|__MACOSX$|node_modules$)/;

export const CAN_PERSIST = typeof window.showDirectoryPicker === 'function';

function sortPaths(a, b) {
  return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
}

export class Library {
  constructor() {
    this.mode = null;        // 'handle' | 'files'
    this.name = '';
    this.handle = null;
    this.entries = new Map(); // path -> { path, name, dir, handle?, file? }
    this._urls = new Map();   // path -> blob URL
  }

  get isOpen() {
    return this.entries.size > 0 || !!this.handle;
  }

  get list() {
    return [...this.entries.values()].sort(sortPaths);
  }

  /** Ask for a folder. Returns false when the picker is dismissed. */
  async pick() {
    if (CAN_PERSIST) {
      let handle;
      try {
        handle = await window.showDirectoryPicker({ id: 'soundboard-folder', mode: 'read' });
      } catch (err) {
        if (err && err.name === 'AbortError') return false;
        throw err;
      }
      await this.useHandle(handle);
      return true;
    }
    const files = await pickWithInput(true);
    if (!files) return false;
    await this.useFiles(files);
    return true;
  }

  /**
   * Picking the sounds themselves rather than the folder holding them, for
   * iOS and anywhere else the folder picker is missing or comes back empty.
   */
  async pickFiles() {
    const files = await pickWithInput(false);
    if (!files) return false;
    await this.useFiles(files);
    return true;
  }

  async useHandle(handle) {
    if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') {
      const granted = await handle.requestPermission({ mode: 'read' });
      if (granted !== 'granted') throw new DOMException('Permission to read the folder was refused', 'NotAllowedError');
    }
    this.reset();
    this.mode = 'handle';
    this.handle = handle;
    this.name = handle.name;
    await walkHandle(handle, '', this.entries);
    return this.entries.size;
  }

  /** Reopen a stored handle without prompting. Returns false if it needs a click. */
  async tryHandle(handle) {
    if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') return false;
    await this.useHandle(handle);
    return true;
  }

  async useFiles(fileList) {
    this.reset();
    this.mode = 'files';
    const files = [...fileList].filter((f) => AUDIO.test(f.name));
    let root = '';
    for (const f of files) {
      const rel = f.webkitRelativePath || f.name;
      const parts = rel.split('/');
      if (parts.length > 1 && !root) root = parts[0];
      const path = parts.length > 1 ? parts.slice(1).join('/') : rel;
      if (parts.some((p) => SKIP.test(p))) continue;
      this.entries.set(path, { path, name: f.name, dir: path.split('/').slice(0, -1).join('/'), file: f });
    }
    this.name = root || (files.length ? 'Chosen sounds' : 'Dropped files');
    return this.entries.size;
  }

  /** A folder dragged onto the window. */
  async useDrop(dataTransfer) {
    const items = [...dataTransfer.items].filter((i) => i.kind === 'file');
    if (!items.length) return 0;

    if (CAN_PERSIST && typeof items[0].getAsFileSystemHandle === 'function') {
      const handle = await items[0].getAsFileSystemHandle();
      if (handle && handle.kind === 'directory') return this.useHandle(handle);
    }

    const entries = items.map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
    const dir = entries.find((e) => e.isDirectory);
    if (!dir) return 0;
    this.reset();
    this.mode = 'files';
    this.name = dir.name;
    await walkEntry(dir, '', this.entries);
    return this.entries.size;
  }

  has(path) {
    return this.entries.has(path);
  }

  async file(path) {
    const entry = this.entries.get(path);
    if (!entry) throw new Error(`"${path}" is not in this folder`);
    if (entry.file) return entry.file;
    const file = await entry.handle.getFile();
    entry.file = file;
    return file;
  }

  /** A blob URL for the file, made once and kept for the session. */
  async url(path) {
    const cached = this._urls.get(path);
    if (cached) return cached;
    const url = URL.createObjectURL(await this.file(path));
    this._urls.set(path, url);
    return url;
  }

  reset() {
    for (const url of this._urls.values()) URL.revokeObjectURL(url);
    this._urls.clear();
    this.entries.clear();
    this.handle = null;
    this.name = '';
    this.mode = null;
  }
}

async function walkHandle(dir, prefix, out, depth = 0) {
  if (depth > 6) return;
  for await (const [name, handle] of dir.entries()) {
    if (SKIP.test(name)) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      await walkHandle(handle, path, out, depth + 1);
    } else if (AUDIO.test(name)) {
      out.set(path, { path, name, dir: prefix, handle });
    }
  }
}

function walkEntry(dir, prefix, out, depth = 0) {
  if (depth > 6) return Promise.resolve();
  const reader = dir.createReader();
  return new Promise((resolve, reject) => {
    const batch = [];
    const read = () => {
      reader.readEntries(async (entries) => {
        if (!entries.length) {
          try {
            await Promise.all(batch);
            resolve();
          } catch (err) {
            reject(err);
          }
          return;
        }
        for (const entry of entries) {
          if (SKIP.test(entry.name)) continue;
          const path = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory) {
            batch.push(walkEntry(entry, path, out, depth + 1));
          } else if (AUDIO.test(entry.name)) {
            batch.push(new Promise((res, rej) => entry.file((file) => {
              out.set(path, { path, name: entry.name, dir: prefix, file });
              res();
            }, rej)));
          }
        }
        read();
      }, reject);
    };
    read();
  });
}

function pickWithInput(wholeFolder) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (wholeFolder) input.webkitdirectory = true;
    else input.accept = 'audio/*';
    input.style.display = 'none';
    document.body.append(input);
    const done = (value) => {
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => done(input.files && input.files.length ? input.files : false), { once: true });
    // No reliable cancel event; a focus return with no files means dismissed.
    window.addEventListener('focus', () => setTimeout(() => {
      if (input.isConnected && (!input.files || !input.files.length)) done(false);
    }, 400), { once: true });
    input.click();
  });
}
