// The sounds the board can reach, gathered from one or more places on the local
// disk and added to, never swapped out: a folder, a handful of files, another
// folder later in the week. Nothing is uploaded; every read goes straight to
// the file the operator chose.
//
// Where the File System Access API exists (Chrome and Edge on the desktop),
// each source is kept as a handle, which can be stored and reopened on the next
// launch. Elsewhere the browser hands over a snapshot of files and nothing that
// outlives the session, and on iOS, where no folder can be chosen at all, the
// sounds are picked one by one.

const AUDIO = /\.(mp3|m4a|m4r|aac|wav|aif|aiff|flac|ogg|oga|opus|weba|webm)$/i;
const SKIP = /^(\.|__MACOSX$|node_modules$)/;

const PICKER_TYPES = [{
  description: 'Audio',
  accept: {
    'audio/*': ['.mp3', '.m4a', '.m4r', '.aac', '.wav', '.aif', '.aiff', '.flac', '.ogg', '.oga', '.opus', '.weba', '.webm'],
  },
}];

export const CAN_PERSIST = typeof window.showDirectoryPicker === 'function';
export const CAN_PICK_FILE_HANDLES = typeof window.showOpenFilePicker === 'function';

function sortPaths(a, b) {
  return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
}

export class Library {
  constructor() {
    this.sources = [];        // { key, kind: 'dir' | 'file' | 'files', name, handle? }
    this.entries = new Map(); // path -> { path, name, dir, src, handle?, file? }
    this._urls = new Map();   // path -> blob URL
    this._nextKey = 1;
  }

  get isOpen() {
    return this.entries.size > 0;
  }

  /** The first place sounds came from — what the board is named and keyed by. */
  get rootName() {
    return this.sources[0] ? this.sources[0].name : '';
  }

  get label() {
    if (!this.sources.length) return '';
    const extra = this.sources.length - 1;
    return extra ? `${this.rootName} + ${extra} more` : this.rootName;
  }

  get list() {
    return [...this.entries.values()].sort(sortPaths);
  }

  get handles() {
    return this.sources.map((s) => s.handle).filter(Boolean);
  }

  /** Add a whole folder. Returns the paths added, or null if the picker was dismissed. */
  async addFolder() {
    if (CAN_PERSIST) {
      let handle;
      try {
        handle = await window.showDirectoryPicker({ id: 'soundboard-folder', mode: 'read' });
      } catch (err) {
        if (err && err.name === 'AbortError') return null;
        throw err;
      }
      return this.addHandle(handle);
    }
    const files = await pickWithInput(true);
    return files ? this.addFiles(files) : null;
  }

  /** Add sounds one by one — the only way in on iOS, and handy everywhere. */
  async addSounds() {
    if (CAN_PICK_FILE_HANDLES) {
      let handles;
      try {
        handles = await window.showOpenFilePicker({ id: 'soundboard-files', multiple: true, types: PICKER_TYPES });
      } catch (err) {
        if (err && err.name === 'AbortError') return null;
        throw err;
      }
      const added = [];
      for (const handle of handles) added.push(...await this.addHandle(handle));
      return added;
    }
    const files = await pickWithInput(false);
    return files ? this.addFiles(files) : null;
  }

  /** A folder or a few files dropped onto the window. */
  async addDrop(dataTransfer) {
    const items = [...dataTransfer.items].filter((i) => i.kind === 'file');
    if (!items.length) return [];

    if (CAN_PERSIST && typeof items[0].getAsFileSystemHandle === 'function') {
      const added = [];
      for (const item of items) {
        const handle = await item.getAsFileSystemHandle();
        if (handle) added.push(...await this.addHandle(handle));
      }
      return added;
    }

    const entries = items.map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
    const dir = entries.find((e) => e.isDirectory);
    if (dir) {
      const src = this._source({ kind: 'dir', name: dir.name });
      const found = new Map();
      await walkEntry(dir, '', found);
      return this._merge([...found.values()], src);
    }
    return dataTransfer.files.length ? this.addFiles(dataTransfer.files) : [];
  }

  /** A stored handle, reopened. Throws if permission is refused. */
  async addHandle(handle) {
    if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') {
      if ((await handle.requestPermission({ mode: 'read' })) !== 'granted') {
        throw new DOMException(`Permission to read “${handle.name}” was refused`, 'NotAllowedError');
      }
    }

    if (handle.kind === 'directory') {
      const src = this._source({ kind: 'dir', name: handle.name, handle });
      const found = new Map();
      await walkHandle(handle, '', found);
      return this._merge([...found.values()], src);
    }

    if (!AUDIO.test(handle.name)) return [];
    const src = this._source({ kind: 'file', name: handle.name, handle });
    return this._merge([{ path: handle.name, name: handle.name, dir: '', handle }], src);
  }

  /** Files from an <input>: a session's worth of sound, with nothing to store. */
  async addFiles(fileList) {
    const files = [...fileList].filter((f) => AUDIO.test(f.name));
    if (!files.length) return [];

    let root = '';
    const found = [];
    for (const file of files) {
      const rel = file.webkitRelativePath || file.name;
      const parts = rel.split('/');
      if (parts.some((p) => SKIP.test(p))) continue;
      if (parts.length > 1 && !root) root = parts[0];
      const path = parts.length > 1 ? parts.slice(1).join('/') : rel;
      found.push({ path, name: file.name, dir: path.split('/').slice(0, -1).join('/'), file });
    }

    const src = this._source({
      kind: root ? 'dir' : 'files',
      name: root || (found.length === 1 ? found[0].name : 'Chosen sounds'),
    });
    return this._merge(found, src);
  }

  has(path) {
    return this.entries.has(path);
  }

  async file(path) {
    const entry = this.entries.get(path);
    if (!entry) throw new Error(`“${path}” is not among the sounds that are open`);
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
    this.sources = [];
  }

  _source(src) {
    const full = { ...src, key: this._nextKey };
    this._nextKey += 1;
    this.sources.push(full);
    return full;
  }

  /**
   * Fold what was found into what is already open. The same sound found again —
   * the same folder picked twice, say — is left where it is, pads and all; a
   * different sound that happens to share a name gets a path of its own, so a
   * pad pointing at one never plays the other.
   */
  async _merge(found, src) {
    const added = [];
    for (const entry of [...found].sort(sortPaths)) {
      let path = entry.path;
      const clash = this.entries.get(path);
      if (clash) {
        if (await sameSound(clash, entry)) continue;
        path = this._freePath(entry.path);
      }
      this.entries.set(path, { ...entry, path, src: src.key });
      added.push(path);
    }
    if (!added.length) this.sources = this.sources.filter((s) => s !== src);
    return added;
  }

  _freePath(path) {
    const dot = path.lastIndexOf('.');
    const stem = dot > 0 ? path.slice(0, dot) : path;
    const ext = dot > 0 ? path.slice(dot) : '';
    let n = 2;
    while (this.entries.has(`${stem} (${n})${ext}`)) n += 1;
    return `${stem} (${n})${ext}`;
  }
}

/** Is this the same file as the one already open under that path? */
async function sameSound(a, b) {
  if (a.handle && b.handle) {
    try {
      return await a.handle.isSameEntry(b.handle);
    } catch {
      return a.handle.name === b.handle.name;
    }
  }
  if (a.file && b.file) {
    return a.file.name === b.file.name
      && a.file.size === b.file.size
      && a.file.lastModified === b.file.lastModified;
  }
  return false;
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
