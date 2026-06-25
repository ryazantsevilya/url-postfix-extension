import { applyToCurrentTab } from './services/postfix.js';
import { state, initState } from './state/AppState.js'

const ROOT_MENU_ID = "applyPostfixAction";
let menuRefreshQueue = Promise.resolve();

// Загружаем состояние при старте
async function initBackground() {
  await refreshChromeMenu();
}

function removeAllContextMenus() {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.removeAll(() => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

function createContextMenu(properties) {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(properties, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

async function rebuildChromeMenu() {
  await initState();
  await removeAllContextMenus();

  const createdIds = new Set();
  const folderIds = new Set(state.folders.map(folder => folder.id));

  async function createMenuItem(properties) {
    if (createdIds.has(properties.id)) {
      console.warn(`Skipping duplicate context menu id: ${properties.id}`);
      return;
    }

    createdIds.add(properties.id);
    await createContextMenu(properties);
  }

  await createMenuItem({
    id: ROOT_MENU_ID,
    title: "URL Postfix Manager",
    contexts: ["selection", "link"]
  });

  for (const folder of state.folders) {
    await createMenuItem({
      id: folder.id,
      title: folder.name,
      parentId: ROOT_MENU_ID,
      contexts: ["selection", "link"]
    });
  }

  for (const postfix of state.postfixes) {
    await createMenuItem({
      id: postfix.id,
      title: postfix.label,
      parentId: folderIds.has(postfix.folderId) ? postfix.folderId : ROOT_MENU_ID,
      contexts: ["selection", "link"]
    });
  }
}

async function refreshChromeMenu() {
  menuRefreshQueue = menuRefreshQueue
    .catch(() => {})
    .then(rebuildChromeMenu);

  return menuRefreshQueue;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const selectedText = info.selectionText;
  const postfixId = info.menuItemId;
  const linkUrl = info.linkUrl;

  if (postfixId === ROOT_MENU_ID) return; // родительский элемент

  // В случае если это ссылка
  if (linkUrl) {
      await applyToCurrentTab(postfixId, [linkUrl]);
  }

  await applyToCurrentTab(postfixId, [selectedText]);
});

initBackground();

// Слушаем сообщения от popup для обновления меню
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'refreshMenu') {
    refreshChromeMenu()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error('Failed to refresh context menu:', error);
        sendResponse({ ok: false, error: error.message });
      });

    return true;
  }
});
