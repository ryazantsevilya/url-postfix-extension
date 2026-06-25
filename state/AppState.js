const STORAGE_KEY = 'data_v2';
const RESERVED_MENU_IDS = new Set(['applyPostfixAction']);

class AppState {
  constructor() {
    this.data = {
      postfixes: [],
      folders: [],
      history: []
    };
  }

  async init() {
    const saved = await this.load();
    if (saved) {
      this.data = saved;
    }
  }

  async load() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || null;
  }

  async save() {
    await chrome.storage.local.set({ [STORAGE_KEY]: this.data });
  }

  replaceData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('State должен быть JSON-объектом');
    }

    for (const key of ['postfixes', 'folders', 'history']) {
      if (!Array.isArray(data[key])) {
        throw new Error(`Поле "${key}" должно быть массивом`);
      }
    }

    const menuIds = new Set();
    const folderIds = new Set();

    for (const folder of data.folders) {
      this.validateFolder(folder, menuIds);
      folderIds.add(folder.id);
    }

    for (const postfix of data.postfixes) {
      this.validatePostfix(postfix, menuIds, folderIds);
    }

    const nextData = {
      postfixes: data.postfixes,
      folders: data.folders,
      history: data.history
    };

    this.data = nextData;
    return this.save();
  }

  validateFolder(folder, menuIds) {
    this.validateMenuItem(folder, menuIds, 'folder');

    if (typeof folder.name !== 'string') {
      throw new Error(`Папка "${folder.id}" должна иметь строковое name`);
    }
  }

  validatePostfix(postfix, menuIds, folderIds) {
    this.validateMenuItem(postfix, menuIds, 'postfix');

    if (typeof postfix.label !== 'string') {
      throw new Error(`Постфикс "${postfix.id}" должен иметь строковое label`);
    }

    if (typeof postfix.postfix !== 'string') {
      throw new Error(`Постфикс "${postfix.id}" должен иметь строковое postfix`);
    }

    if (postfix.folderId != null && typeof postfix.folderId !== 'string') {
      throw new Error(`Постфикс "${postfix.id}" должен иметь строковое folderId или null`);
    }

    if (postfix.folderId && !folderIds.has(postfix.folderId)) {
      throw new Error(`Постфикс "${postfix.id}" ссылается на несуществующую папку`);
    }
  }

  validateMenuItem(item, menuIds, type) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Элемент "${type}" должен быть JSON-объектом`);
    }

    if (typeof item.id !== 'string' || !item.id.trim()) {
      throw new Error(`Элемент "${type}" должен иметь строковый id`);
    }

    if (RESERVED_MENU_IDS.has(item.id)) {
      throw new Error(`Зарезервированный id: ${item.id}`);
    }

    if (menuIds.has(item.id)) {
      throw new Error(`Дублирующийся id: ${item.id}`);
    }

    menuIds.add(item.id);
  }

  get postfixes() { return this.data.postfixes; }
  get folders() { return this.data.folders; }
  get history() { return this.data.history; }

  addPostfix(label, postfix, folderEl) {
    this.data.postfixes.push({
      id: crypto.randomUUID(),
      label,
      postfix,
      count: 0,
      createdAt: Date.now(),
      folderId: folderEl.value || null,
      order: Date.now()
    });

    return this.save();
  }

  addFolder(name) {
    this.data.folders.push({
        id: crypto.randomUUID(),
        name: name.trim(),
        collapsed: false,
        order: Date.now()
    });

    return this.save();
  }

  updateFolder(id, updates) {
    const index = this.data.folders.findIndex(f => f.id === id);
    if (index !== -1) {
      this.data.folders[index] = {
        ...this.data.folders[index],
        ...updates
      };
    }

    return this.save();
  }

  removeFolder(id) {
    this.data.folders = this.data.folders.filter(f => f.id !== id);
    return this.save();
  }

  addHistory(entry) {
    this.data.history.push({
      id: crypto.randomUUID(),
      ...entry,
      createdAt: Date.now()
    });

    return this.save();
  }

  removeHistory(id) {
    this.data.history = this.data.history.filter(h => h.id !== id);
    
    return this.save();
  }

  removePostfix(id) {
    this.data.postfixes = this.data.postfixes.filter(p => p.id !== id);
    return this.save();
  }

  updatePostfix(id, updates) {
    const index = this.data.postfixes.findIndex(p => p.id === id);
    if (index !== -1) {
      this.data.postfixes[index] = {
        ...this.data.postfixes[index],
        ...updates
      };
    }
    return this.save();
  }

  clearAll() {
    this.data = {
      postfixes: [],
      folders: [],
      history: []
    };
    return this.save();
  }

  clearHistory() {
    this.data.history = [];
    
    return this.save();
  }
}

export const state = new AppState();

export async function initState() {
  await state.init();
}
