import Rx from '../../platform/lib/rxjs';
import events from '../../core/events';
import { URLInfo } from '../../core/url-info';

/**
 * Takes an observable and returns a new observable which emits a event in the group (extracted
 * by groupExtractor) if there has not been an event in this group for timeout ms.
 * @param observable
 * @param groupExtractor
 * @param timeout
 * @returns {Observable} group timeouts
 */
function timedOutStream(observable, groupExtractor, timeout) {
  return observable
    .groupBy(groupExtractor)
    .flatMap(group => group.debounceTime(timeout));
}

/**
 * Takes an observable and functions to get keys and values, and emits a state translator function
 * which merges the the extracted key and value from the event into a persistant state.
 * @param observable
 * @param keyExtractor
 * @param valueExtractor
 * @returns {Observable} state map
 */
function objectStreamToMap(observable, keyExtractor, valueExtractor) {
  return observable.map(value => state =>
    Object.assign({}, state, { [keyExtractor(value)]: valueExtractor(value) })
  );
}

/**
 * Inverse operation to {objectStreamToMap}: Removes elements from the state when the observable
 * emits
 * @param observable
 * @param keyExtractor
 * @returns {Observable}
 */
function deleteMapEntriesFromStream(observable, keyExtractor) {
  return observable.map(value => (state) => {
    const nextState = Object.assign({}, state);
    delete nextState[keyExtractor(value)];
    return nextState;
  });
}

/**
 * Takes an {Observable} and emits a state using the key and value extractors. Keys are timed out
 * if they are not emitted in the last {timeout} ms.
 * @param observable
 * @param keyExtractor
 * @param valueExtractor
 * @param timeout
 */
function objectStreamToMapWithTimeout(observable, keyExtractor, valueExtractor, timeout) {
  return Rx.Observable.merge(
    objectStreamToMap(observable, keyExtractor, valueExtractor),
    deleteMapEntriesFromStream(timedOutStream(observable, keyExtractor, timeout), keyExtractor),
  ).scan((state, changeFn) => changeFn(state), {});
}

const DEFAULT_OPTIONS = {
  CLICK_TIMEOUT: 300000,
  VISIT_TIMEOUT: 240000
};

export default class OAuthDetector {
  constructor(options = DEFAULT_OPTIONS) {
    this.clickActivity = {};
    this.siteActivitiy = {};
    this.subjectMainFrames = new Rx.Subject();
    Object.assign(this, DEFAULT_OPTIONS, options);
  }

  init() {
    // observe core:mouse-down events and emit tab information
    const tabClicks = Rx.Observable.fromEventPattern(
      handler => events.sub('core:mouse-down', handler),
      handler => events.un_sub('core:mouse-down', handler),
      (...args) => {
        const [ev, contextHTML, href, sender] = args;
        return { ev, contextHTML, href, sender };
      }
    ).map(({ sender }) => sender.tab);

    // generate a mapping of tabId: url for each tab which had a click in it
    // within the last CLICK_TIMEOUT minutes
    this.tabActivitySubscription = objectStreamToMapWithTimeout(
      tabClicks,
      value => value.id,
      value => value.url,
      this.CLICK_TIMEOUT
    ).subscribe((value) => {
      this.clickActivity = value;
    });

    // observe pages loaded for the last VISIT_TIMEOUT ms.
    const pagesOpened = this.subjectMainFrames.observeOn(Rx.Scheduler.async)
      .map(details => ({ tabId: details.tabId, hostname: details.urlParts.hostname }));

    this.pageOpenedSubscription = objectStreamToMapWithTimeout(
      pagesOpened,
      value => value.hostname,
      value => value.tabId,
      this.VISIT_TIMEOUT
    ).subscribe((value) => {
      this.siteActivitiy = value;
    });
  }

  unload() {
    if (this.tabActivitySubscription) {
      this.tabActivitySubscription.unsubscribe();
    }
    if (this.pageOpenedSubscription) {
      this.pageOpenedSubscription.unsubscribe();
    }
  }

  checkMainFrames(state) {
    if (state.isFullPage()) {
      this.subjectMainFrames.next(state);
    }
  }

  /**
   * Pipeline step to check if this request is part of a OAuth flow. This is done by
   * checking that the following three conditions are met:
   *  - The third-party url path contains '/oauth'
   *  - The user has recently clicked in the source tab (i.e. the site wanting to authenticate the
   * user)
   *  - The user has recently visited the oauth domain (the authentication provider)
   * @param state
   * @returns false if the request is an oauth request, true otherwise
   */
  checkIsOAuth(state) {
    if (state.urlParts.path.indexOf('/oauth') > -1 &&
      this.clickActivity[state.tabId] && this.siteActivitiy[state.urlParts.hostname]) {
      const clickedPage = URLInfo.get(this.clickActivity[state.tabId]);
      if (clickedPage !== null && clickedPage.hostname === state.sourceUrlParts.hostname) {
        state.incrementStat('cookie_allow_oauth');
        return false;
      }
    }
    return true;
  }
}
