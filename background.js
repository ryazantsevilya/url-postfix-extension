import { applyToCurrentTab } from './services/postfix.js';
import { state, initState } from './state/AppState.js'

const ROOT_MENU_ID = "applyPostfixAction";

// Загружаем состояние при старте
async function initBackground() {
  initState();

  await refreshChromeMenu();
}

async function refreshChromeMenu() {
  await initState();

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: ROOT_MENU_ID,
      title: "URL Postfix Manager",
      contexts: ["selection", "link"]
    });

    for (const folder of state.folders) {
      chrome.contextMenus.create({
        id: folder.id,
        title: folder.name,
        parentId: ROOT_MENU_ID,
        contexts: ["selection", "link"]
      });
    }

    for (const postfix of state.postfixes) {
      if (postfix.folderId) {
        chrome.contextMenus.create({
          id: postfix.id,
          title: postfix.label,
          parentId: postfix.folderId,
          contexts: ["selection", "link"]
        });
      } else {
        chrome.contextMenus.create({
          id: postfix.id,
          title: postfix.label,
          parentId: ROOT_MENU_ID,
          contexts: ["selection", "link"]
        });
      }
    }
  });
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
    refreshChromeMenu();
  }
});