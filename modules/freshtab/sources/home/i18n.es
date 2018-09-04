/* globals chrome */
export default function t(key, params = []) {
  return chrome.i18n.getMessage(`freshtab_${key}`, params);
}

function tt(key, params = []) {
  return chrome.i18n.getMessage(key, params);
}

export { t, tt };
