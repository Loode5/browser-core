import Spanan from 'spanan';
import inject from '../core/kord/inject';
import background from '../core/base/background';
import omniboxapi from '../platform/omnibox/omnibox';
import BaseDropdownManager from '../core/dropdown/base';
import copyToClipboard from '../platform/clipboard';
import { getMessage } from '../core/i18n';
import HistoryManager from '../core/history-manager';
import { cleanMozillaActions } from '../core/url';
import OffersReporter from '../dropdown/telemetry/offers';
import prefs from '../core/prefs';
import utils from '../core/utils';
import events from '../core/events';
import { getTab, getCurrentTabId } from '../platform/tabs';

class AMODropdownManager extends BaseDropdownManager {
  constructor({ cliqz, urlbarDetails }) {
    super();
    this._cliqz = cliqz;
    this._cache = {
      urlbar: urlbarDetails,
      dropdown: {
        height: 0,
        opened: false,
      },
    };
    this._shouldIgnoreNextBlur = false;
    this._sessionId = 0;
  }

  get _urlbarDetails() {
    if (!this._cache.urlbar) {
      this._cache.urlbar = {};
    }
    return this._cache.urlbar;
  }

  get _dropdownDetails() {
    if (!this._cache.dropdown) {
      this._cache.dropdown = {};
    }
    return this._cache.dropdown;
  }

  _getSessionId() {
    return this._sessionId;
  }

  _incrementSessionId() {
    this._sessionId = (this._sessionId + 1) % 1e3;
  }

  _endSession() {
    this._incrementSessionId();
    this._cliqz.search.action('resetAssistantStates');
  }

  updateURLBarCache(details) {
    Object.keys(details).forEach((name) => {
      if (typeof details[name] !== 'undefined') {
        this._cache.urlbar[name] = details[name];
      }
    });
  }

  _setURLBarDetails(details) {
    this.updateURLBarCache(details);
    omniboxapi.update(details);
  }

  _setDropdownDetails({ height, opened }) {
    if (typeof height === 'number') {
      this._dropdownDetails.height = height;
      omniboxapi.setHeight(height);
    }
    if (typeof opened === 'boolean') {
      this._dropdownDetails.opened = opened;
      omniboxapi[opened ? 'open' : 'close']();
    }
  }

  _telemetry(...args) {
    return utils.telemetry(...args);
  }

  _reportHighlight(result) {
    this._cliqz.search.action('reportHighlight', result);
  }

  _adultAction(actionName) {
    return this._cliqz.search.action('adultAction', actionName)
      .then(() => {
        this.render({ rawResults: this.previousResults });
      });
  }

  _locationAction(actionName, query, rawResult) {
    return this._cliqz.search.action('locationAction', actionName, query, rawResult);
  }

  _copyToClipboard(val) {
    return copyToClipboard(val);
  }

  async _openLink(url,
    {
      newTab,
      eventType,
      result,
      resultOrder,
      meta = {},
    },
  ) {
    let href = url;

    if (newTab) {
      const [action, originalUrl] = cleanMozillaActions(href);
      if (action === 'switchtab') {
        href = originalUrl;
      }
    }

    let value;
    let selectionStart;
    let selectionEnd;

    if (newTab) {
      value = this._urlbarDetails.value;
      selectionStart = this._urlbarDetails.selectionStart;
      selectionEnd = this._urlbarDetails.selectionEnd;

      // setting the flag to ignore the next blur event
      this._shouldIgnoreNextBlur = true;
    }

    await omniboxapi.update({ value: href });
    await omniboxapi.enter(newTab);
    if (newTab) {
      await omniboxapi.update({
        value,
        selectionStart,
        selectionEnd,
      });
      await omniboxapi.focus();
      this._shouldIgnoreNextBlur = false;
    } else {
      omniboxapi.close();
    }

    const { windowId } = this._urlbarDetails;
    const tabId = await getCurrentTabId();
    const tab = await getTab(tabId);

    events.pub('ui:click-on-url', {
      url: href,
      query: result.query,
      rawResult: result,
      resultOrder,
      isNewTab: Boolean(newTab),
      isPrivateMode: tab.incognito,
      isPrivateResult: utils.isPrivateResultType(result.kind),
      isFromAutocompletedURL: this.hasAutocompleted && eventType === 'keyboard',
      windowId,
      tabId,
      action: eventType === 'keyboard' ? 'enter' : 'click',
      elementName: meta.elementName,
    });
  }

