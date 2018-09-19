import { nextTick } from '../../core/decorators';
import EventManager from '../../core/event-manager';

/* global ChromeUtils, EventEmitter */
ChromeUtils.import('resource://gre/modules/EventEmitter.jsm');
const { Management: { global: { windowTracker } } } = ChromeUtils.import('resource://gre/modules/Extension.jsm', null);

export default class BrowserURLBar extends EventEmitter {
  constructor(dropdown) {
    super();
    this._dropdown = dropdown;
    this._events = [
      'input',
      'paste',
      'keydown',
      'keypress',
      'focus',
      'blur',
      'mouseup',
      'drop',
    ];
    this._windows = new Map();
    this._lastEvent = new WeakMap();
    this.onWindowOpened = this._onWindowOpened.bind(this);
    this.onWindowClosed = this._onWindowClosed.bind(this);
    windowTracker.addOpenListener(this.onWindowOpened);
    windowTracker.addCloseListener(this.onWindowClosed);
    for (const window of windowTracker.browserWindows()) {
      this.onWindowOpened(window);
    }
  }

  _getWindowId(window) {
    return windowTracker.getId(window);
  }

  _getWindow(windowId /* or window */) {
    let w = windowId;
    if (typeof windowId === 'number') {
      w = windowTracker.getWindow(windowId, null);
    } else if (windowId === null || windowId === undefined) {
      w = windowTracker.getCurrentWindow();
    }
    return w;
  }

  _getURLBarByWindowId(windowId) {
    return this._getWindow(windowId).gURLBar;
  }

  _getValue(window) {
    const w = this._getWindow(window);
    return w.gURLBar.value;
  }

  destroy() {
    windowTracker.removeCloseListener(this.onWindowClosed);
    windowTracker.removeOpenListener(this.onWindowOpened);
    for (const [window] of this._windows) {
      this._onWindowClosed(window);
    }
    this._windows.clear();
  }

  _onWindowOpened(window) {
    const urlbar = window.gURLBar;
    const windowEvents = this._events.reduce((o, eventName) => {
      o.set(eventName, event => this._handleEvent(event, window));
      urlbar.addEventListener(eventName, o.get(eventName));
      return o;
    }, new Map());
    this._windows.set(window, windowEvents);
  }

  _onWindowClosed(window) {
    const windowEvents = this._windows.get(window);
    if (!windowEvents) {
      return;
    }
    const urlbar = window.gURLBar;
    for (const [eventName, listener] of windowEvents) {
      urlbar.removeEventListener(eventName, listener);
    }
    this._windows.delete(window);
  }

  _getUrlbarEventDetails(event) {
    const properties = [
      'altKey',
      'code',
      'ctrlKey',
      'key',
      'metaKey',
      'shiftKey',
    ];
    return properties.reduce((memo, prop) => {
      memo[prop] = event[prop]; // eslint-disable-line
      return memo;
    }, {});
  }

  _onKeydown(event, dropdownState) {
    let preventDefault = false;
    const isDropdownOpen = dropdownState.height > 0;
    if (!isDropdownOpen) {
      if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
        // handler should reopen popup here
        return true;
      }
    }

