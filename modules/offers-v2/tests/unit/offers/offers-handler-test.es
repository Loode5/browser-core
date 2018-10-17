/* global chai */
/* global describeModule */
/* global require */
/* eslint-disable func-names,prefer-arrow-callback,arrow-body-style, no-param-reassign */


const adblocker = require('@cliqz/adblocker');
const tldjs = require('tldjs');


const prefRetVal = {};
const currentTS = Date.now();
let latestOffersInstalledTs = 0;
const currentDayHour = 0;
const currentWeekDay = 0;
let getDetailsFromUrlReal;
let UrlData;
let eventMessages = [];
let shouldFilterOfferID = '';

let persistence = {};
function delay(fn) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      Promise.resolve()
        .then(fn)
        .then(resolve)
        .catch(reject);
    }, 100);
  });
}

let globalActiveCats = new Set();

const buildUrlData = (url, referrer, activeCats = globalActiveCats) => {
  const urlData = new UrlData(url, referrer);
  urlData.setActivatedCategoriesIDs(activeCats);
  return urlData;
};

const VALID_OFFER_OBJ = {
  action_info: {
    on_click: 'https://www.cliqz.com'
  },
  campaign_id: 'cid_1',
  client_id: 'client-1',
  display_id: 'x-d',
  filterRules: "generic_comparator('offer_closed','l_u_ts','>=',30) && " +
                 "generic_comparator('offer_shown','counter','<=',5)",
  offer_id: 'x',
  rule_info: {
    display_time_secs: 999999,
    type: 'exact_match',
    url: []
  },
  ui_info: {
    template_data: {
      call_to_action: {
        target: '',
        text: 'Jetzt Anfordern',
        url: 'http://newurl'
      },
      conditions: 'Some conditions',
      desc: 'Some description',
      logo_url: 'somelogourl',
      title: 'This is the title',
      voucher_classes: ''
    },
    template_name: 'ticket_template'
  },
  rs_dest: ['offers-cc'],
  types: ['type1', 'type2'],
  monitorData: [],
  displayPriority: 0.0,
  version: '',
  categories: ['cat1'],
};

const cloneObject = obj => JSON.parse(JSON.stringify(obj));
const cloneOffer = () => cloneObject(VALID_OFFER_OBJ);

const buildOffer = (offerID, campaignID, clientID, displayPriority, filterRules) => {
  const offer = cloneOffer();
  if (offerID) { offer.offer_id = offerID; }
  if (campaignID) { offer.campaign_id = campaignID; }
  if (clientID) { offer.client_id = clientID; }
  if (displayPriority) { offer.displayPriority = displayPriority; }
  if (filterRules) { offer.filterRules = filterRules; }
  return offer;
};

const VALID_4_OFFERS = [
  buildOffer('o1', 'cid1', 'client1', 0.6),
  buildOffer('o2', 'cid1', 'client1', 0.4),
  buildOffer('o3', 'cid2', 'client2', 0.9),
  buildOffer('o4', 'cid3', 'client3', 0.8),
];

// /////////////////////////////////////////////////////////////////////////////
//                              MOCKS
// /////////////////////////////////////////////////////////////////////////////

class IntentMock {
  constructor(d) {
    this.name = d.name;
    this.active = d.active;
    this.durationSecs = d.durationSecs || 10;
  }
  getName() {
    return this.name;
  }
  isActive() {
    return this.active;
  }
  getDurationSecs() {
    return this.durationSecs;
  }
}

class IntentHandlerMock {
  constructor() {
    this.cb = [];
    this.activeIntents = [];
  }
  registerCallback(cb) { this.cb.push(cb); }
  unregisterCallback() {}
  activateIntentMock(intentData) {
    const intent = new IntentMock(intentData);
    this.activeIntents.push(intent);
    this.cb.forEach(cb => cb('intent-active', intent));
  }
  getActiveIntents() {
    return this.activeIntents;
  }
  getActiveIntent(intentName) {
    let idx = -1;
    for (let i = 0; idx < 0 && i < this.activeIntents.length; i += 1) {
      if (this.activeIntents[i].name === intentName) {
        idx = i;
      }
    }
    return idx < 0 ? null : this.activeIntents[idx];
  }
  isIntentActiveByName(intentName) {
    return this.activeIntents.some(i => i.getName() === intentName);
  }
  isIntentActive(intent) {
    return this.isIntentActiveByName(intent.getName());
  }
}

