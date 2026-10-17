import { load, save, CATEGORIES, uid } from './store.js';

/* ---------- Utilidades ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (s) => String(s).replace(/\s+/g, ' ').trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const catById = (id) => CATEGORIES.find((c) => c.id === id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const ICON = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>',
  grip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14M5 15h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
};

// "Arroz (2 paquetes)" o "Huevos x12" → nombre + cantidad.
function parseEntry(raw) {
  let name = clean(raw);
  let qty = '';
  let m = name.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (m) { name = m[1]; qty = clean(m[2]); }
  else if ((m = name.match(/^(.+?)\s+[x×]\s?(\d+)$/i))) { name = m[1]; qty = `x${m[2]}`; }
  return { name: cap(clean(name)), qty };
}

/* ---------- Estado ---------- */

let state;
let undoSnap = null;

const el = {
  topbar: $('#topbar'),
  title: $('#title'),
  today: $('#today'),
  summary: $('#summary'),
  ringFill: $('#ringFill'),
  ringPct: $('#ringPct'),
  progressText: $('#progressText'),
  progressSub: $('#progressSub'),
  pendingList: $('#pendingList'),
  empty: $('#empty'),
  tasksSection: $('#tasksSection'),
  taskList: $('#taskList'),
  doneSection: $('#doneSection'),
  doneList: $('#doneList'),
  doneCount: $('#doneCount'),
  composer: $('#composer'),
  form: $('#addForm'),
  input: $('#addInput'),
  addBtn: $('#addBtn'),
  favBtn: $('#favBtn'),
  suggestions: $('#suggestions'),
  toast: $('#toast'),
  toastText: $('#toastText'),
  toastUndo: $('#toastUndo'),
  layer: $('#sheetLayer'),
  backdrop: $('#backdrop'),
  sheet: $('#sheet'),
};

// Guarda una instantánea para poder deshacer y aplica el cambio.
function mutate(label, fn) {
  const before = JSON.stringify(state);
  const result = fn();
  if (result === false) return false;
  undoSnap = { label, data: before };
  save(state);
  return true;
}

function undo() {
  if (!undoSnap) return;
  state = JSON.parse(undoSnap.data);
  undoSnap = null;
  save(state);
  hideToast();
  render();
}

