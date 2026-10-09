// Browser-side persistence for the Meta-Analyse mode (IndexedDB - the app has
// no backend). Two stores:
//  - "engine": one engine record (metaRecords.js's buildEngineRecord) per
//    game, keyed by engine + depth + game URL, so a later run with the same
//    settings only analyzes games it hasn't seen yet, and a cancelled run
//    keeps everything finished so far;
//  - "profiles": each opponent's country, so it's only fetched once.
// Every call degrades to "nothing cached" if IndexedDB is unavailable
// (private browsing, blocked storage) instead of breaking the mode.

const DB_NAME = 'chessanalysis-meta';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('engine')) db.createObjectStore('engine');
        if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export const engineKey = (engineId, depth, url) => `${engineId}|${depth}|${url}`;

function requestToPromise(req) {
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}

async function getMany(storeName, keys) {
  const db = await openDb();
  const out = new Map();
  if (!db || keys.length === 0) return out;
  const store = db.transaction(storeName, 'readonly').objectStore(storeName);
  const values = await Promise.all(keys.map((k) => requestToPromise(store.get(k))));
  keys.forEach((k, i) => {
    if (values[i] !== undefined) out.set(k, values[i]);
  });
  return out;
}

async function putMany(storeName, entries) {
  const db = await openDb();
  if (!db || entries.length === 0) return;
  await new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const [k, v] of entries) store.put(v, k);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
    tx.onabort = resolve;
  });
}

/** @returns {Promise<Map<string, object>>} url -> engine record, for the given engine + depth */
export async function loadEngineRecords(engineId, depth, urls) {
  const found = await getMany('engine', urls.map((u) => engineKey(engineId, depth, u)));
  const byUrl = new Map();
  for (const url of urls) {
    const rec = found.get(engineKey(engineId, depth, url));
    if (rec) byUrl.set(url, rec);
  }
  return byUrl;
}

export function saveEngineRecord(engineId, depth, url, record) {
  return putMany('engine', [[engineKey(engineId, depth, url), record]]);
}

export function saveEngineRecords(engineId, depth, entries) {
  return putMany('engine', entries.map(([url, rec]) => [engineKey(engineId, depth, url), rec]));
}

/** @returns {Promise<Map<string, string|null>>} lowercased username -> country code (null = none/unknown) */
export async function loadCountries(usernames) {
  const keys = usernames.map((u) => u.toLowerCase());
  const found = await getMany('profiles', keys);
  const out = new Map();
  for (const [k, v] of found) out.set(k, v.country ?? null);
  return out;
}

export function saveCountries(entries) {
  return putMany('profiles', entries.map(([name, country]) => [name.toLowerCase(), { country, savedAt: Date.now() }]));
}