class BackendConnectorMock {
  constructor() {
    this.result = {};
  }
  sendApiRequest(endpoint, params) {
    return Promise.resolve(this.result[params.intent_name]);
  }
}

class FeatureHandlerMock {
  isFeatureAvailable() {
    return false;
  }
  getFeature() {
    return null;
  }
}

class HistoryMatcherMock {
  constructor() {
    this.isHistoryEnabled = false;
    this.countMatchesResult = { isPartial: false, count: 0 };
  }
  hasHistoryEnabled() {
    return this.isHistoryEnabled;
  }
  countMatchesWithPartialCheck() {
    return this.countMatchesResult;
  }
  countMatches() {
    return this.countMatchesResult.count;
  }
}

class CategoryHandlerMock {
  constructor() {
    this.result = true;
  }

  isCategoryActive() {
    return this.result;
  }
}

class SignalHandlerMock {
  constructor() {
    this.db = {
      campaign: {},
      action: {}
    };
  }
  destroy() {}

  setCampaignSignal(cid, oid, origID, sid) {
    let cidm = this.db.campaign[cid];
    if (!cidm) {
      cidm = {};
      this.db.campaign[cid] = cidm;
    }
    let oidm = cidm[oid];
    if (!oidm) {
      oidm = {};
      cidm[oid] = oidm;
    }
    let origm = oidm[origID];
    if (!origm) {
      origm = {};
      oidm[origID] = origm;
    }
    if (!origm[sid]) {
      origm[sid] = 1;
    } else {
      origm[sid] += 1;
    }
  }

  setActionSignal(actionID, origID) {
    let origm = this.db.action[origID];
    if (!origm) {
      origm = {};
      this.db.action[origID] = origm;
    }
    if (!origID[actionID]) {
      origID[actionID] = 1;
    } else {
      origID[actionID] += 1;
    }
  }

  // helper methods to get some values
  getCampaignSignal(cid, oid, origID, sid) {
    let m = this.db.campaign[cid];
    if (!m) { return null; }
    m = m[oid];
    if (!m) { return null; }
    m = m[origID];
    if (!m) { return null; }
    return m[sid];
  }
  getCampaignSignalsCount() {
    return Object.keys(this.db.campaign).length;
  }

  getActionSignal(actionID, origID) {
    const m = this.db.action[origID];
    if (!m) { return null; }
    return m[actionID];
  }
  getActionSignalCount() {
    return Object.keys(this.db.action).length;
  }
}

class EventHandlerMock {
  constructor() {
    this.httpMap = new Map();
    this.urlMap = new Map();
  }
  isHttpReqDomainSubscribed(cb, dom) {
    return this.httpMap.has(dom) && this.httpMap.get(dom).has(cb);
  }
  subscribeHttpReq(cb, domainName) {
    if (!this.httpMap.has(domainName)) {
      this.httpMap.set(domainName, new Set());
    }
    this.httpMap.get(domainName).add(cb);
  }
  unsubscribeHttpReq(cb, domainName) {
    if (this.httpMap.has(domainName)) {
      this.httpMap.get(domainName).delete(cb);
    }
  }
  subscribeUrlChange(cb, cargs = null) {
    this.urlMap.set(cb, cargs);
  }
  unsubscribeUrlChange(cb) {
    this.urlMap.delete(cb);
  }

  simUrlChange(url, ref) {
    this.urlMap.forEach((cargs, cb) => cb(buildUrlData(url, ref), cargs));
  }
  simWebRequest(url, ref) {
    // need to get domain here
    const urlData = buildUrlData(url, ref);
    const domain = urlData.getDomain();
    if (this.httpMap.has(domain)) {
      this.httpMap.get(domain).forEach(cb => cb({ url_data: urlData }));
    }
  }
}

