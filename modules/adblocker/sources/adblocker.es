import LRUCache from '../core/helpers/fixed-size-cache';
import events from '../core/events';
import inject, { ifModuleEnabled } from '../core/kord/inject';
import prefs from '../core/prefs';
import { getGeneralDomain } from '../core/tlds';
import UrlWhitelist from '../core/url-whitelist';

import { deflate, inflate } from '../core/zlib';

import PersistentMap from '../core/persistence/map';
import { platformName } from '../core/platform';

import Adblocker from '../platform/lib/adblocker';

import AdbStats from './adb-stats';
import FiltersLoader, { FiltersList } from './filters-loader';
import logger from './logger';

import Pipeline from '../webrequest-pipeline/pipeline';

// adb version
export const ADB_VERSION = 12;

// Preferences
export const ADB_DISK_CACHE = 'cliqz-adb-disk-cache';
export const ADB_PREF = 'cliqz-adb';
export const ADB_PREF_OPTIMIZED = 'cliqz-adb-optimized';
export const ADB_ABTEST_PREF = 'cliqz-adb-abtest';
export const ADB_PREF_VALUES = {
  Enabled: 1,
  Disabled: 0,
};
export const ADB_DEFAULT_VALUE = ADB_PREF_VALUES.Disabled;
export const ADB_USER_LANG = 'cliqz-adb-lang';


export function adbABTestEnabled() {
  return prefs.get(ADB_ABTEST_PREF, ADB_PREF_VALUES.Enabled);
}


export function isSupportedProtocol(url) {
  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('ws://') ||
    url.startsWith('wss://'));
}

const CPT_TO_NAME = {
  1: 'other',
  2: 'script',
  3: 'image',
  4: 'css',
  5: 'object',
  6: 'document',
  7: 'iframe',
  8: 'refresh',
  9: 'xbl',
  10: 'ping',
  11: 'xhr',
  12: 'object_subrequest',
  13: 'dtd',
  14: 'font',
  15: 'media',
  16: 'websocket',
  17: 'csp_report',
  18: 'xslt',
  19: 'beacon',
  20: 'fetch',
  21: 'imageset',
};


const DEFAULT_OPTIONS = {
  onDiskCache: true,
  compressDiskCache: false,
  useCountryList: true,
  loadNetworkFilters: true,

  // We don't support cosmetics filters on mobile, so no need
  // to parse them, store them, etc.
  // This will reduce both: loading time, memory footprint, and size of
  // the serialized index on disk.
  loadCosmeticFilters: platformName !== 'mobile',
};


/* Wraps filter-based adblocking in a class. It has to handle both
 * the management of lists (fetching, updating) using a FiltersLoader
 * and the matching using a FiltersEngine.
 */
export class AdBlocker {
  constructor(options) {
    // Get options
    const {
      onDiskCache,
      compressDiskCache,
      loadNetworkFilters,
      loadCosmeticFilters,
      useCountryList,
    } = Object.assign({}, DEFAULT_OPTIONS, options);

    this.useCountryList = useCountryList;
    this.onDiskCache = onDiskCache;
    this.compressDiskCache = compressDiskCache;
    this.loadNetworkFilters = loadNetworkFilters;
    this.loadCosmeticFilters = loadCosmeticFilters;

    // This flag will be set to true only when the diagnosis page is opened
    this.diagnosisEnabled = false;
    this.blockingLogger = new Map();
    this.logs = [];
    this.engine = null;
    this.resetEngine();

    this.listsManager = null;
    this.resetLists();
  }

  log(msg) {
    const date = new Date();
    const message = `${date.getHours()}:${date.getMinutes()} ${msg}`;
    this.logs.push(message);
    logger.log(msg);
  }

  logBlocking(request, isAd, totalTime) {
    // Only enabled when the diagnosis page is opened
    if (this.diagnosisEnabled) {
      if (request.cpt === 6 || !this.blockingLogger.has(request.sourceUrl)) {
        this.blockingLogger.set(request.sourceUrl, [`<tr>
          <th>Time</th>
          <th>Blocked</th>
          <th>Redirect</th>
          <th>Filter</th>
          <th>Cpt</th>
          <th>Url</th>
        </tr>`]);
      }

      let color = 'white';
      if (isAd.redirect) {
        color = '#ffe552';
      } else if (isAd.exception) {
        color = '#33cc33';
      } else if (isAd.match) {
        color = '#ff5050';
      }

      this.blockingLogger.get(request.sourceUrl).push(`<tr
        style="background: ${color}">
        <td>${totalTime}</td>
        <td>${!!isAd.match}</td>
        <td>${!!isAd.redirect}</td>
        <td>${isAd.filter || ''}</td>
        <td>${CPT_TO_NAME[request.cpt] || request.cpt}</td>
        <td>${request.url}</td>
      </tr>`);
    }
  }