  _focus() {
    return omniboxapi.focus();
  }

  _setUrlbarValue(value) {
    this._setURLBarDetails({ value });
  }

  _getUrlbarValue() {
    return this._urlbarDetails.value;
  }

  _setSelectionRange(selectionStart, selectionEnd) {
    this._setURLBarDetails({ selectionStart, selectionEnd });
  }

  _getSelectionRange() {
    const { selectionStart, selectionEnd } = this._urlbarDetails;
    return { selectionStart, selectionEnd };
  }

  _getHeight() {
    return this._dropdownDetails.height;
  }

  _setHeight(height) {
    this._setDropdownDetails({ height });
    if (height) {
      omniboxapi.open();
    } else {
      omniboxapi.close();
    }
  }

  _queryCliqz(_query, { allowEmptyQuery } = { allowEmptyQuery: false }) {
    const query = _query || this._getQuery();
    const { windowId, isPasted } = this._urlbarDetails;
    if (query || allowEmptyQuery) {
      this._cliqz.search.action('startSearch', query, {
        allowEmptyQuery,
        isPasted,
        // isPrivate: false, // TODO
        isTyped: true,
        keyCode: this.lastEvent && this.lastEvent.code,
      }, {
        contextId: windowId
      });
    } else {
      this.setHeight(0);
    }
  }

  _removeFromHistory(...args) {
    return HistoryManager.removeFromHistory(...args);
  }
  _removeFromBookmarks(...args) {
    return HistoryManager.removeFromBookmarks(...args);
  }

  _closeTabsWithUrl() { /* TODO */ }

  _getQuery() {
    const query = this._urlbarDetails.value;
    if (this.hasCompletion) {
      return query.slice(0, this._urlbarDetails.selectionStart);
    }
    return query;
  }
  _getAssistantStates() {
    return this._cliqz.search.action('getAssistantStates');
  }
  _getUrlbarAttributes() {
    const { padding, left, width, navbarColor } = this._urlbarDetails;
    return { padding, left, width, navbarColor };
  }
  _getMaxHeight() {
    // TODO
    return 1e4;
  }

  onInput(details) {
    this.updateURLBarCache(details);
    if (details.isPasted) {
      this._telemetry({
        type: 'activity',
        action: 'paste',
        current_length: details.value.length,
      });
    }
    return super.onInput();
  }

  onKeydown(ev) {
    this.lastEvent = ev;
    const defaultIsPrevented = ev.defaultPrevented;
    const defaultShouldBePrevented = super.onKeydown(ev);
    if (defaultIsPrevented && !defaultShouldBePrevented) {
      // We prevented default behavior for this event while we shouldn't have been.
      // Now we have to simulate default behavior.
      switch (ev.code) {
        case 'Delete':
        case 'Backspace': {
          const { selectionStart, selectionEnd, value } = this._urlbarDetails;
          let newValue = value;
          const cursorPos = selectionStart;
          // delete selection/last/current charachter
          if (selectionStart !== selectionEnd) {
            newValue = value.slice(0, selectionStart) + value.slice(selectionEnd, value.length);
          } else if (ev.code === 'Delete') {
            newValue = value.slice(0, selectionStart) +
              value.slice(selectionStart + 1, value.length);
          } else if (ev.code === 'Backspace') {
            newValue = value.slice(0, selectionStart - 1) +
              value.slice(selectionStart, value.length);
          }
          this._setURLBarDetails({
            value: newValue,
            selectionStart: cursorPos,
            selectionEnd: cursorPos
          });
          break;
        }
        case 'Enter':
        case 'NumpadEnter':
          if (!ev.altKey && !ev.metaKey && !ev.ctrlKey) {
            this._setHeight(0);
          }
          break;
        default:
          // console.warn('>>>>>>> This event was prevented, while shouldn\'t have been', ev);
          break;
      }
    }
    if (defaultShouldBePrevented && !defaultIsPrevented) {
      // console.warn('>>>>>>> This event should have been prevented but was not', ev);
    }
  }

