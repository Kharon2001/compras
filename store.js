// Persistencia local: IndexedDB como almacén principal y localStorage como copia
// de respaldo síncrona. Al cargar se usa la copia más reciente de las dos.

const DB_NAME = 'compras';
const STORE = 'kv';
const KEY = 'state';
const LS_KEY = 'compras.state.v1';
const SCHEMA = 1;

export const CATEGORIES = [
  { id: 'fruta', name: 'Fruta y verdura', emoji: '🍎' },
  { id: 'proteina', name: 'Carne, pescado y huevos', emoji: '🥚' },
  { id: 'lacteos', name: 'Lácteos', emoji: '🧀' },
  { id: 'despensa', name: 'Despensa', emoji: '🥫' },
  { id: 'bebidas', name: 'Bebidas', emoji: '🧃' },
  { id: 'higiene', name: 'Higiene personal', emoji: '🧴' },
  { id: 'limpieza', name: 'Limpieza', emoji: '🧽' },
  { id: 'otros', name: 'Otros', emoji: '📦' },
];

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) return reject(new Error('IndexedDB no disponible'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB bloqueado'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

async function idbGet() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

function parse(json) {
  try {
    const data = typeof json === 'string' ? JSON.parse(json) : null;
    return data && Array.isArray(data.items) && Array.isArray(data.favorites) ? data : null;
  } catch {
    return null;
  }
}

export async function load() {
  let fromIdb = null;
  let fromLs = null;
  try { fromIdb = parse(await idbGet()); } catch { /* sin IndexedDB: seguimos con localStorage */ }
  try { fromLs = parse(localStorage.getItem(LS_KEY)); } catch { /* almacenamiento bloqueado */ }
  const newest = [fromIdb, fromLs].filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
  return newest ? migrate(newest) : seed();
}

let writeChain = Promise.resolve();

export function save(state) {
  state.savedAt = Date.now();
  const json = JSON.stringify(state);
  try { localStorage.setItem(LS_KEY, json); } catch { /* lleno o bloqueado */ }
  // Encadenar escrituras para que nunca se apliquen fuera de orden.
  writeChain = writeChain.then(() => idbSet(json)).catch((err) => console.warn('No se pudo guardar en IndexedDB', err));
  return writeChain;
}

function migrate(data) {
  data.schema = SCHEMA;
  data.settings = { group: false, ...(data.settings || {}) };
  for (const it of data.items) {
    it.kind = it.kind === 'task' ? 'task' : 'item';
    it.qty = it.qty || '';
    it.note = it.note || '';
    it.cat = it.cat || null;
    it.done = !!it.done;
  }
  return data;
}

const SEED = [
  ['Banana', 'fruta'],
  ['Fundas de papel', 'otros'],
  ['Pañitos', 'higiene'],
  ['Jabón corporal', 'higiene'],
  ['Desodorante', 'higiene'],
  ['Jugo', 'bebidas'],
  ['Papas', 'fruta'],
  ['Huevos', 'proteina'],
  ['Uvas', 'fruta'],
  ['Papel para airfryer', 'otros'],
  ['Pan para hamburguesa', 'despensa'],
  ['Queso', 'lacteos'],
  ['Especias', 'despensa'],
  ['Proteína en polvo', 'despensa'],
  ['Pepino y tomate', 'fruta'],
  ['Dressing para ensalada', 'despensa'],
  ['Salsa de tomate', 'despensa'],
  ['Arroz', 'despensa'],
  ['Zanahorias', 'fruta'],
];

function seed() {
  const now = Date.now();
  const items = SEED.map(([name, cat]) => ({ id: uid(), name, qty: '', note: '', cat, kind: 'item', done: false, doneAt: null, created: now }));
  items.push({ id: uid(), name: 'Arreglar bicicleta', qty: '', note: '', cat: null, kind: 'task', done: false, doneAt: null, created: now });
  const favorites = SEED.map(([name, cat]) => ({ id: uid(), name, cat }));
  return { schema: SCHEMA, items, favorites, settings: { group: false }, savedAt: 0 };
}
