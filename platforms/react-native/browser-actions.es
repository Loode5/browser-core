import { NativeModules } from 'react-native';
import { History } from './history/history';
import osAPI from './os-api';

const unsupportedError = () => {
  throw new Error('BrowserActions not supported by native');
};

const BrowserActions = NativeModules.BrowserActions || {
  searchHistory: (query, callback) => {
    if (query.length > 2) {
      History.query(5, 0, 0, undefined, query).then((results) => {
        callback(results.places);
      });
    } else {
      callback([]);
    }
  },
  openLink: unsupportedError,
  openMap: unsupportedError,
  callNumber: unsupportedError,
  hideKeyboard: unsupportedError,
  queryCliqz: unsupportedError,
  getReminders: unsupportedError,
  getOpenTabs: () => [],
  importBookmarks: unsupportedError,
};

export function historySearch(q, callback) {
  BrowserActions.searchHistory(q, (data = []) => {
    const results = data.map(item => ({
      style: 'favicon',
      value: item.url,
      image: '',
      comment: item.title || 'no comment',
      label: ''
    }));
    callback({ results, query: q, ready: true });
  });
}

export const openLink = BrowserActions.openLink;
export const openMap = BrowserActions.openMap;
export const callNumber = BrowserActions.callNumber;
export const hideKeyboard = BrowserActions.hideKeyboard;
export const queryCliqz = BrowserActions.queryCliqz;
export const openTab = BrowserActions.openTab || osAPI.openTab;
export const getOpenTabs = BrowserActions.getOpenTabs;
export const getReminders = BrowserActions.getReminders;
export const importBookmarks = BrowserActions.importBookmarks;