  onBlur() {
    if (this._shouldIgnoreNextBlur) {
      this._shouldIgnoreNextBlur = false;
      return;
    }
    this._endSession();
    omniboxapi.close();
    this.dropdownAction.clear();
  }

  onDropmarker() {
    this._queryCliqz('', { allowEmptyQuery: true });
  }

  createIframeWrapper() {
    const iframeWrapper = new Spanan(({ action, ...rest }) => {
      omniboxapi.sendMessage({
        target: 'cliqz-dropdown',
        action,
        ...rest,
      });
    });

    this.iframeWrapper = iframeWrapper;

    omniboxapi.onMessage.addListener(this.onMessage);

    iframeWrapper.export(this.actions, {
      respond(response, request) {
        omniboxapi.sendMessage({
          type: 'response',
          uuid: request.uuid,
          response,
        });
      },
    });

    this.dropdownAction = iframeWrapper.createProxy();
  }
}

export default background({
  UPDATE_DATA_EVENTS: ['onInput', 'onKeydown', 'onFocus', 'onBlur', 'onDrop', 'onDropmarker'],

  core: inject.module('core'),
  search: inject.module('search'),
  history: inject.module('history'),
  offers: inject.module('offers-v2'),

  events: {
    'ui:click-on-url': async function onClick({ rawResult }) {
      if (!this.inOffersAB) {
        return;
      }

      if (
        this.currentResults &&
        (rawResult.text === this.currentResults[0].text)
      ) {
        await this.offersReporter.reportShows(this.currentResults);
      }

      this.offersReporter.reportClick(this.currentResults, rawResult);
    },

    'search:session-end': function onBlur() {
      if (
        !this.inOffersAB ||
        !this.currentResults
      ) {
        return;
      }

      this.offersReporter.reportShows(this.currentResults);
    },

    'search:results': function onResults(results) {
      this._dropdownManager.render({
        query: results.query,
        rawResults: results.results,
      });

      if (!this.inOffersAB) {
        return;
      }

      this.currentResults = results;
      this.offersReporter.registerResults(results);
    },
  },

  get inOffersAB() {
    return prefs.get('offers2UserEnabled', true);
  },

  _updateData(details) {
    this._dropdownManager.updateURLBarCache(details);
  },

  async init(settings) {
    await omniboxapi.override('modules/dropdown/dropdown.html');
    this._settings = settings;
    const urlbarDetails = await omniboxapi.get();
    this._dropdownManager = new AMODropdownManager({
      cliqz: {
        core: this.core,
        search: this.search,
      },
      urlbarDetails,
    });
    this._dropdownManager.createIframeWrapper();
    this.updateData = this._updateData.bind(this);

    this._placeholder = urlbarDetails.placeholder;
    omniboxapi.update({ placeholder: getMessage('freshtab_urlbar_placeholder') });

    this.UPDATE_DATA_EVENTS
      .forEach(eventName => omniboxapi[eventName].addListener(this.updateData));

    this._handlers = ['onInput', 'onKeydown', 'onBlur', 'onDropmarker'].reduce((h, eventName) => {
      h.set(eventName, this._dropdownManager[eventName].bind(this._dropdownManager));
      omniboxapi[eventName].addListener(h.get(eventName));
      return h;
    }, new Map());

    this.offersReporter = new OffersReporter(this.offers);
  },

  unload() {
    omniboxapi.restore();
    omniboxapi.update({ placeholder: this._placeholder });

    for (const [eventName, handler] of this._handlers) {
      omniboxapi[eventName].removeListener(handler);
    }

    this.UPDATE_DATA_EVENTS
      .forEach(eventName => omniboxapi[eventName].removeListener(this.updateData));

    if (omniboxapi.destroy) {
      omniboxapi.destroy();
    }
  }
});