    switch (event.code) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'Escape':
      case 'Enter':
      case 'NumpadEnter':
        preventDefault = true;
        break;
      case 'Tab':
        if (isDropdownOpen) {
          preventDefault = true;
        }
        break;
      case 'Delete':
      case 'Backspace':
        if (!event.shiftKey || event.metaKey || (event.altKey && event.ctrlKey)) {
          preventDefault = false;
          break;
        }
        preventDefault = true;
        break;
      default: {
        preventDefault = false;
      }
    }

    return preventDefault;
  }

  _handleEvent(event, window) {
    let preventDefault = false;
    switch (event.type) {
      case 'focus':
      case 'blur':
        this._lastEvent.delete(window);
        this.emit(event.type, window, this._getURLBarTextContent(window));
        break;
      case 'input':
        nextTick(() => {
          const urlbar = window.gURLBar;
          const ev = this._lastEvent.get(window);
          this.emit(event.type, window, {
            ...this._getURLBarTextContent(window),
            isTyped: urlbar.valueIsTyped,
            keyCode: (ev && ev.code) || null,
            isPasted: ev && (ev.type === 'paste'),
          });
        });
        break;
      case 'paste':
        this._lastEvent.set(window, event);
        break;
      case 'keydown':
        this._lastEvent.set(window, event);
        preventDefault = this._onKeydown(event, this._dropdown.getState(window));
        this.emit(event.type, window, {
          defaultPrevented: preventDefault,
          ...this._getUrlbarEventDetails(event),
          ...this._getURLBarDetails(window),
        });
        break;
      case 'mouseup':
        if (event.originalTarget.getAttribute('anonid') === 'historydropmarker') {
          this.emit('dropmarker', window, this._getURLBarTextContent(window));
        }
        break;
      case 'drop':
        this.emit('drop', event, {
          ...this._getURLBarTextContent(window),
          dataTransfer: {
            types: event.dataTransfer.types,
          },
        });
        break;
      case 'keypress': {
        if (event.ctrlKey || event.altKey || event.metaKey) {
          break;
        }
        const urlbar = window.gURLBar;
        const mInputField = urlbar.mInputField;
        const hasCompletion = mInputField.selectionEnd !== mInputField.selectionStart;
        if (
          hasCompletion &&
          mInputField.value[mInputField.selectionStart] === String.fromCharCode(event.charCode)
        ) {
          let query = urlbar.value;
          const queryWithCompletion = mInputField.value;
          const start = mInputField.selectionStart;
          query = query.slice(0, urlbar.selectionStart) + String.fromCharCode(event.charCode);

          // Prevent sending the new query
          event.preventDefault();

          // This reset mInput.value
          mInputField.setUserInput(query);

          // So it has to be restored to include completion
          mInputField.value = queryWithCompletion;

          // Update completion
          mInputField.setSelectionRange(start + 1, mInputField.value.length);
        }
        break;
      }
      default:
        break;
    }
    if (preventDefault) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  _getNavBarBackgroundColor(window) {
    // TODO cache and update on theme change
    const CHANNEL_TRESHOLD = 220;
    const toolbar = window.document.getElementById('nav-bar');
    const bgColor = window.getComputedStyle(toolbar)['background-color'];

    // Check if toolbar background color is light-grey-ish and non-transparent
    const [, r, g, b, a] = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?/) || ['', '0', '0', '0', '0'];
    if (r > CHANNEL_TRESHOLD &&
        g > CHANNEL_TRESHOLD &&
        b > CHANNEL_TRESHOLD &&
        (a === undefined || a >= 1)
    ) {
      return bgColor;
    }
    return null;
  }

  _getURLBarDetails(windowId) {
    // TODO cache and update on resize
    const window = this._getWindow(windowId);
    const urlbar = window.gURLBar;

    const urlbarRect = urlbar.getBoundingClientRect();
    const urlbarLeftPos = Math.round(urlbarRect.left || urlbarRect.x || 0);
    const urlbarWidth = urlbarRect.width;
    const extraPadding = 10;
    let contentPadding = extraPadding + urlbarLeftPos;

    // Reset padding when there is a big space on the left of the urlbar
    // or when the browser's window is too narrow
    // WARNING: magic numbers!
    if (contentPadding > 500 || window.innerWidth < 650) {
      contentPadding = 50;
    }

    return {
      ...this._getURLBarTextContent(windowId),
      padding: contentPadding,
      left: urlbarLeftPos,
      width: urlbarWidth,
      navbarColor: this._getNavBarBackgroundColor(window),
    };
  }

  _getURLBarTextContent(windowId) {
    const window = this._getWindow(windowId);
    const urlbar = window.gURLBar;

    return {
      value: urlbar.value,
      visibleValue: urlbar.mInputField.value,
      placeholder: urlbar.mInputField.placeholder,
      selectionStart: urlbar.selectionStart,
      selectionEnd: urlbar.selectionEnd,
      focused: urlbar.focused,
    };
  }

  _generateEventManager(eventName) {
    return new EventManager((callback) => {
      const listener = (_, window, details = {}) => {
        nextTick(callback({
          ...details,
          windowId: this._getWindowId(window),
        }));
      };
      this.on(eventName, listener);
      return () => {
        this.off(eventName, listener);
      };
    }).api();
  }

  getAPI() {
    return {
      enter: (windowId = null, newTab = false) => {
        const urlbar = this._getURLBarByWindowId(windowId);
        urlbar.handleCommand(null, newTab ? 'tabshifted' : 'current');
      },
      focus: (windowId = null) => {
        const urlbar = this._getURLBarByWindowId(windowId);
        urlbar.focus();
      },
      blur: (windowId = null) => {
        const urlbar = this._getURLBarByWindowId(windowId);
        urlbar.blur();
      },
      get: (windowId = null) => this._getURLBarDetails(windowId),
      update: (windowId = null, details) => {
        const urlbar = this._getURLBarByWindowId(windowId);
        if (details.placeholder !== null) {
          urlbar.mInputField.placeholder = details.placeholder;
        }
        if (details.value !== null) {
          urlbar.value = details.value;
        }
        if (details.visibleValue !== null) {
          urlbar.mInputField.value = details.visibleValue;
        }
        if (details.selectionStart !== null) {
          urlbar.selectionStart = details.selectionStart;
        }
        if (details.selectionEnd !== null) {
          urlbar.selectionEnd = details.selectionEnd;
        }
      },
      onInput: this._generateEventManager('input'),
      onKeydown: this._generateEventManager('keydown'),
      onFocus: this._generateEventManager('focus'),
      onBlur: this._generateEventManager('blur'),
      onDrop: this._generateEventManager('drop'),
      onDropmarker: this._generateEventManager('dropmarker'),
    };
  }
}