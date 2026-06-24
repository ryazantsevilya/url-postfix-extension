import { state } from '../state/AppState.js'

export async function deleteHistory(id) {
  if (!confirm(`Вы уверены что хотите удалить элемент истории?`)) return;

  state.removeHistory(id);
}

export async function pushHistory(postfix, postfixParams, newUrl, url, tabId) {
  state.addHistory({
    postfix, postfixParams, newUrl, url, tabId
  })
}

export async function opneHistoryItem(historyItem) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;
  
  await chrome.tabs.create({ url: historyItem.newUrl });
}