const products = () => state.items.filter((i) => i.kind !== 'task');
const pendingItems = () => products().filter((i) => !i.done);
const doneItems = () => products().filter((i) => i.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
const taskItems = () => {
  const t = state.items.filter((i) => i.kind === 'task');
  return [...t.filter((i) => !i.done), ...t.filter((i) => i.done)];
};
const findItem = (id) => state.items.find((i) => i.id === id);
const findByName = (name, kind) => state.items.find((i) => norm(i.name) === norm(name) && (!kind || (kind === 'task') === (i.kind === 'task')));
const findFav = (name) => state.favorites.find((f) => norm(f.name) === norm(name));

/* ---------- Render ---------- */

function rowHTML(it, grip) {
  const label = `${it.done ? 'Desmarcar' : 'Marcar'} ${it.name}`;
  return `<li class="row${it.done ? ' is-done' : ''}${it.kind === 'task' ? ' task' : ''}" data-id="${it.id}">
    <div class="swipe-bg" aria-hidden="true">${ICON.trash}<span>Eliminar</span></div>
    <div class="row-inner">
      <button class="check" aria-label="${esc(label)}" aria-pressed="${it.done}"><span class="circle">${ICON.check}</span></button>
      <button class="label" aria-label="Editar ${esc(it.name)}"><span class="name">${esc(it.name)}</span>${it.qty ? `<span class="qty">${esc(it.qty)}</span>` : ''}${it.note ? `<span class="note">${esc(it.note)}</span>` : ''}</button>
      ${grip ? `<span class="grip" aria-hidden="true">${ICON.grip}</span>` : ''}
    </div>
  </li>`;
}

function rowRects() {
  const map = new Map();
  document.querySelectorAll('.row[data-id]').forEach((r) => map.set(r.dataset.id, r.getBoundingClientRect().top));
  return map;
}

// Animación FLIP: cada fila se desliza desde su posición anterior.
function flip(before) {
  if (reduceMotion) return;
  document.querySelectorAll('.row[data-id]').forEach((r) => {
    const prev = before.get(r.dataset.id);
    const now = r.getBoundingClientRect().top;
    if (prev == null) {
      r.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    } else if (Math.abs(prev - now) > 1) {
      r.animate([{ transform: `translateY(${prev - now}px)` }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  });
}

let renderTimer = null;
function scheduleRender(ms = 420) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => render(), ms);
}

function render(animate = true) {
  clearTimeout(renderTimer);
  const before = animate ? rowRects() : null;
  const pend = pendingItems();
  const done = doneItems();
  const tasks = taskItems();
  const grouped = state.settings.group;

  if (grouped) {
    const groups = new Map();
    for (const it of pend) {
      const key = catById(it.cat) ? it.cat : '_none';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    el.pendingList.innerHTML = [...CATEGORIES, { id: '_none', name: 'Sin categoría', emoji: '·' }]
      .filter((c) => groups.has(c.id))
      .map((c) => `<li class="group-head">${c.emoji}&nbsp; ${esc(c.name)}</li>${groups.get(c.id).map((i) => rowHTML(i, false)).join('')}`)
      .join('');
  } else {
    el.pendingList.innerHTML = pend.map((i) => rowHTML(i, pend.length > 1)).join('');
  }

  el.empty.hidden = pend.length > 0;
  el.empty.innerHTML = done.length
    ? '<strong>¡Todo comprado!</strong>Desmarca algo abajo o empieza una nueva compra desde ···'
    : '<strong>Tu lista está vacía</strong>Escribe abajo o toca ★ para añadir tus habituales';

  const openTasks = tasks.filter((t) => !t.done).length;
  el.tasksSection.hidden = tasks.length === 0;
  el.taskList.innerHTML = tasks.map((i) => rowHTML(i, !i.done && !grouped && openTasks > 1)).join('');

  el.doneSection.hidden = done.length === 0;
  el.doneCount.textContent = done.length;
  el.doneList.innerHTML = done.map((i) => rowHTML(i, false)).join('');

  updateProgress();
  if (before) flip(before);
}

const RING = 2 * Math.PI * 19;

function updateProgress() {
  const all = products();
  const bought = all.filter((i) => i.done).length;
  const total = all.length;
  const left = total - bought;
  const pct = total ? Math.round((bought / total) * 100) : 0;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  if (!total) {
    el.progressText.textContent = 'Lista vacía';
    el.progressSub.textContent = 'Añade lo que necesites';
  } else if (!left) {
    el.progressText.textContent = '¡Todo comprado!';
    el.progressSub.textContent = `Los ${plural(total, 'producto', 'productos')} están listos`;
  } else {
    el.progressText.textContent = `${bought} de ${plural(total, 'producto comprado', 'productos comprados')}`;
    el.progressSub.textContent = `Te ${left === 1 ? 'falta' : 'faltan'} ${plural(left, 'producto', 'productos')}`;
  }
  el.summary.classList.toggle('complete', total > 0 && !left);
  el.ringPct.textContent = `${pct}%`;
  el.ringFill.style.strokeDashoffset = String(RING * (1 - pct / 100));
}

function updateDate() {
  const text = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  el.today.textContent = text;
}

function flashRow(id) {
  requestAnimationFrame(() => {
    const row = document.querySelector(`.row[data-id="${id}"]`);
    if (!row) return;
    row.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
  });
}

/* ---------- Acciones de la lista ---------- */

function toggle(id, rowEl) {
  const it = findItem(id);
  if (!it) return;
  const nowDone = !it.done;
  mutate(nowDone ? `«${it.name}» marcado` : `«${it.name}» desmarcado`, () => {
    it.done = nowDone;
    it.doneAt = nowDone ? Date.now() : null;
  });
  if (rowEl) {
    rowEl.classList.toggle('is-done', nowDone);
    const circle = rowEl.querySelector('.circle');
    circle.classList.remove('pop');
    void circle.offsetWidth;
    circle.classList.add('pop');
    rowEl.querySelector('.check').setAttribute('aria-pressed', String(nowDone));
  }
  updateProgress();
  if (nowDone && it.kind !== 'task') toast(`«${it.name}» comprado`, { undo: true, ms: 3000 });
  // Pequeña pausa para ver la marca antes de que la fila cambie de sección.
  scheduleRender();
}

function addItem(raw, extra = {}) {
  const { name, qty } = parseEntry(raw);
  if (!name) return false;
  const existing = findByName(name, extra.kind || 'item');
  if (existing && !existing.done) {
    toast(`«${existing.name}» ya está en la lista`);
    flashRow(existing.id);
    return 'dup';
  }
  if (existing) {
    mutate(`«${existing.name}» vuelve a pendientes`, () => {
      existing.done = false;
      existing.doneAt = null;
      if (qty || extra.qty) existing.qty = qty || extra.qty;
    });
    render();
    flashRow(existing.id);
    toast(`«${existing.name}» vuelve a pendientes`, { undo: true });
    return true;
  }
  const fav = findFav(name);
  const item = {
    id: uid(),
    name: fav ? fav.name : name,
    qty: qty || extra.qty || '',
    note: '',
    cat: extra.cat ?? fav?.cat ?? null,
    kind: extra.kind || 'item',
    done: false,
    doneAt: null,
    created: Date.now(),
  };
  mutate(`«${item.name}» añadido`, () => { state.items.push(item); });
  render();
  flashRow(item.id);
  return true;
}

function removeItem(id) {
  const it = findItem(id);
  if (!it) return;
  mutate(`«${it.name}» eliminado`, () => { state.items = state.items.filter((i) => i.id !== id); });
  render();
  toast(`«${it.name}» eliminado`, { undo: true });
}

// Reordena un subconjunto: las posiciones que ocupaban esos ids en el array
// global se rellenan con el nuevo orden; el resto de productos no se mueve.
function applyOrder(ids) {
  const set = new Set(ids);
  const byId = new Map(state.items.map((i) => [i.id, i]));
  let k = 0;
  const next = state.items.map((i) => (set.has(i.id) ? byId.get(ids[k++]) : i));
  mutate('Orden cambiado', () => { state.items = next; });
}

/* ---------- Arrastrar para reordenar ---------- */

function startDrag(e, grip) {
  const row = grip.closest('.row');
  const list = row.parentElement;
  const rows = [...list.querySelectorAll('.row')].filter((r) => r.querySelector('.grip'));
  const from = rows.indexOf(row);
  if (from < 0) return;
  e.preventDefault();
  try { grip.setPointerCapture(e.pointerId); } catch { /* algunos navegadores no lo permiten */ }

  const scroll0 = window.scrollY;
  const rects = rows.map((r) => r.getBoundingClientRect());
  const mids = rects.map((r) => r.top + scroll0 + r.height / 2);
  const h = rects[from].height;
  const startY = e.clientY;
  let lastY = e.clientY;
  let to = from;
  let raf = 0;
  let active = true;

  list.classList.add('sorting');
  row.classList.add('dragging');

  const update = () => {
    const dy = lastY - startY + (window.scrollY - scroll0);
    row.style.transform = `translateY(${dy}px) scale(1.02)`;
    const center = mids[from] + dy;
    to = 0;
    rows.forEach((_, i) => { if (i !== from && mids[i] < center) to++; });
    rows.forEach((r, i) => {
      if (i === from) return;
      let shift = 0;
      if (i < from && i >= to) shift = h;
      else if (i > from && i <= to) shift = -h;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  };

  const loop = () => {
    if (!active) return;
    const topEdge = 110;
    const bottomEdge = window.innerHeight - 150;
    let v = 0;
    if (lastY < topEdge) v = -Math.ceil((topEdge - lastY) / 8);
    else if (lastY > bottomEdge) v = Math.ceil((lastY - bottomEdge) / 8);
    if (v) { window.scrollBy(0, v); update(); }
    raf = requestAnimationFrame(loop);
  };

  const move = (ev) => { lastY = ev.clientY; update(); };
  const end = () => {
    active = false;
    cancelAnimationFrame(raf);
    grip.removeEventListener('pointermove', move);
    grip.removeEventListener('pointerup', end);
    grip.removeEventListener('pointercancel', end);
    list.classList.remove('sorting');
    rows.forEach((r) => { r.style.transform = ''; r.classList.remove('dragging'); });
    if (to !== from) {
      const ids = rows.map((r) => r.dataset.id);
      const [moved] = ids.splice(from, 1);
      ids.splice(to, 0, moved);
      applyOrder(ids);
      render(false);
    }
  };

  grip.addEventListener('pointermove', move);
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  update();
  raf = requestAnimationFrame(loop);
}

/* ---------- Deslizar para eliminar ---------- */

let suppressClick = false;

function startSwipe(e, row) {
  const inner = row.querySelector('.row-inner');
  const id = e.pointerId;
  const x0 = e.clientX;
  const y0 = e.clientY;
  const width = row.offsetWidth;
  let dx = 0;
  let decided = false;
  let swiping = false;
  let lastX = x0;
  let lastT = performance.now();
  let speed = 0;

  const cleanup = () => {
    inner.removeEventListener('pointermove', move);
    inner.removeEventListener('pointerup', up);
    inner.removeEventListener('pointercancel', cancel);
  };
  const snapBack = () => {
    row.classList.remove('swiping', 'swipe-armed');
    inner.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)';
    inner.style.transform = '';
    setTimeout(() => { inner.style.transition = ''; }, 260);
  };
  function move(ev) {
    if (ev.pointerId !== id) return;
    const mx = ev.clientX - x0;
    const my = ev.clientY - y0;
    if (!decided) {
      if (Math.abs(mx) < 10 && Math.abs(my) < 10) return;
      decided = true;
      // Solo cuenta como deslizamiento si es claramente horizontal y hacia la izquierda.
      swiping = mx < 0 && Math.abs(mx) > Math.abs(my) * 1.3;
      if (!swiping) { cleanup(); return; }
      row.classList.add('swiping');
      try { inner.setPointerCapture(id); } catch { /* sin captura, seguimos igual */ }
    }
    const now = performance.now();
    speed = (lastX - ev.clientX) / Math.max(1, now - lastT);
    lastX = ev.clientX;
    lastT = now;
    dx = Math.min(0, mx);
    inner.style.transform = `translateX(${dx}px)`;
    row.classList.toggle('swipe-armed', -dx > width * 0.35);
  }
  function up(ev) {
    if (ev.pointerId !== id) return;
    cleanup();
    if (!swiping) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 300);
    const remove = -dx > width * 0.35 || (-dx > 60 && speed > 0.5);
    if (!remove) { snapBack(); return; }
    row.classList.add('swipe-armed');
    const anim = inner.animate([{ transform: `translateX(${dx}px)` }, { transform: `translateX(${-width}px)` }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    anim.onfinish = () => removeItem(row.dataset.id);
  }
  function cancel(ev) {
    if (ev.pointerId !== id) return;
    cleanup();
    if (swiping) snapBack();
  }

  inner.addEventListener('pointermove', move);
  inner.addEventListener('pointerup', up);
  inner.addEventListener('pointercancel', cancel);
}

/* ---------- Aviso con deshacer ---------- */

let toastTimer = null;
function toast(text, { undo: canUndo = false, ms = 3200 } = {}) {
  el.toastText.textContent = text;
  el.toastUndo.hidden = !canUndo;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, canUndo ? Math.max(ms, 4000) : ms);
}
function hideToast() {
  clearTimeout(toastTimer);
  el.toast.classList.remove('show');
}

/* ---------- Hojas inferiores ---------- */

let sheetToken = 0;
let sheetOnClose = null;

function openSheet(html, { onClose } = {}) {
  const prev = sheetOnClose;
  sheetOnClose = null;
  prev?.();
  sheetToken++;
  el.sheet.innerHTML = html;
  el.sheet.scrollTop = 0;
  el.layer.hidden = false;
  void el.layer.offsetWidth;
  el.layer.classList.add('open');
  sheetOnClose = onClose || null;
  return el.sheet;
}

function closeSheet() {
  const cb = sheetOnClose;
  sheetOnClose = null;
  const token = ++sheetToken;
  document.activeElement?.blur?.();
  el.layer.classList.remove('open');
  setTimeout(() => { if (token === sheetToken) { el.layer.hidden = true; el.sheet.innerHTML = ''; } }, 360);
  cb?.();
}

function confirmSheet({ title, message, confirm, destructive = true }) {
  return new Promise((resolve) => {
    let answer = false;
    const sheet = openSheet(
      `<div class="confirm">
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        <button class="big${destructive ? ' destructive' : ''}" data-ok>${esc(confirm)}</button>
        <button class="big" data-cancel>Cancelar</button>
      </div>`,
      { onClose: () => resolve(answer) },
    );
    $('[data-ok]', sheet).onclick = () => { answer = true; closeSheet(); };
    $('[data-cancel]', sheet).onclick = () => closeSheet();
  });
}

/* ---------- Editor de producto / habitual ---------- */

function catChips(selected) {
  return CATEGORIES.map((c) => `<button type="button" class="chip${c.id === selected ? ' sel' : ''}" data-cat="${c.id}">${c.emoji} ${esc(c.name)}</button>`).join('');
}

function openEditor(id, { favMode = false, onDone } = {}) {
  const src = favMode ? state.favorites.find((f) => f.id === id) : findItem(id);
  if (!src) return;
  const oldName = src.name;
  let cat = src.cat || null;
  let isFav = favMode || !!findFav(src.name);
  let isTask = src.kind === 'task';
  let deleted = false;

  const sheet = openSheet(
    `<div class="sheet-head">
      <h2>${favMode ? 'Habitual' : isTask ? 'Tarea' : 'Producto'}</h2>
      <button class="pill accent" data-done>Listo</button>
    </div>
    <input class="field" name="name" value="${esc(src.name)}" placeholder="Nombre" maxlength="80" autocapitalize="sentences" enterkeyhint="done">
    ${favMode ? '' : `<input class="field" name="qty" value="${esc(src.qty || '')}" placeholder="Cantidad (opcional), p. ej. 2 paquetes" maxlength="40" enterkeyhint="done">
    <textarea class="field note-field" name="note" rows="2" placeholder="Nota (opcional), p. ej. la marca del paquete azul" maxlength="200" autocapitalize="sentences">${esc(src.note || '')}</textarea>`}
    <div class="field-label">Categoría <span class="muted">· opcional</span></div>
    <div class="chips">${catChips(cat)}</div>
    ${favMode ? '' : `<div class="group-box">
      <button class="opt${isFav ? ' on' : ''}" data-toggle="fav"><span class="grow">Habitual<small>Aparece en ★ para añadirlo con un toque</small></span><span class="switch"></span></button>
      <button class="opt${isTask ? ' on' : ''}" data-toggle="task"><span class="grow">Es una tarea<small>No es del súper; va en «Otras tareas»</small></span><span class="switch"></span></button>
    </div>`}
    <button class="danger-btn" data-delete>${favMode ? 'Quitar de habituales' : 'Eliminar'}</button>`,
    { onClose: apply },
  );

  const nameInput = $('[name="name"]', sheet);
  const qtyInput = $('[name="qty"]', sheet);
  const noteInput = $('[name="note"]', sheet);

  sheet.querySelectorAll('input.field').forEach((f) => f.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); f.blur(); } }));
  $('.chips', sheet).addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    cat = cat === chip.dataset.cat ? null : chip.dataset.cat;
    sheet.querySelectorAll('.chip').forEach((c) => c.classList.toggle('sel', c.dataset.cat === cat));
  });
  sheet.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
    const on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    if (b.dataset.toggle === 'fav') isFav = on; else isTask = on;
  }));
  $('[data-done]', sheet).onclick = () => closeSheet();
  $('[data-delete]', sheet).onclick = () => { deleted = true; closeSheet(); };

  function apply() {
    if (deleted) {
      if (favMode) {
        mutate(`«${src.name}» quitado de habituales`, () => { state.favorites = state.favorites.filter((f) => f.id !== src.id); });
        toast(`«${src.name}» quitado de habituales`, { undo: true });
      } else {
        removeItem(src.id);
      }
      onDone?.();
      return;
    }

    let name = cap(clean(nameInput.value)) || oldName;
    const qty = qtyInput ? clean(qtyInput.value) : '';
    const note = noteInput ? noteInput.value.trim() : '';
    if (norm(name) !== norm(oldName)) {
      const clash = favMode
        ? state.favorites.find((f) => f.id !== src.id && norm(f.name) === norm(name))
        : state.items.find((i) => i.id !== src.id && norm(i.name) === norm(name) && (i.kind === 'task') === isTask);
      if (clash) {
        toast(`Ya existe «${clash.name}»`);
        name = oldName;
      }
    }

    const changed = favMode
      ? name !== src.name || cat !== (src.cat || null)
      : name !== src.name || qty !== (src.qty || '') || note !== (src.note || '') || cat !== (src.cat || null) || isTask !== (src.kind === 'task') || isFav !== !!findFav(oldName);

    if (changed) {
      mutate(`«${name}» editado`, () => {
        if (favMode) {
          src.name = name;
          src.cat = cat;
          return;
        }
        src.name = name;
        src.qty = qty;
        src.note = note;
        src.cat = cat;
        src.kind = isTask ? 'task' : 'item';
        const fav = findFav(oldName) || findFav(name);
        if (isFav) {
          if (fav) { fav.name = name; fav.cat = cat; }
          else state.favorites.push({ id: uid(), name, cat });
        } else if (fav) {
          state.favorites = state.favorites.filter((f) => f !== fav);
        }
      });
      render();
    }
    onDone?.();
  }
}

