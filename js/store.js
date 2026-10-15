// Everything the board remembers between launches lives in IndexedDB:
// the boards themselves, the folder handle each one was built from, and
// which board was open last.

const DB_NAME = 'soundboard';
const DB_VERSION = 2;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('boards')) db.createObjectStore('boards', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      // A copy of the audio each board needs, so a reload has something to
      // play before — or without — the browser granting the folder again.
      if (!db.objectStoreNames.contains('sounds')) db.createObjectStore('sounds', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      // Another tab opening the same board later must not be left waiting on
      // this one holding an older version of the store open.
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    // Blocked by another tab holding an older version: it closes on the
    // versionchange it has just been sent, and the open goes through then.
  });
  // A failure is not kept: the next call tries again.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

async function run(storeName, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    if (req) req.onerror = () => reject(req.error);
  });
}

// Small, instant state that says where the operator was: which folders are
// open, whether they were editing. Kept in localStorage so a reload can apply
// it before anything is drawn.
const PREFS = 'soundboard:ui';

export const prefs = {
  all() {
    try {
      return JSON.parse(localStorage.getItem(PREFS)) || {};
    } catch {
      return {};
    }
  },
  get(key, fallback) {
    const value = this.all()[key];
    return value === undefined ? fallback : value;
  },
  set(key, value) {
    const all = this.all();
    all[key] = value;
    try {
      localStorage.setItem(PREFS, JSON.stringify(all));
    } catch {
      /* private mode, or full: the board works, it just forgets */
    }
  },
};

export const store = {
  saveBoard(board) {
    return run('boards', 'readwrite', (s) => s.put(board));
  },
  loadBoard(id) {
    return run('boards', 'readonly', (s) => s.get(id));
  },

  /**
   * Only one board is in use. Any other left in storage — one made before the
   * board it was replaced by — can no longer be opened, and its kept copies
   * only take room the open board's sounds may need.
   */
  async forgetOtherBoards(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['boards', 'handles', 'sounds'], 'readwrite');
      const others = (key) => key !== id;
      for (const name of ['boards', 'handles']) {
        const s = tx.objectStore(name);
        s.getAllKeys().onsuccess = (e) => e.target.result.filter(others).forEach((key) => s.delete(key));
      }
      const sounds = tx.objectStore('sounds');
      sounds.getAllKeys().onsuccess = (e) => e.target.result
        .filter((key) => others(key.split('\n')[0]))
        .forEach((key) => sounds.delete(key));
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  },

  // Handles for every place a board's sounds came from. They survive a reload
  // in browsers with the File System Access API; the permission does not, so
  // expect to ask for it again unless the board has been installed.
  saveHandles(id, handles) {
    return run('handles', 'readwrite', (s) => s.put(handles, id));
  },
  async loadHandles(id) {
    const stored = await run('handles', 'readonly', (s) => s.get(id));
    if (!stored) return [];
    return Array.isArray(stored) ? stored : [stored];
  },

  /** Keep this sound against this board. Throws if the browser is out of room. */
  putSound(boardId, path, file) {
    return run('sounds', 'readwrite', (s) => s.put({
      key: `${boardId}\n${path}`,
      boardId,
      path,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified || 0,
      blob: file,
    }));
  },

  soundsFor(boardId) {
    const range = IDBKeyRange.bound(`${boardId}\n`, `${boardId}\n\uffff`);
    return run('sounds', 'readonly', (s) => s.getAll(range));
  },

  deleteSound(boardId, path) {
    return run('sounds', 'readwrite', (s) => s.delete(`${boardId}\n${path}`));
  },

  setMeta(key, value) {
    return run('meta', 'readwrite', (s) => s.put(value, key));
  },
  getMeta(key) {
    return run('meta', 'readonly', (s) => s.get(key));
  },
};
