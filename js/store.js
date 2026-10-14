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
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

export const store = {
  saveBoard(board) {
    return run('boards', 'readwrite', (s) => s.put(board));
  },
  loadBoard(id) {
    return run('boards', 'readonly', (s) => s.get(id));
  },
  listBoards() {
    return run('boards', 'readonly', (s) => s.getAll());
  },
  deleteBoard(id) {
    return run('boards', 'readwrite', (s) => s.delete(id));
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