export default describeModule('offers-v2/offers/offers-handler',
  () => ({
    'platform/lib/adblocker': {
      default: adblocker,
    },
    'core/platform': {
      isWebExtension: false
    },
    'core/config': {
      default: {
        settings: {
          get channel() {
            return '40'; // chanel defines logic when to show an offer
          },
        },
      },
    },
    'platform/xmlhttprequest': {
      default: {}
    },
    'platform/fetch': {
      default: {}
    },
    'platform/gzip': {
      default: {}
    },
    'platform/globals': {
      default: {}
    },
    'platform/environment': {
      default: {}
    },
    'platform/lib/tldjs': {
      default: tldjs,
    },
    'offers-v2/utils': {
      timestamp: function () {},
      timestampMS: function () {
        return currentTS;
      },
      dayHour: function () {
        return currentDayHour;
      },
      weekDay: function () {
        return currentWeekDay;
      },
      getABNumber: function () {},
      getLatestOfferInstallTs: function () {
        return latestOffersInstalledTs;
      },
    },
    'core/crypto/random': {
      random: function () {
        return Math.random();
      }
    },
    'core/prefs': {
      default: {
        get: function (v, d) {
          if (prefRetVal[v]) {
            return prefRetVal[v];
          }
          return d;
        },
        setMockVal: function (varName, val) {
          prefRetVal[varName] = val;
        }
      }
    },
    'core/utils': {
      default: {}
    },
    'core/url': {
      getDetailsFromUrl: function (url) {
        // we should extract the name here
        return getDetailsFromUrlReal(url);
      },
    },
    'platform/console': {
      default: {},
    },
    'offers-v2/common/offers_v2_logger': {
      default: {
        debug: () => {},
        error: () => {},
        info: () => {},
        log: () => {},
        warn: () => {},
      }
    },
    'offers-v2/offers/soft-filter': {
      default: (offer) => {
        return !offer || offer.uniqueID === shouldFilterOfferID;
      }
    },
    'core/events': {
      default: {
        msgs: {},
        sub(channel) {
          // we dont care about functions subscriber or anything just get the
          // messages and store them to process them later
          if (!eventMessages[channel]) {
            eventMessages[channel] = [];
          }
        },
        un_sub() {
        },
        pub(ch, msg) {
          if (!eventMessages[ch]) {
            eventMessages[ch] = [];
          }
          eventMessages[ch].push(msg);
        },

        // helper methods
        clearAll() {
          eventMessages = {};
        },
        countMsgs(ch) {
          return !eventMessages[ch] ? 0 : eventMessages[ch].length;
        }

      }
    },
    'core/persistence/map': {
      default: class MockMap {
        constructor(dbName) {
          persistence[dbName] = (persistence[dbName] || new Map());
          this.db = persistence[dbName];
        }

        init() {
          return Promise.resolve();
        }

        unload() {
          return Promise.resolve();
        }

        get(key) {
          return delay(() => this.db.get(key));
        }

        set(key, value) {
          return delay(() => this.db.set(key, value));
        }

        has(key) {
          return delay(() => this.db.has(key));
        }

        delete(key) {
          return delay(() => this.db.delete(key));
        }

        clear() {
          return delay(() => this.db.clear());
        }

        size() {
          return delay(() => this.db.size());
        }

        keys() {
          return delay(() => [...this.db.keys()]);
        }

        entries() {
          return delay(() => [...this.db.entries()]);
        }
      }
    },
    'offers-v2/background': {
      default: {
        offersAPI: {
          processRealEstateMessage: () => {}
        }
      },
    },
  }),
  () => {
    describe('/offers-handler', function () {
      let OffersHandler;
      let events;

      beforeEach(function () {
        OffersHandler = this.module().default;
        events = this.deps('core/events').default;
        return Promise.all([
          this.system.import('offers-v2/common/url_data'),
          this.system.import('core/url'),
        ]).then((mods) => {
          UrlData = mods[0].default;
          getDetailsFromUrlReal = mods[1].getDetailsFromUrl;
        });
      });


      describe('/offers-handler-test basic test', function () {
        context('/all tests', function () {
          let intentHandlerMock;
          let backendConnectorMock;
          let presentRealEstates;
          let historyMatcherMock;
          let featuresHandlerMock;
          let sigHandlerMock;
          let eventHadlerMock;
          let ohandler;
          let catHandlerMock;
          let offersDB;

          beforeEach(function () {
            persistence = {};
            globalActiveCats = new Set();

            shouldFilterOfferID = '';

            intentHandlerMock = new IntentHandlerMock();
            backendConnectorMock = new BackendConnectorMock();
            presentRealEstates = new Map();
            historyMatcherMock = new HistoryMatcherMock();
            catHandlerMock = new CategoryHandlerMock();
            sigHandlerMock = new SignalHandlerMock();
            eventHadlerMock = new EventHandlerMock();
            featuresHandlerMock = new FeatureHandlerMock();

            presentRealEstates.set('offers-cc', true);

            ohandler = new OffersHandler({
              intentHandler: intentHandlerMock,
              backendConnector: backendConnectorMock,
              presentRealEstates,
              historyMatcher: historyMatcherMock,
              featuresHandler: featuresHandlerMock,
              sigHandler: sigHandlerMock,
              eventHandler: eventHadlerMock,
              categoryHandler: catHandlerMock,
            });

            offersDB = ohandler.offersDB;

            eventMessages = [];
            latestOffersInstalledTs = 0;
          });

          function configureMockData(md) {
            // backend result: intent_name -> [offer1, offer2, ...]
            if (md.backendResult) {
              backendConnectorMock.result = md.backendResult;
            }
          }

          function checkEventPushedForOffer(offerID) {
            const msg = eventMessages['offers-send-ch'][0];
            chai.expect(msg.type).eql('push-offer');
            chai.expect(msg.origin).eql('offers-core');
            chai.expect(msg.data.offer_id).eql(offerID);
          }

          function checkOfferPushed(offerID) {
            checkEventPushedForOffer(offerID);
            // TODO: check signal handler here?
          }

          function checkZeroOfferPushed() {
            chai.expect(events.countMsgs('offers-send-ch')).eql(0);
          }

          function waitForBEPromise() {
            // return backendConnectorMock.lastPromise;
            return new Promise((resolve) => {
              const wait = () => {
                setTimeout(() => {
                  resolve(true);
                }, 10);
              };
              wait();
            });
          }

          function simulateUrlEventsAndWait(urls) {
            const promises = [];
            urls.forEach((u) => {
              const urlData = buildUrlData(u, null);
              promises.push(ohandler._processEvent({ urlData }));
            });
            return Promise.all(promises);
          }

          function setActiveCategoriesFromOffers(offersList) {
            globalActiveCats = new Set();
            offersList.forEach((offer) => {
              if (offer.categories) {
                offer.categories.forEach(c => globalActiveCats.add(c));
              }
            });
          }

          function incOfferActions(offerList, offerAction, count) {
            offerList.forEach((offer) => {
              offersDB.addOfferObject(offer.offer_id, offer);
              offersDB.incOfferAction(offer.offer_id, offerAction, true, count);
            });
          }

          function updateOfferOnDB(ob) {
            if (offersDB.hasOfferData(ob.offer_id)) {
              offersDB.updateOfferObject(ob.offer_id, ob);
            } else {
              offersDB.addOfferObject(ob.offer_id, ob);
            }
          }

          it('/check offers handler exists', function () {
            chai.expect(ohandler).to.exist;
            chai.expect(offersDB).to.exist;
          });

          it('/check one intent activates offers properly', function () {
            const mockData = {
              backendResult: { 'intent-1': [VALID_OFFER_OBJ] },
            };
            configureMockData(mockData);

            // activate intents
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));

            return waitForBEPromise().then(() => {
              // wait for the fetch
              const urls = [
                'http://www.google.com',
              ];
              setActiveCategoriesFromOffers([VALID_OFFER_OBJ]);
              return simulateUrlEventsAndWait(urls).then(() => {
                // check that we could push the
                checkOfferPushed('x');
              });
            });
          });

          it('/check if offer is fresh installed we do not show an offer', function () {
            const mockData = {
              backendResult: { 'intent-1': [VALID_OFFER_OBJ] },
            };
            configureMockData(mockData);

            // activate intents
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));

            // set the latest installed time to the same than current one =>
            // this should produce freshInstalled = true => do not show offers
            latestOffersInstalledTs = currentTS;
            return waitForBEPromise().then(() => {
              // wait for the fetch
              const urls = [
                'http://www.google.com',
              ];
              setActiveCategoriesFromOffers([VALID_OFFER_OBJ]);
              return simulateUrlEventsAndWait(urls).then(() => {
                // check no offer were pushed
                checkZeroOfferPushed();
              });
            });
          });

          it('/check showing 3 times same offer can still be shown', function () {
            const offersList = [
              buildOffer('o1', 'cid1', 'client1', 0.9),
              buildOffer('o2', 'cid1', 'client1', 0.8),
              buildOffer('o3', 'cid2', 'client2', 0.7),
              buildOffer('o4', 'cid3', 'client3', 0.6),
            ];

            const mockData = {
              backendResult: { 'intent-1': offersList },
            };
            configureMockData(mockData);

            // activate intents
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));

            // wait for the fetch
            return waitForBEPromise().then(() => {
              const urls = [
                'http://www.google.com',
              ];
              setActiveCategoriesFromOffers(offersList);
              incOfferActions([offersList[0]], 'offer_dsp_session', 3);
              return simulateUrlEventsAndWait(urls).then(() => {
                // check that we could push the
                checkOfferPushed('o1');
              });
            });
          });

          it('/check showing 3 times 2 offer can still be shown', function () {
            const offersList = [
              buildOffer('o1', 'cid1', 'client1', 0.9),
              buildOffer('o2', 'cid1b', 'client1', 0.8),
              buildOffer('o3', 'cid2', 'client2', 0.7),
              buildOffer('o4', 'cid3', 'client3', 0.6),
            ];

            const mockData = {
              backendResult: { 'intent-1': offersList },
            };
            configureMockData(mockData);

            // activate intents
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));

            // wait for the fetch
            return waitForBEPromise().then(() => {
              const urls = [
                'http://www.google.com',
              ];
              setActiveCategoriesFromOffers(offersList);
              incOfferActions([offersList[0], offersList[1]], 'offer_dsp_session', 3);
              return simulateUrlEventsAndWait(urls).then(() => {
                // check that we could push the
                checkOfferPushed('o1');
              });
            });
          });

          it('/check adding 4 offers will still show another offer', function () {
            const offersList = [
              buildOffer('o1', 'cid1', 'client1', 0.9),
              buildOffer('o2', 'cid1b', 'client1', 0.8),
              buildOffer('o3', 'cid2', 'client2', 0.7),
              buildOffer('o4', 'cid3', 'client3', 0.6),
              buildOffer('o5', 'cid4', 'client', 0.6),
              buildOffer('o6', 'cid5', 'client4', 0.6),
            ];

            const mockData = {
              backendResult: { 'intent-1': offersList },
            };
            configureMockData(mockData);

            // activate intents
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));

            // wait for the fetch
            return waitForBEPromise().then(() => {
              const urls = [
                'http://www.google.com',
              ];
              setActiveCategoriesFromOffers(offersList);
              incOfferActions([offersList[0], offersList[1], offersList[2], offersList[3]], 'offer_dsp_session', 1);
              return simulateUrlEventsAndWait(urls).then(() => {
                checkOfferPushed('o1');
              });
            });
          });

          it('/check adding 5 offers will not show any other offer after', function () {
            const offersList = [
              buildOffer('o1', 'cid1', 'client1', 0.9),
              buildOffer('o2', 'cid1', 'client1', 0.8),
              buildOffer('o3', 'cid2', 'client2', 0.7),
              buildOffer('o4', 'cid3', 'client3', 0.6),
              buildOffer('o5', 'cid4', 'client', 0.6),
              buildOffer('o6', 'cid5', 'client4', 0.6),
            ];

            const mockData = {
              backendResult: { 'intent-1': offersList },
            };
            configureMockData(mockData);

            // activate intents
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));

            // wait for the fetch
            return waitForBEPromise().then(() => {
              const urls = [
                'http://www.google.com',
              ];
              setActiveCategoriesFromOffers(offersList);
              incOfferActions([offersList[0], offersList[1], offersList[2], offersList[3], offersList[4]], 'offer_dsp_session', 1);
              return simulateUrlEventsAndWait(urls).then(() => {
                // check that we could push the
                checkZeroOfferPushed();
              });
            });
          });

          it('/check multiple offers are properly sorted by priority', function () {
            const mockData = {
              backendResult: { 'intent-1': VALID_4_OFFERS },
            };
            configureMockData(mockData);

            // activate intents
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));

            // wait for the fetch
            return waitForBEPromise().then(() => {
              const urls = [
                'http://www.google.com',
              ];
              setActiveCategoriesFromOffers(VALID_4_OFFERS);

              return simulateUrlEventsAndWait(urls).then(() => {
                // check that we could push the
                checkOfferPushed('o3');
              });
            });
          });

          it('/check that filtering offers works', function () {
            const offersList = [
              buildOffer('o1', 'cid1', 'client1', 0.9),
              buildOffer('o2', 'cid1', 'client1', 0.8),
              buildOffer('o3', 'cid2', 'client2', 0.7),
              buildOffer('o4', 'cid3', 'client3', 0.6),
            ];
            // make o1, o2, o3 invalid since we only have offer-cc
            offersList[0].rs_dest = ['browser-panel'];
            offersList[1].rs_dest = ['browser-panel'];
            offersList[2].rs_dest = ['browser-panel'];
            // offersList[3].rs_dest = [];

            const mockData = {
              backendResult: { 'intent-1': offersList },
            };
            configureMockData(mockData);

            // activate intents
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));

            // wait for the fetch
            return waitForBEPromise().then(() => {
              const urls = [
                'http://www.google.com',
              ];
              setActiveCategoriesFromOffers(offersList);
              return simulateUrlEventsAndWait(urls).then(() => {
                // check that we could push the
                checkOfferPushed('o4');
              });
            });
          });

          it('/offer is removed after it doesnt match the soft filters and we proceed to the next', function () {
            const offersList = [
              buildOffer('o1', 'cid1', 'client1', 0.1),
              buildOffer('o2', 'cid2', 'client2', 0.9),
            ];
            const mockData = {
              backendResult: { 'intent-1': offersList },
            };
            configureMockData(mockData);

            // activate intents
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));

            // wait for the fetch
            return waitForBEPromise().then(() => {
              const urls = [
                'http://www.google.com',
              ];
              setActiveCategoriesFromOffers(offersList);
              return simulateUrlEventsAndWait(urls).then(() => {
                // check that we could push the
                checkOfferPushed('o2');
                // sim again and we should show now the o1 offer
                eventMessages = [];
                shouldFilterOfferID = 'o2';
                setActiveCategoriesFromOffers(offersList);
                return simulateUrlEventsAndWait(urls).then(() => {
                  // check that we could push the
                  checkOfferPushed('o1');
                });
              });
            });
          });

          function prepareTriggerOffers(offersList) {
            const mockData = {
              backendResult: { 'intent-1': offersList },
            };
            configureMockData(mockData);
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));
          }

          function triggerOffers(offersList) {
            const urls = [
              'http://www.google.com',
            ];
            setActiveCategoriesFromOffers(offersList);
            return simulateUrlEventsAndWait(urls);
          }

          // This test actually checks selection by display priority
          it('/if offer of same campaign exists we replace and show that one', function () {
            const offersList = [
              buildOffer('o1', 'cid1', 'client1', 0.1),
              buildOffer('o2', 'cid1', 'client1', 0.9),
            ];
            prepareTriggerOffers(offersList);
            // wait for the fetch
            return waitForBEPromise()
              .then(() => triggerOffers(offersList))
              .then(() => {
                // check that we could push
                checkOfferPushed('o2');
                eventMessages = [];

                // we now should get again the same offer since it is stored on the DB
                return triggerOffers(offersList).then(() => {
                  //
                  checkOfferPushed('o2');
                });
              });
          });

          context('/some offer in DB is of the same campaign', () => {
            const campaignId = 'cid';
            const dboffer = buildOffer('oid', campaignId, 'client', 1);

            it('/drop a new offer variant ', () => {
              offersDB.addOfferObject(dboffer.offer_id, dboffer);
              const newCampaignOffer = buildOffer('onew', campaignId, 'client', 1);
              prepareTriggerOffers([newCampaignOffer]);
              return waitForBEPromise()

                .then(() => triggerOffers([newCampaignOffer]))

                .then(() => {
                  const newOfferInDb = offersDB.getOfferObject('onew');
                  chai.expect(newOfferInDb, 'Offer should not be added').is.null;
                });
            });

            it('/inherit ab-info', () => {
              const setAbInfo = function (offer, start, end) {
                offer.abTestInfo = { start, end };
              };
              setAbInfo(dboffer, 0, 10000);
              const offerId = dboffer.offer_id;
              offersDB.addOfferObject(offerId, dboffer);
              const updatingOffer = buildOffer(offerId, campaignId, dboffer.client_id, 1);
              setAbInfo(updatingOffer, -100, -50);
              updatingOffer.ui_info.template_data.desc = 'Updated description';
              updatingOffer.version = 'new-version';
              prepareTriggerOffers([updatingOffer]);
              return waitForBEPromise()

                .then(() => triggerOffers([updatingOffer]))

                .then(() => {
                  const updatedOffer = offersDB.getOfferObject(offerId);
                  chai.expect(updatedOffer.abTestInfo).to.eql({
                    start: 0, end: 10000
                  });
                  chai.expect(updatedOffer.ui_info.template_data.desc)
                    .to.be.equal('Updated description');
                });
            });
          });

          it('/offers that fail when trying to update are discarded', function () {
            const goodOffer = buildOffer('o1', 'cid1', 'client1', 0.9);
            // clone the offer but update the version
            const clonedOffer = cloneObject(goodOffer);
            clonedOffer.version = 'other';
            // NOTE THAT WE NOW SUPPORT MIGRATION OF display id
            clonedOffer.campaign_id = 'wrong-cid-id';

            // add the good offer to the DB
            updateOfferOnDB(goodOffer);

            const mockData = {
              backendResult: { 'intent-1': [clonedOffer] },
            };
            configureMockData(mockData);

            // activate intents
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));

            // wait for the fetch
            return waitForBEPromise().then(() => {
              const urls = [
                'http://www.google.com',
              ];
              setActiveCategoriesFromOffers([clonedOffer]);
              return simulateUrlEventsAndWait(urls).then(() => {
                // we should check no offers were push since its invalid one
                checkZeroOfferPushed();
              });
            });
          });

          it('/blacklist works', function () {
            const offersList = [
              buildOffer('o1', 'cid1', 'client1', 0.1),
            ];
            offersList[0].blackListPatterns = ['||google.de'];
            const mockData = {
              backendResult: { 'intent-1': offersList },
            };
            configureMockData(mockData);

            // activate intents
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));

            // wait for the fetch
            return waitForBEPromise().then(() => {
              const urls = [
                'http://www.google.de',
              ];
              setActiveCategoriesFromOffers(offersList);
              return simulateUrlEventsAndWait(urls).then(() => {
                // none of the offers should be pushed
                checkZeroOfferPushed();

                // now we should push again and with anything except google.de and
                // should work
                urls[0] = 'http://www.amazon.de';
                eventMessages = [];
                setActiveCategoriesFromOffers(offersList);
                return simulateUrlEventsAndWait(urls).then(() => {
                  // check that we could push the
                  checkOfferPushed('o1');
                });
              });
            });
          });

          it('/blacklist works and keeps the offer on the list', function () {
            const offersList = [
              buildOffer('o1', 'cid1', 'client1', 0.1),
              buildOffer('o2', 'cid2', 'client2', 0.2),
            ];
            offersList[0].blackListPatterns = ['||google.de'];
            offersList[1].blackListPatterns = ['||yahoo.de'];
            const mockData = {
              backendResult: { 'intent-1': offersList },
            };
            configureMockData(mockData);

            // activate intents
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));

            // wait for the fetch
            return waitForBEPromise().then(() => {
              const urls = [
                'http://www.yahoo.de',
              ];
              setActiveCategoriesFromOffers(offersList);
              return simulateUrlEventsAndWait(urls).then(() => {
                checkOfferPushed('o1');

                // now we should push again and with google.de and should work
                urls[0] = 'http://www.amazon.de';
                eventMessages = [];
                setActiveCategoriesFromOffers(offersList);
                return simulateUrlEventsAndWait(urls).then(() => {
                  // check that we could push the
                  checkOfferPushed('o2');

                  // now we should push again and with google.de and should work
                  urls[0] = 'http://www.focus.de';
                  eventMessages = [];
                  setActiveCategoriesFromOffers(offersList);
                  return simulateUrlEventsAndWait(urls).then(() => {
                    // check that we could push the
                    checkOfferPushed('o2');
                  });
                });
              });
            });
          });

          it('/we can show the same offer multiple times if no filter happens', function () {
            const offersList = [
              buildOffer('o1', 'cid1', 'client1', 0.1),
              buildOffer('o2', 'cid2', 'client2', 0.9),
            ];
            const mockData = {
              backendResult: { 'intent-1': offersList },
            };
            configureMockData(mockData);

            // activate intents
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));

            // wait for the fetch
            return waitForBEPromise().then(() => {
              const urls = [
                'http://www.google.com',
              ];
              setActiveCategoriesFromOffers(offersList);
              return simulateUrlEventsAndWait(urls).then(() => {
                // check that we could push the
                checkOfferPushed('o2');
                // sim again and we should show now the o1 offer
                eventMessages = [];
                // again
                setActiveCategoriesFromOffers(offersList);
                return simulateUrlEventsAndWait(urls).then(() => {
                  checkOfferPushed('o2');
                  eventMessages = [];

                  // and again
                  setActiveCategoriesFromOffers(offersList);
                  return simulateUrlEventsAndWait(urls).then(() => {
                    // check that we could push the
                    checkOfferPushed('o2');
                  });
                });
              });
            });
          });

          it('/context filters works for offers categories not activated recently', function () {
            const offersList = [
              buildOffer('o1', 'cid1', 'client1', 0.1),
              buildOffer('o2', 'cid2', 'client2', 0.9),
              buildOffer('o3', 'cid3', 'client3', 1.0),
            ];
            // set cat1, cat2, cat3 respectively
            offersList[0].categories = ['cat1'];
            offersList[1].categories = ['cat2'];
            offersList[2].categories = ['cat3'];

            const mockData = {
              backendResult: { 'intent-1': offersList },
            };
            configureMockData(mockData);

            // activate intents
            const intents = [
              { name: 'intent-1', active: true },
            ];
            intents.forEach(i => intentHandlerMock.activateIntentMock(i));

            // wait for the fetch
            return waitForBEPromise().then(() => {
              const urls = [
                'http://www.google.com',
              ];
              // activate only categories of offer 1 and 2 only
              let activeCatsOffers = [
                offersList[0],
                offersList[1],
              ];
              setActiveCategoriesFromOffers(activeCatsOffers);

              return simulateUrlEventsAndWait(urls).then(() => {
                // check that we could push the
                checkOfferPushed('o2');
                // sim again and we should show now the o1 offer
                eventMessages = [];
                // activate now 1 and 3
                activeCatsOffers = [
                  offersList[0],
                  offersList[2],
                ];
                setActiveCategoriesFromOffers(activeCatsOffers);
                return simulateUrlEventsAndWait(urls).then(() => {
                  checkOfferPushed('o3');
                  eventMessages = [];

                  // activate now 1 only
                  activeCatsOffers = [
                    offersList[0],
                  ];
                  setActiveCategoriesFromOffers(activeCatsOffers);
                  return simulateUrlEventsAndWait(urls).then(() => {
                    // check that we could push the
                    checkOfferPushed('o1');
                  });
                });
              });
            });
          });
        });
      });
    });
  },
);