/* ---------- Habituales ---------- */

function openFavorites(editing = false) {
  const html = () => {
    const favs = [...state.favorites].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const groups = [...CATEGORIES, { id: '_none', name: 'Sin categoría', emoji: '·' }]
      .map((c) => ({ c, list: favs.filter((f) => (catById(f.cat) ? f.cat : '_none') === c.id) }))
      .filter((g) => g.list.length);
    const body = groups.length
      ? groups.map(({ c, list }) => `<div class="fav-group-title">${c.emoji}&nbsp; ${esc(c.name)}</div>${list.map((f) => {
        const inList = !!state.items.find((i) => i.kind !== 'task' && !i.done && norm(i.name) === norm(f.name));
        return `<button class="fav-row${inList ? ' in-list' : ''}${editing ? ' editing' : ''}" data-fav="${f.id}">
          <span class="fav-name">${esc(f.name)}</span>
          <span class="fav-state">${editing ? ICON.chevron : inList ? ICON.check : ICON.plus}</span>
        </button>`;
      }).join('')}`).join('')
      : '<p class="muted" style="text-align:center;padding:24px 0">Aún no tienes habituales.<br>Añade uno arriba o actívalo en la ficha de un producto.</p>';
    return `<div class="sheet-head">
        <h2>Habituales</h2>
        <div class="actions">
          <button class="pill" data-edit>${editing ? 'OK' : 'Editar'}</button>
          <button class="pill accent" data-done>Listo</button>
        </div>
      </div>
      <p class="sheet-sub">${editing ? 'Toca uno para cambiarlo o quitarlo.' : 'Toca para añadir o quitar de tu lista.'}</p>
      <form class="inline-add" data-new>
        <input class="field" placeholder="Nuevo habitual" maxlength="80" autocapitalize="sentences" enterkeyhint="done">
        <button class="pill" type="submit">Añadir</button>
      </form>
      <div data-body>${body}</div>`;
  };

  const sheet = openSheet(html());
  const refresh = () => {
    const y = sheet.scrollTop;
    sheet.innerHTML = html();
    sheet.scrollTop = y;
    wire();
  };

  function wire() {
    $('[data-done]', sheet).onclick = () => closeSheet();
    $('[data-edit]', sheet).onclick = () => { editing = !editing; refresh(); };
    $('[data-new]', sheet).onsubmit = (e) => {
      e.preventDefault();
      const input = $('input', e.currentTarget);
      const { name } = parseEntry(input.value);
      if (!name) { input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); return; }
      if (findFav(name)) { toast(`«${name}» ya es habitual`); input.value = ''; return; }
      const fromList = findByName(name, 'item');
      mutate(`«${name}» añadido a habituales`, () => { state.favorites.push({ id: uid(), name, cat: fromList?.cat || null }); });
      refresh();
    };
    $('[data-body]', sheet).onclick = (e) => {
      const row = e.target.closest('[data-fav]');
      if (!row) return;
      const fav = state.favorites.find((f) => f.id === row.dataset.fav);
      if (!fav) return;
      if (editing) {
        openEditor(fav.id, { favMode: true, onDone: () => setTimeout(() => openFavorites(true), 380) });
        return;
      }
      const pending = state.items.find((i) => i.kind !== 'task' && !i.done && norm(i.name) === norm(fav.name));
      if (pending) {
        mutate(`«${pending.name}» quitado de la lista`, () => { state.items = state.items.filter((i) => i !== pending); });
        render();
      } else {
        addItem(fav.name, { cat: fav.cat });
        hideToast();
      }
      refresh();
    };
  }
  wire();
}

