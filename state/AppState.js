const STORAGE_KEY = 'data_v2';

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