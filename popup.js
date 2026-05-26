// ==================== storage ====================

const STORAGE_KEY = 'data_v2';

/**
 * Структура хранилища:
 * {
 *   postfixes: [{id, label, postfix, count, createdAt, folderId|null, order}],
 *   folders:   [{id, name, collapsed, order}]
 * }
 */
async function loadData() {
  const r = await chrome.storage.local.get(STORAGE_KEY);
  if (r[STORAGE_KEY]) return r[STORAGE_KEY];

  // миграция со старой версии
  const old = await chrome.storage.local.get('postfixes');
  if (old.postfixes) {
    return {
      postfixes: old.postfixes.map((p, i) => ({ ...p, folderId: null, order: i })),
      folders: []
    };
  }
  return { postfixes: [], folders: [] };
}

async function saveData(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

// ==================== url logic ====================

function templatePostfix(postfix) {
  // Находим все уникальные ключи в шаблоне
  const matches = postfix.match(/\{(\w+)\}/g) || [];
  const uniqueKeys = [...new Set(matches.map(m => m.slice(1, -1)))];
  
  let result = postfix;
  
  uniqueKeys.forEach(key => {
      const value = prompt(`Введите значение для "${key}":`) || '';

      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  });
  
  return result;
}

function parsePostfix(raw) {
  let s = raw.trim();
  s = templatePostfix(s);

  if (s.startsWith('?') || s.startsWith('&')) s = s.slice(1);
  if (!s) return [];
  
  return s.split('&').map(pair => {
    const eq = pair.indexOf('=');
    if (eq === -1) return [decodeURIComponent(pair), ''];
    return [decodeURIComponent(pair.slice(0, eq)), decodeURIComponent(pair.slice(eq + 1))];
  });
}

function applyPostfix(url, postfixRaw) {
  const u = new URL(url);
  for (const [k, v] of parsePostfix(postfixRaw)) u.searchParams.set(k, v);
  return u.toString();
}

// ==================== state ====================

let state = { postfixes: [], folders: [] };
let searchQuery = '';

async function refresh() {
  state = await loadData();
  populateFolderSelect();
  render();
}

// ==================== render ====================

function matchesSearchPostfix(p) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return p.label.toLowerCase().includes(q) || p.postfix.toLowerCase().includes(q);
}

function matchesSearchFolder(folder) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return folder.name.toLowerCase().includes(q);
}

function sortPostfixes(arr) {
  // основной критерий — count; при равенстве — более свежие выше
  return [...arr].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

function render() {
  const tree = document.getElementById('tree');
  const empty = document.getElementById('emptyState');
  tree.innerHTML = '';

  const visible = state.postfixes.filter(matchesSearchPostfix);
  if (state.postfixes.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  // папки, отсортированные по order
  const folders = [...state.folders].sort((a, b) => (a.order || 0) - (b.order || 0));

  // постфиксы без папки
  const rootItems = sortPostfixes(visible.filter(p => !p.folderId));

  // отрисовка папок
  for (const folder of folders) {
    const itemsInFolder = sortPostfixes(visible.filter(p => p.folderId === folder.id));
    // показываем папку, даже если она пустая после фильтра, только если нет поиска
    if (searchQuery && !matchesSearchFolder(folder)) continue;

    // если папка попадает под критерии поиска, то отображаем все её элементы
    if (matchesSearchFolder(folder)) {
      tree.appendChild(renderFolder(folder, sortPostfixes(state.postfixes.filter(p => !p.folderId))));
      continue;
    }

    tree.appendChild(renderFolder(folder, itemsInFolder));
  }

  // root: рендерим как «псевдо-папку» без шапки — просто список айтемов
  if (rootItems.length > 0) {
    const rootBox = document.createElement('div');
    rootBox.className = 'tree';
    rootBox.dataset.folderId = '';
    enableDropZone(rootBox, null);
    for (const item of rootItems) {
      const el = renderItem(item, true);
      rootBox.appendChild(el);
    }
    tree.appendChild(rootBox);
  }
}

function renderFolder(folder, items) {
  const box = document.createElement('div');
  box.className = 'folder' + (folder.collapsed ? ' collapsed' : '');
  box.dataset.folderId = folder.id;

  // header
  const header = document.createElement('div');
  header.className = 'folder-header';

  const chev = document.createElement('span');
  chev.className = 'folder-chevron';
  chev.textContent = '▼';

  const icon = document.createElement('span');
  icon.className = 'folder-icon';
  icon.textContent = '';

  const name = document.createElement('span');
  name.className = 'folder-name';
  name.textContent = folder.name;
  name.title = 'Двойной клик — переименовать';
  name.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startRenameFolder(folder.id, name);
  });

  const count = document.createElement('span');
  count.className = 'folder-count';
  count.textContent = items.length;

  const del = document.createElement('button');
  del.className = 'folder-del';
  del.textContent = '×';
  del.title = 'Удалить папку (постфиксы внутри сохранятся)';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteFolder(folder.id);
  });

  header.appendChild(chev);
  header.appendChild(icon);
  header.appendChild(name);
  header.appendChild(count);
  header.appendChild(del);

  header.addEventListener('click', () => toggleFolder(folder.id));

  // body
  const body = document.createElement('div');
  body.className = 'folder-items';
  for (const item of items) {
    body.appendChild(renderItem(item, false));
  }

  enableDropZone(box, folder.id);

  box.appendChild(header);
  box.appendChild(body);
  return box;
}