/* ---------- Menú ---------- */

function openMenu() {
  const done = doneItems().length;
  const total = state.items.length;
  const sheet = openSheet(
    `<div class="sheet-head"><h2>Opciones</h2><button class="pill accent" data-done>Listo</button></div>
    <div class="group-box" style="margin-top:4px">
      <button class="opt${state.settings.group ? ' on' : ''}" data-act="group"><span class="grow">Agrupar por categoría<small>Ordena los pendientes por pasillo</small></span><span class="switch"></span></button>
    </div>
    <div class="group-box">
      <button class="opt" data-act="undo" ${undoSnap ? '' : 'disabled'}><span class="grow">Deshacer<small>${undoSnap ? esc(undoSnap.label) : 'Nada que deshacer'}</small></span></button>
    </div>
    <div class="group-box">
      <button class="opt" data-act="repeat" ${done ? '' : 'disabled'}><span class="grow">Nueva compra con lo mismo<small>Vuelve a poner todo lo comprado como pendiente</small></span></button>
      <button class="opt" data-act="clear" ${done ? '' : 'disabled'}><span class="grow">Limpiar comprados<small>Quita de la lista lo que ya compraste</small></span></button>
      <button class="opt danger" data-act="empty" ${total ? '' : 'disabled'}><span class="grow">Vaciar lista<small>Empieza de cero; tus habituales se conservan</small></span></button>
    </div>
    <p class="footnote">Tus datos se guardan solo en este dispositivo, sin cuenta ni servidor.</p>`,
  );
  $('[data-done]', sheet).onclick = () => closeSheet();
  sheet.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => menuAction(b.dataset.act, b)));
}