  resetLists() {
    this.log('Reset lists');

    if (this.listsManager !== null) {
      this.listsManager.stop();
    }

    // Plug filters lists manager with engine to update it
    // whenever a new version of the rules is available.
    this.listsManager = new FiltersLoader(
      this.useCountryList,
      prefs.get(ADB_USER_LANG, null)
    );
    this.listsManager.onUpdate((updates) => {
      // ---------------------- //
      // Update resources lists //
      // ---------------------- //
      const resourcesLists = updates.filter((update) => {
        const { isFiltersList, asset, checksum } = update;
        if (!isFiltersList && this.engine.resourceChecksum !== checksum) {
          this.log(`Resources list ${asset} (${checksum}) will be updated`);
          return true;
        }
        return false;
      });

      if (resourcesLists.length > 0) {
        const startResourcesUpdate = Date.now();
        this.engine.onUpdateResource(resourcesLists);
        this.log(`Engine updated with ${resourcesLists.length} resources` +
                 ` (${Date.now() - startResourcesUpdate} ms)`);
      }

      // -------------------- //
      // Update filters lists //
      // -------------------- //
      const filtersLists = updates.filter((update) => {
        const { asset, checksum, isFiltersList } = update;
        if (isFiltersList && !this.engine.hasList(asset, checksum)) {
          this.log(`Filters list ${asset} (${checksum}) will be updated`);
          return true;
        }
        return false;
      });

      let serializedEngine = null;
      if (filtersLists.length > 0) {
        const startFiltersUpdate = Date.now();
        serializedEngine = this.engine.onUpdateFilters(
          filtersLists,
          this.listsManager.getLoadedAssets(),
          this.onDiskCache,
        );
        this.log(`Engine updated with ${filtersLists.length} lists` +
                 ` (${Date.now() - startFiltersUpdate} ms)`);
      } else {
        // Call the method with an empty list + the list of loaded filters to
        // trigger clean-up of removed lists if needed.
        serializedEngine = this.engine.onUpdateFilters(
          [],
          this.listsManager.getLoadedAssets(),
          this.onDiskCache,
        );
      }

      // Flush the cache since the engine is now different
      this.initCache();

      // Serialize new version of the engine on disk if needed
      if (serializedEngine !== null) {
        const t0 = Date.now();
        const db = new PersistentMap('cliqz-adb');
        db.init()
          .then(() => db.set('engine',
            this.compressDiskCache ? deflate(serializedEngine) : serializedEngine
          ))
          .then(() => {
            const totalTime = Date.now() - t0;
            this.log(`Serialized filters engine (${totalTime} ms)`);
          })
          .catch((e) => {
            this.log(`Failed to serialize filters engine ${e}`);
          });
      } else {
        this.log('Engine has not been updated, do not serialize');
      }
    });
  }

  resetCache() {
    this.log('Reset cache');
    const db = new PersistentMap('cliqz-adb');
    return db.init()
      .then(() => db.delete('engine'))
      .catch((ex) => { logger.error('Error while resetCache', ex); });
  }

  resetEngine() {
    this.log('Reset engine');
    this.engine = new Adblocker.FiltersEngine({
      version: ADB_VERSION,
      loadNetworkFilters: this.loadNetworkFilters,
      loadCosmeticFilters: this.loadCosmeticFilters,
    });
  }

  initCache() {
    this.log('Init in-memory cache');
    // To make sure we don't break any filter behavior, each key in the LRU
    // cache is made up of { source general domain } + { url }.
    // This is because some filters will behave differently based on the
    // domain of the source.

    // Cache queries to FiltersEngine
    this.cache = new LRUCache(
      this.engine.match.bind(this.engine), // Compute result
      1000, // Maximum number of entries
      request => getGeneralDomain(request.sourceUrl) + request.url, // Select key
    );
  }

