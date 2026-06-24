import { state } from '../state/AppState.js'
import { pushHistory } from './history.js';

const CONFETI_STEP = 50;

export async function applyToCurrentTab(id, postfixParams = [], beforeNavigateCallback= () => {}, confetiCallback=  () => {}) {
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;
  
  const item = state.postfixes.find(p => p.id === id);

  if (!item) return;

  const prev = item.count;

  item.count += 1;

  state.updatePostfix(id, { count: item.count})

  // конфетти при достижении CONFETI_STEP (и кратных CONFETI_STEP — почему бы и нет)
  if (item.count >= CONFETI_STEP && prev < item.count && item.count % CONFETI_STEP === 0) {
    confetiCallback();
    // короткая задержка, чтобы конфетти успели стартовать перед переходом
    setTimeout(() => navigateAndClose(tab.id, item, tab.url, postfixParams), 600);
    beforeNavigateCallback();
    return;
  }

  navigateAndClose(tab.id, item, tab.url, postfixParams);

  beforeNavigateCallback();
}

export async function navigateAndClose(tabId, postfixItem, url, postfixParams = []) {
  let newUrl;
  try {
    if (postfixItem.postfix.startsWith('http://') || postfixItem.postfix.startsWith('https://')) {
      newUrl = templatePostfix(postfixItem.postfix, postfixParams);

      if (newUrl === null) {
        return;
      }

      pushHistory(postfixItem, postfixParams, newUrl, url, tabId)
      
      await chrome.tabs.create({ url: newUrl });

      return;
    }

    newUrl = applyPostfix(url, postfixItem.postfix, postfixParams);
  
    if (newUrl === null) {
      return;
    }
  } catch (e) {
    alert('Не удалось применить постфикс: ' + e.message);
    return;
  }

  pushHistory(postfixItem, postfixParams, newUrl, url, tabId)
      
  await chrome.tabs.update(tabId, { url: newUrl });
  //window.close();
}

export function templatePostfix(postfix, postfixParams = []) {
  const matches = postfix.match(/\{(\w+)\}/g) || [];
  const uniqueKeys = [...new Set(matches.map(m => m.slice(1, -1)))];
  
  let result = postfix;
  
  uniqueKeys.forEach(key => {
    let value = null;

    if (postfixParams.length > 0) {
      value = postfixParams[0];
    } else {
      value = prompt(`Введите значение для "${key}":`);
    }

    if (value === null) {
      result = null;
    }

    if (value !== null) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
  });
  
  return result;
}

export function parsePostfix(raw, postfixParams = []) {
  let s = raw.trim();
  s = templatePostfix(s, postfixParams);

  if (s === null) {
    return null;
  }

  if (s.startsWith('?') || s.startsWith('&')) s = s.slice(1);
  if (!s) return [];
  
  return s.split('&').map(pair => {
    const eq = pair.indexOf('=');
    if (eq === -1) return [decodeURIComponent(pair), ''];
    return [decodeURIComponent(pair.slice(0, eq)), decodeURIComponent(pair.slice(eq + 1))];
  });
}

export function applyPostfix(url, postfixRaw, postfixParams = []) {
  const u = new URL(url);
  const parseResult = parsePostfix(postfixRaw, postfixParams);

  if (parseResult === null) {
    return null;
  }

  for (const [k, v] of parseResult) u.searchParams.set(k, v);
  return u.toString();
}