async function menuAction(act, btn) {
  if (act === 'group') {
    const on = !state.settings.group;
    btn.classList.toggle('on', on);
    state.settings.group = on;
    save(state);
    render();
    return;
  }
  if (act === 'undo') { closeSheet(); undo(); return; }
  if (act === 'repeat') {
    const n = doneItems().length;
    const ok = await confirmSheet({ title: 'Nueva compra con lo mismo', message: `Los ${n} productos comprados volverán a la lista de pendientes.`, confirm: 'Volver a poner como pendientes', destructive: false });
    if (!ok) return;
    mutate('Nueva compra', () => { for (const i of products()) { i.done = false; i.doneAt = null; } });
    render();
    toast(`${n} productos de nuevo en la lista`, { undo: true });
    return;
  }
  if (act === 'clear') { clearDone(); return; }
  if (act === 'empty') {
    const ok = await confirmSheet({ title: '¿Vaciar la lista?', message: 'Se quitarán todos los productos y tareas. Tus habituales se conservan.', confirm: 'Vaciar lista' });
    if (!ok) return;
    mutate('Lista vaciada', () => { state.items = []; });
    render();
    toast('Lista vaciada', { undo: true });
  }
}

async function clearDone() {
  const n = doneItems().length;
  if (!n) return;
  const ok = await confirmSheet({ title: `¿Limpiar ${n} comprado${n === 1 ? '' : 's'}?`, message: 'Se quitarán de la lista. Tus habituales se conservan.', confirm: 'Limpiar comprados' });
  if (!ok) return;
  mutate('Comprados limpiados', () => { state.items = state.items.filter((i) => i.kind === 'task' || !i.done); });
  render();
  toast(`${n} producto${n === 1 ? '' : 's'} limpiado${n === 1 ? '' : 's'}`, { undo: true });
}