function renderItem(item, isRoot) {
  const li = document.createElement('div');
  li.className = 'postfix-item' + (isRoot ? ' no-folder' : '');
  li.draggable = true;
  li.dataset.id = item.id;

  const info = document.createElement('div');
  info.className = 'postfix-info';

  const label = document.createElement('div');
  label.className = 'postfix-label';
  label.textContent = item.label;

  const value = document.createElement('div');
  value.className = 'postfix-value';
  value.textContent = item.postfix;

  info.appendChild(label);
  info.appendChild(value);

  const cnt = document.createElement('span');
  cnt.className = 'postfix-count' + (item.count >= 100 ? ' milestone' : '');
  cnt.textContent = item.count;

  const del = document.createElement('button');
  del.className = 'delete-btn';
  del.textContent = '×';
  del.title = 'Удалить';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    deletePostfix(item.id);
  });

  li.appendChild(info);
  li.appendChild(cnt);
  li.appendChild(del);

  li.addEventListener('click', () => applyToCurrentTab(item.id));

  // drag handlers
  li.addEventListener('dragstart', (e) => {
    li.classList.add('dragging');
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
  });

  return li;
}

function enableDropZone(el, folderId) {
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', (e) => {
    if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over');
  });
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    await movePostfixToFolder(id, folderId);
  });
}

// ==================== folder select in form ====================

function populateFolderSelect() {
  const sel = document.getElementById('folderSelect');
  const prev = sel.value;
  sel.innerHTML = '<option value="">Без папки</option>';
  for (const f of state.folders) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    sel.appendChild(opt);
  }
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
}

// ==================== actions ====================

async function addPostfix() {
  const labelEl = document.getElementById('labelInput');
  const postfixEl = document.getElementById('postfixInput');
  const folderEl = document.getElementById('folderSelect');
  const label = labelEl.value.trim();
  const postfix = postfixEl.value.trim();
  if (!label || !postfix) return;

  state.postfixes.push({
    id: crypto.randomUUID(),
    label,
    postfix,
    count: 0,
    createdAt: Date.now(),
    folderId: folderEl.value || null,
    order: Date.now()
  });
  await saveData(state);

  labelEl.value = '';
  postfixEl.value = '';
  toggleAddForm(false);
  render();
}

async function deletePostfix(id) {
  if (!confirm(`Вы уверены что хотите удалить постфикс?`)) return;

  state.postfixes = state.postfixes.filter(p => p.id !== id);
  await saveData(state);
  render();
}

async function movePostfixToFolder(id, folderId) {
  const p = state.postfixes.find(x => x.id === id);
  if (!p) return;
  if (p.folderId === folderId) return;
  p.folderId = folderId;
  await saveData(state);
  render();
}

