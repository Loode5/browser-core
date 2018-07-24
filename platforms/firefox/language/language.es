/* eslint no-restricted-syntax: 'off' */
/* eslint no-bitwise: 'off' */
/* eslint no-param-reassign: 'off' */
/*
 * This module determines the language of visited pages and
 * creates a list of known languages for a user
 *
 */

import { cleanUrlProtocol } from '../../core/url';
import i18n from '../../core/i18n';
import prefs from '../../core/prefs';
import console from '../../core/console';

// we keep a different preferences namespace than cliqz so that it does not get
// removed after a re-install or sent during a logging signal
const CliqzLanguage = {
  DOMAIN_THRESHOLD: 3,
  READING_THRESHOLD: 10000,
  LOG_KEY: 'CliqzLanguage',
  LOCALE_HASH: 333,
  currentState: {},
  cron: 24 * 60 * 60 * 1000, // default one day
  checkInterval: 5 * 60 * 1000, // default 5 min
  removeHashId: null,

  getLocale() {
    return i18n.PLATFORM_LANGUAGE;
  },

  // load from the about:config settings
  init(window) {
    CliqzLanguage.window = window;
    if (this.removeHashId === null) {
      this.removeHashId = setInterval(this.updateTicker.bind(this), this.checkInterval);
    }

    if (prefs.has('data', 'extensions.cliqz-lang.')) {
      try {
        // catch empty value or malformed json
        CliqzLanguage.currentState = JSON.parse(
          prefs.get('data', {}, 'extensions.cliqz-lang.'));
      } catch (e) {
        // empty
      }
    }
    const localeLangs = [];
    let maxValue = 0;
    // transform legacy data
    Object.keys(CliqzLanguage.currentState).forEach((lang) => {
      if (CliqzLanguage.currentState[lang] === 'locale'
        || CliqzLanguage.currentState[lang].indexOf(257) !== -1) {
        localeLangs.push(lang);
      }

      if (CliqzLanguage.currentState[lang] instanceof Array) {
        maxValue = Math.max(maxValue, CliqzLanguage.currentState[lang].length);
      }
    });

    if (localeLangs.length) {
      const maxLen = Math.max(CliqzLanguage.DOMAIN_THRESHOLD + 1, maxValue);

      for (const locale of localeLangs) {
        const originalArray = CliqzLanguage.currentState[locale];
        if (originalArray === 'locale') {
          CliqzLanguage.currentState[locale] = CliqzLanguage.createHashes(maxLen);
        } else if (originalArray.length < maxLen) {
          CliqzLanguage.currentState[locale] = CliqzLanguage.createHashes(maxLen);
        }

        // add 'locale' hash
        CliqzLanguage.currentState[locale][0] = CliqzLanguage.LOCALE_HASH;
      }
    }

    const ll = CliqzLanguage.getLocale();
    if (ll && CliqzLanguage.currentState[ll] === null) {
      // we found new locale
      CliqzLanguage.currentState[ll] = CliqzLanguage
        .createHashes(CliqzLanguage.DOMAIN_THRESHOLD + 1);
      // add 'locale' hash
      CliqzLanguage.currentState[ll][0] = CliqzLanguage.LOCALE_HASH;
    }

    CliqzLanguage.cleanCurrentState();
    CliqzLanguage.saveCurrentState();

    console.log(CliqzLanguage.stateToQueryString(), CliqzLanguage.LOG_KEY);
  },
  unload() {
    if (this.removeHashId !== null) {
      clearInterval(this.removeHashId);
      this.removeHashId = null;
    }
  },
  updateTicker() {
    let lastUpdate = 0;
    if (prefs.has('lastUpdate', 'extensions.cliqz-lang.')) {
      try {
        lastUpdate = parseInt(prefs.get('lastUpdate', 0, 'extensions.cliqz-lang.'), 10);
      } catch (e) {
        lastUpdate = 0;
      }
    }
    const currentTime = Date.now();
    if (currentTime > this.cron + lastUpdate) {
      this.removeHash();
      prefs.set('lastUpdate', String(currentTime), 'extensions.cliqz-lang.');
    }
  },
  // create array of unique hashes
  createHashes(maxLen) {
    const hashes = [];
    let i = 0;
    while (i < maxLen) {
      // random hash value: [-256, 255]
      const r = Math.floor(Math.random() * 512) - 256;
      if (hashes.indexOf(r) === -1) {
        hashes.push(r);
        i += 1;
      }
    }
    return hashes;
  },
  // add locale, this is the function hook that will be called for every page load that
  // stays more than 5 seconds active
  addLocale(url, localeStr) {
    const locale = CliqzLanguage.normalizeLocale(localeStr);

    if (locale === '' || locale === undefined || locale === null || locale.length !== 2) return;
    if (url === '' || url === undefined || url === null) return;

    // extract domain from url, hash it and update the value
    const urlHash = CliqzLanguage.hashCode(cleanUrlProtocol(url, true).split('/')[0]) % 256;

    if (!CliqzLanguage.currentState[locale]) {
      CliqzLanguage.currentState[locale] = [];
    }

    if (CliqzLanguage.currentState[locale].indexOf(urlHash) === -1) {
      CliqzLanguage.currentState[locale].push(urlHash);
      console.log(`Saving: ${locale} ${urlHash}`, `${CliqzLanguage.LOG_KEY} for url ${url}`);
      CliqzLanguage.saveCurrentState();
    }
  },
  // do random delete of hash with prob 0.05 (5%)
  removeHash() {
    let changed = false;
    for (const lang in CliqzLanguage.currentState) {
      if (CliqzLanguage.currentState[lang].length > (CliqzLanguage.DOMAIN_THRESHOLD + 1)) {
        const prob = Math.random();
        if (prob <= 0.05) {
          const ind = Math.floor(Math.random() * CliqzLanguage.currentState[lang].length);
          if (CliqzLanguage.currentState[lang][ind] !== CliqzLanguage.LOCALE_HASH) {
            if (!changed) changed = !changed;
            console.log(`Removing hash ${CliqzLanguage.currentState[lang][ind]} for the language ${lang}`);
            CliqzLanguage.currentState[lang].splice(ind, 1);
          }
        }
      }
    }
    if (changed) CliqzLanguage.saveCurrentState();
  },
  // returns hash of the string
  hashCode(s) {
    return s.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
  },
  // removes the country from the locale, for instance, de-de => de, en-US => en
  normalizeLocale(str) {
    if (str) return str.split(/-|_/)[0].trim().toLowerCase();
    return str;
  },
  // the function that decided which languages the person understands
  state(distribution) {
    distribution = typeof distribution !== 'undefined' ? distribution : false;
    let langVec = [];
    for (const lang in CliqzLanguage.currentState) {
      if (Object.prototype.hasOwnProperty.call(CliqzLanguage.currentState, lang)) {
        const len = Object.keys(CliqzLanguage.currentState[lang]).length;
        if (len > CliqzLanguage.DOMAIN_THRESHOLD) {
          langVec.push([lang, 1.0 / len]);
        }
      }
    }

    langVec = langVec.sort((a, b) => a[1] - b[1]);
    // returns full distribution if asked for it
    if (distribution) {
      return langVec;
    }

    // returns only lang names
    const langVecClean = [];
    for (const index in langVec) {
      if (Object.prototype.hasOwnProperty.call(langVec, index)) {
        langVecClean.push(langVec[index][0]);
      }
    }

    return langVecClean;
  },
  // remove doubled values, normalize languages
  cleanCurrentState() {
    const keys = Object.keys(CliqzLanguage.currentState);
    const cleanState = {};
    for (let i = 0; i < keys.length; i += 1) {
      const nkey = CliqzLanguage.normalizeLocale(keys[i]);
      cleanState[nkey] = (cleanState[nkey] || []);

      for (let j = 0; j < CliqzLanguage.currentState[keys[i]].length; j += 1) {
        const value = CliqzLanguage.currentState[keys[i]][j];
        if (cleanState[nkey].indexOf(value) === -1) cleanState[nkey].push(value);
      }
    }
    if (cleanState !== CliqzLanguage.currentState) {
      CliqzLanguage.currentState = cleanState;
      CliqzLanguage.saveCurrentState();
    }
  },
  // returns query string with popular languages
  // Limit the lang parameters to top 3
  stateToQueryString() {
    return `&lang=${encodeURIComponent(CliqzLanguage.state().slice(0, 3).join(','))}`;
  },
  // Save the current state to preferences,
  saveCurrentState() {
    console.log(`Going to save languages: ${JSON.stringify(CliqzLanguage.currentState)}`, CliqzLanguage.LOG_KEY);
    prefs.set('data',
      JSON.stringify(CliqzLanguage.currentState || {}),
      'extensions.cliqz-lang.');
  }
};

export default CliqzLanguage;