/* ---------- Barra para añadir y sugerencias ---------- */

function updateSuggestions() {
  const q = norm(el.input.value);
  el.form.classList.toggle('has-text', !!q);
  if (!q) { el.suggestions.innerHTML = ''; return; }
  const pending = new Set(pendingItems().map((i) => norm(i.name)));
  const seen = new Set();
  const pool = [...state.favorites, ...products()]
    .filter((x) => { const k = norm(x.name); if (seen.has(k) || pending.has(k) || k === q) return false; seen.add(k); return true; });
  const starts = pool.filter((x) => norm(x.name).startsWith(q));
  const words = pool.filter((x) => !norm(x.name).startsWith(q) && norm(x.name).split(' ').some((w) => w.startsWith(q)));
  el.suggestions.innerHTML = [...starts, ...words].slice(0, 6)
    .map((x) => `<button type="button" class="suggestion" data-name="${esc(x.name)}"><b>+</b>${esc(x.name)}</button>`).join('');
}

function submitInput() {
  const value = el.input.value;
  if (!clean(value)) {
    el.input.focus();
    return;
  }
  // También se limpia si ya estaba en la lista: el producto ya está apuntado.
  if (addItem(value)) {
    el.input.value = '';
    updateSuggestions();
  }
}

/* ---------- Eventos ---------- */