  loadEngineFromDisk() {
    if (this.onDiskCache) {
      const db = new PersistentMap('cliqz-adb');
      return db.init()
        .then(() => db.get('engine'))
        .then((serializedEngine) => {
          const t0 = Date.now();
          this.engine = Adblocker.deserializeEngine(
            this.compressDiskCache ? inflate(serializedEngine) : serializedEngine,
            ADB_VERSION,
          );
          this.listsManager.lists = new Map();
          this.engine.lists.forEach((list, asset) => {
            const filterslist = new FiltersList(
              list.checksum,
              asset,
              '' // If checksum does not match, the list will be update with a proper url
            );
            this.listsManager.lists.set(asset, filterslist);
          });
          const totalTime = Date.now() - t0;
          this.log(`Loaded filters engine (${totalTime} ms)`);
        })
        .catch((ex) => {
          this.log(`Exception while loading engine ${ex}`);
          // In case there is a mismatch between the version of the code
          // and the serialization format of the engine on disk, we might
          // not be able to load the engine from disk. Then we just start
          // fresh!
          this.resetEngine();
        });
    }

    return Promise.resolve();
  }

  reset() {
    return this.resetCache()
      .then(() => this.resetEngine())
      .then(() => this.resetLists())
      .then(() => this.listsManager.load());
  }

  init() {
    this.initCache();

    return this.loadEngineFromDisk()
      .then(() => this.listsManager.load())
      .then(() => {
        // Update check should be performed after a short while
        this.log('Check for updates');
        this.loadingTimer = setTimeout(
          () => this.listsManager.update(),
          30 * 1000);
      });
  }

  unload() {
    clearTimeout(this.loadingTimer);
    this.listsManager.stop();
  }


  /* @param {Object} request - Context of the request { url, sourceUrl, cpt }
   */
  match(request) {
    const t0 = Date.now();
    const isAd = this.cache.get(request);
    const totalTime = Date.now() - t0;

    // Keeps track of altered requests (only if the diagnosis page is opened)
    this.logBlocking(request, isAd, totalTime);

    return isAd;
  }
}