async function addFolder() {
  const name = prompt('Название папки:', 'Новая папка');
  if (!name || !name.trim()) return;
  state.folders.push({
    id: crypto.randomUUID(),
    name: name.trim(),
    collapsed: false,
    order: Date.now()
  });
  await saveData(state);
  populateFolderSelect();
  render();
}

async function deleteFolder(folderId) {
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder) return;
  if (!confirm(`Удалить папку "${folder.name}"? Постфиксы внутри останутся (переедут в корень).`)) return;
  state.folders = state.folders.filter(f => f.id !== folderId);
  for (const p of state.postfixes) {
    if (p.folderId === folderId) p.folderId = null;
  }
  await saveData(state);
  populateFolderSelect();
  render();
}

async function toggleFolder(folderId) {
  const f = state.folders.find(x => x.id === folderId);
  if (!f) return;
  f.collapsed = !f.collapsed;
  await saveData(state);
  render();
}

function startRenameFolder(folderId, nameEl) {
  nameEl.contentEditable = 'true';
  nameEl.focus();
  // выделить весь текст
  const range = document.createRange();
  range.selectNodeContents(nameEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finish = async (save) => {
    nameEl.contentEditable = 'false';
    nameEl.removeEventListener('blur', onBlur);
    nameEl.removeEventListener('keydown', onKey);
    if (save) {
      const newName = nameEl.textContent.trim();
      const f = state.folders.find(x => x.id === folderId);
      if (f && newName) {
        f.name = newName;
        await saveData(state);
      }
    }
    populateFolderSelect();
    render();
  };
  const onBlur = () => finish(true);
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  };
  nameEl.addEventListener('blur', onBlur);
  nameEl.addEventListener('keydown', onKey);
}

async function applyToCurrentTab(id) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  const item = state.postfixes.find(p => p.id === id);
  if (!item) return;

  const prev = item.count;
  item.count += 1;
  await saveData(state);

  // конфетти при достижении 100 (и кратных 100 — почему бы и нет)
  if (item.count >= 100 && prev < item.count && item.count % 100 === 0) {
    launchConfetti();
    // короткая задержка, чтобы конфетти успели стартовать перед переходом
    setTimeout(() => navigateAndClose(tab.id, item.postfix, tab.url), 600);
    return;
  }

  navigateAndClose(tab.id, item.postfix, tab.url);
}

async function navigateAndClose(tabId, postfix, url) {
  let newUrl;
  try {
    newUrl = applyPostfix(url, postfix);
  } catch (e) {
    alert('Не удалось применить постфикс: ' + e.message);
    return;
  }
  await chrome.tabs.update(tabId, { url: newUrl });
  window.close();
}

// ==================== add form toggle ====================

function toggleAddForm(force) {
  const sec = document.getElementById('addSection');
  const btn = document.getElementById('addToggleBtn');
  const show = typeof force === 'boolean' ? force : sec.hidden;
  sec.hidden = !show;
  btn.classList.toggle('active', !show);
  sec.classList.toggle('hidden', show);
  if (show) setTimeout(() => document.getElementById('labelInput').focus(), 50);
}

// ==================== confetti ====================

function launchConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#f7b733', '#fc4a1a', '#4a90e2', '#5ca0f2', '#7bed9f', '#ff6b6b', '#a78bfa'];
  const particles = [];
  const N = 120;
  for (let i = 0; i < N; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12 - 4,
      g: 0.25,
      size: 4 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1
    });
  }

  let start = performance.now();
  function tick(now) {
    const dt = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = Math.max(0, 1 - dt / 1800);
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (dt < 1800) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(tick);
}

// ==================== init ====================

async function showCurrentUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  document.getElementById('currentUrl').textContent = tab && tab.url ? tab.url : '—';
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('addToggleBtn').addEventListener('click', () => toggleAddForm());
  document.getElementById('addFolderBtn').addEventListener('click', addFolder);
  document.getElementById('addBtn').addEventListener('click', addPostfix);

  document.getElementById('labelInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('postfixInput').focus();
    if (e.key === 'Escape') toggleAddForm(false);
  });
  document.getElementById('postfixInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPostfix();
    if (e.key === 'Escape') toggleAddForm(false);
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    render();
  });

  showCurrentUrl();
  await refresh();
});