function bind() {
  document.querySelector('main').addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row || suppressClick) return;
    if (e.target.closest('.check')) toggle(row.dataset.id, row);
    else if (e.target.closest('.label')) openEditor(row.dataset.id);
  });

  document.querySelector('main').addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    const grip = e.target.closest('.grip');
    if (grip) { startDrag(e, grip); return; }
    const row = e.target.closest('.row');
    if (row && (e.pointerType !== 'mouse' || e.button === 0)) startSwipe(e, row);
  });

  el.form.addEventListener('submit', (e) => { e.preventDefault(); submitInput(); });
  el.input.addEventListener('input', updateSuggestions);
  // Evita que el teclado se cierre al tocar los botones de la barra.
  [el.addBtn, el.suggestions].forEach((n) => n.addEventListener('pointerdown', (e) => {
    if (document.activeElement === el.input) e.preventDefault();
  }));
  el.suggestions.addEventListener('click', (e) => {
    const s = e.target.closest('.suggestion');
    if (!s) return;
    if (addItem(s.dataset.name)) { el.input.value = ''; updateSuggestions(); }
  });

  el.favBtn.addEventListener('click', () => { el.input.blur(); openFavorites(); });
  $('#menuBtn').addEventListener('click', openMenu);
  $('#clearDoneBtn').addEventListener('click', clearDone);
  el.toastUndo.addEventListener('click', undo);
  el.backdrop.addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.layer.hidden) closeSheet(); });

  // Título compacto en la barra superior al desplazarse.
  const onScroll = () => el.topbar.classList.toggle('scrolled', el.title.getBoundingClientRect().bottom < el.topbar.offsetHeight);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Teclado de iOS: mover barra y hojas por encima del teclado.
  const vv = window.visualViewport;
  if (vv) {
    const onVV = () => {
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      document.documentElement.style.setProperty('--kb', `${kb}px`);
      document.documentElement.classList.toggle('kb-open', kb > 60);
    };
    vv.addEventListener('resize', onVV);
    vv.addEventListener('scroll', onVV);
  }

  const ro = new ResizeObserver(() => {
    document.documentElement.style.setProperty('--composer-h', `${el.form.offsetHeight + el.suggestions.offsetHeight}px`);
  });
  ro.observe(el.composer);

  // Si iOS suspende la app, asegura la última escritura.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(state); });
}

/* ---------- Inicio ---------- */

async function init() {
  state = await load();
  if (!state.savedAt) save(state);
  updateDate();
  render(false);
  bind();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') updateDate(); });
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker no registrado', err));
  }
}

init();
