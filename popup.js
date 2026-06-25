import { applyToCurrentTab } from './services/postfix.js';
import { deleteHistory, opneHistoryItem } from './services/history.js';
import { state } from './state/AppState.js'

let searchQuery = '';

export async function refresh() {
  await refreshChromeMenu();

  populateFolderSelect();
  render();
}

async function refreshChromeMenu() {
  await chrome.runtime.sendMessage({ action: 'refreshMenu' });
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

function renderHistoryItem(historyItem) {
  const li = document.createElement('div');
  li.className = 'history-item no-folder';
  li.dataset.id = historyItem.id;

  const info = document.createElement('div');
  info.className = 'history-info';

  const postfix = state.postfixes.find(p => p.id === historyItem.postfix.id);  

  const label = document.createElement('div');
  label.className = 'history-label';
  const createdAt = new Date(historyItem.createdAt);
  const createdAtString = ' (' +  createdAt.toLocaleString() + ')';
  if (!postfix) {
    label.innerHTML = '[DELETED]';
  } 

  label.innerHTML +=  historyItem.postfix.label.replace(searchQuery, '<span class="search-label-badge">' + searchQuery + '</span>') + createdAtString;;

  const value = document.createElement('div');
  value.className = 'history-value';
  value.textContent = historyItem.newUrl;
  value.innerHTML =  historyItem.newUrl.replace(searchQuery, '<span class="search-label-badge">' + searchQuery + '</span>');

  info.appendChild(label);
  info.appendChild(value);

  const del = document.createElement('button');
  del.className = 'delete-btn';
  del.textContent = '×';
  del.title = 'Удалить';

  del.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteHistory(historyItem.id);

    refresh();
  });

  li.appendChild(info);
  li.appendChild(del);
  li.addEventListener('click', async () => {
    await opneHistoryItem(historyItem);
  });

  return li;
}

function render() {
  const tree = document.getElementById('tree');
  const historyElement = document.getElementById('historySection');
  const empty = document.getElementById('emptyState');
  tree.innerHTML = '';
  historyElement.innerHTML = '';

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

  const history = [...state.history].sort((a, b) =>  (b.createdAt || 0) - (a.createdAt || 0));

  // отрисовка папок
  for (const folder of folders) {
    const itemsInFolder = sortPostfixes(visible.filter(p => p.folderId === folder.id));

    if (!searchQuery) {
      tree.appendChild(renderFolder(folder, itemsInFolder));

      continue;
    }
    
    if (itemsInFolder.length > 0) {
      tree.appendChild(renderFolder(folder, itemsInFolder));

      continue;
    }

    // если папка попадает под критерии поиска, то отображаем все её элементы
    if (matchesSearchFolder(folder)) {
      tree.appendChild(renderFolder(folder, sortPostfixes(state.postfixes.filter(p => p.folderId === folder.id))));
      continue;
    }
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

  // история использования постфиксов
  for (const historyItem of history) {
      historyElement.appendChild(renderHistoryItem(historyItem));
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
  name.innerHTML =  folder.name.replace(searchQuery, '<span class="search-label-badge">' + searchQuery + '</span>');
  name.title = 'Двойной клик — переименовать';

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
  label.innerHTML =  item.label.replace(searchQuery, '<span class="search-label-badge">' + searchQuery + '</span>');

  const value = document.createElement('div');
  value.className = 'postfix-value';
  value.textContent = item.postfix;
  value.innerHTML =  item.postfix.replace(searchQuery, '<span class="search-label-badge">' + searchQuery + '</span>');

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

  li.addEventListener('click', () => applyToCurrentTab(item.id, [], refresh, launchConfetti));

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

  await state.addPostfix(label,postfix, folderEl);

  labelEl.value = '';
  postfixEl.value = '';
  toggleAddForm(false);
  render();
  await refreshChromeMenu();
}

async function deletePostfix(id) {
  if (!confirm(`Вы уверены что хотите удалить постфикс?`)) return;
  await state.removePostfix(id)

  render();
  await refreshChromeMenu();
}

async function movePostfixToFolder(id, folderId) {
  await state.updatePostfix(id, {
    folderId : folderId
  });

  render();
  await refreshChromeMenu();
}

async function addFolder() {
  const name = prompt('Название папки:', 'Новая папка');
  if (!name || !name.trim()) return;
  await state.addFolder(name.trim())

  populateFolderSelect();
  render();
  await refreshChromeMenu();
}

async function deleteFolder(folderId) {
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder) return;
  if (!confirm(`Удалить папку "${folder.name}"? Постфиксы внутри останутся (переедут в корень).`)) return;

  await state.removeFolder(folderId);

  for (const p of state.postfixes) {
    if (p.folderId === folderId) await state.updatePostfix(p.id, {folderId : null});
  }

  populateFolderSelect();
  render();
  await refreshChromeMenu();
}

async function toggleFolder(folderId) {
  const f = state.folders.find(x => x.id === folderId);
  if (!f) return;

  state.updateFolder(folderId, {collapsed: !f.collapsed})
  render();
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

// ==================== history form toggle ====================

function toggleHistory(force) {
  const sec = document.getElementById('historySection');
  const btn = document.getElementById('historyToggleBtn');
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

document.addEventListener('DOMContentLoaded', async () => {
  await state.init();

  document.getElementById('addToggleBtn').addEventListener('click', () => toggleAddForm());
  document.getElementById('historyToggleBtn').addEventListener('click', () => toggleHistory());
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

  await refresh();
});