const CliqzADB = {
  adblockInitialized: false,
  adbStats: new AdbStats(),
  adBlocker: null,
  MIN_BROWSER_VERSION: 35,
  timers: [],
  webRequestPipeline: inject.module('webrequest-pipeline'),
  urlWhitelist: new UrlWhitelist('adb-blacklist'),
  humanWeb: null,
  paused: false,
  pipeline: null,
  whitelistChecks: [],

  adbEnabled() {
    // 0 = Disabled
    // 1 = Enabled
    return (
      !CliqzADB.paused &&
      adbABTestEnabled() &&
      prefs.get(ADB_PREF, ADB_PREF_VALUES.Disabled) !== ADB_PREF_VALUES.Disabled
    );
  },

  addWhiteListCheck(fn) {
    CliqzADB.whitelistChecks.push(fn);
  },

  cliqzWhitelisted(url) {
    return CliqzADB.urlWhitelist.isWhitelisted(url);
  },

  isAdbActive(url) {
    return CliqzADB.adbEnabled() &&
    CliqzADB.adblockInitialized &&
    !CliqzADB.whitelistChecks.some(fn => fn(url));
  },

  logActionHW(url, action, type) {
    const checkProcessing = CliqzADB.humanWeb.action('isProcessingUrl', url);
    checkProcessing.catch(() => {
      logger.log('no humanweb -> black/whitelist will not be logged');
    });
    const existHW = checkProcessing.then((exists) => {
      if (exists) {
        return Promise.resolve();
      }
      return Promise.reject();
    });
    existHW.then(() => {
      const data = {};
      data[action] = type;
      return CliqzADB.humanWeb.action('addDataToUrl', url, 'adblocker_blacklist', data);
    }, () => logger.log('url does not exist in hw'));
  },

  init(humanWeb) {
    CliqzADB.humanWeb = humanWeb;
    // Set `cliqz-adb` default to 'Disabled'
    if (prefs.get(ADB_PREF, null) === null) {
      prefs.set(ADB_PREF, ADB_PREF_VALUES.Disabled);
    }

    const initAdBlocker = () => {
      CliqzADB.adblockInitialized = true;
      CliqzADB.adBlocker = new AdBlocker({
        onDiskCache: prefs.get(ADB_DISK_CACHE, DEFAULT_OPTIONS.onDiskCache),
        useCountryList: prefs.get(ADB_USER_LANG, DEFAULT_OPTIONS.useCountryList),
      });

      CliqzADB.pipeline = new Pipeline('adblocker', [
        {
          name: 'checkContext',
          spec: 'blocking',
          fn: CliqzADB.stepCheckContext,
        },
        {
          name: 'checkWhitelist',
          spec: 'break',
          fn: CliqzADB.stepCheckWhitelist,
        },
        {
          name: 'checkBlocklist',
          spec: 'blocking',
          fn: CliqzADB.stepCheckBlockList,
        },
      ]);

      CliqzADB.whitelistChecks.push(CliqzADB.cliqzWhitelisted);

      return CliqzADB.adBlocker.init().then(() => {
        CliqzADB.initPacemaker();
        return CliqzADB.webRequestPipeline.action('addPipelineStep',
          'onBeforeRequest',
          {
            name: 'adblocker',
            spec: 'blocking',
            fn: (...args) => CliqzADB.pipeline.execute(...args),
            before: ['antitracking.onBeforeRequest'],
          },
        );
      });
    };

    this.onPrefChangeEvent = events.subscribe('prefchange', (pref) => {
      if (pref === ADB_PREF) {
        if (!CliqzADB.adblockInitialized && CliqzADB.adbEnabled()) {
          initAdBlocker();
        } else if (CliqzADB.adblockInitialized && !CliqzADB.adbEnabled()) {
          // Shallow unload
          CliqzADB.unload(false);
        }
      }
    });

    if (CliqzADB.adbEnabled()) {
      return CliqzADB.urlWhitelist.init()
        .then(() => initAdBlocker());
    }

    return Promise.resolve();
  },

  unload(fullUnload = true) {
    if (CliqzADB.adblockInitialized) {
      CliqzADB.adBlocker.unload();
      CliqzADB.adBlocker = null;
      CliqzADB.adblockInitialized = false;

      CliqzADB.unloadPacemaker();

      ifModuleEnabled(CliqzADB.webRequestPipeline.action('removePipelineStep', 'onBeforeRequest', 'adblocker'));
    }

    // If this is full unload, we also remove the pref listener
    if (fullUnload) {
      if (this.onPrefChangeEvent) {
        this.onPrefChangeEvent.unsubscribe();
      }
    }
  },

  initPacemaker() {
    const t1 = setInterval(() => {
      CliqzADB.adbStats.clearStats();
    }, 10 * 60 * 1000);
    CliqzADB.timers.push(t1);
  },

  unloadPacemaker() {
    CliqzADB.timers.forEach(clearTimeout);
  },

  stepCheckContext(state, response) {
    if (!(CliqzADB.adbEnabled() && CliqzADB.adblockInitialized)) {
      return false;
    }

    // Due to unbreakable pipelines, blocked requests might still come to
    // adblocker, we can simply ignore them
    if (response.cancel === true || response.redirectUrl) {
      return false;
    }

    const url = state.url;


    if (!url || !isSupportedProtocol(url)) {
      return false;
    }

    // This is the Url
    const sourceUrl = state.sourceUrl || '';
    if (!isSupportedProtocol(sourceUrl)) {
      return false;
    }

    if (state.cpt === 6) {
      // Loading document
      CliqzADB.adbStats.addNewPage(sourceUrl, state.tabId);
      return false;
    }

    return true;
  },

  stepCheckWhitelist(state) {
    const sourceUrl = state.sourceUrl || '';
    // We do it here because the Adblocker might be used by other modules
    // (like green-ads), and they should not be subjected to whitelists.
    if (CliqzADB.urlWhitelist.isWhitelisted(sourceUrl)) {
      return false;
    }
    return true;
  },

  stepCheckBlockList(state, response) {
    const { sourceUrl, url } = state;
    const result = CliqzADB.adBlocker.match({
      sourceUrl,
      url,
      cpt: state.cpt,
    });
    if (result.redirect) {
      response.redirectTo(result.redirect);
      return false;
    } else if (result.match) {
      CliqzADB.adbStats.addBlockedUrl(sourceUrl, url, state.tabId);
      response.block();
      // TODO - should we stop the pipeline?
      return false;
    }

    return true;
  },
};

export default CliqzADB;
