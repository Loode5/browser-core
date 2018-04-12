import Handlebars from 'handlebars';
import templates from './templates';
import UI from './ui';
import helpers from './helpers';
import { addStylesheet, removeStylesheet } from '../core/helpers/stylesheet';
import AppWindow from '../core/base/window';

const STYLESHEET_URL = 'chrome://cliqz/content/dropdown/styles/styles.css';

export default class DropdownWindow extends AppWindow {
  events = {
    'content:location-change': () => {
      this.ui.sessionEnd();
    },

    'search:results': ({ windowId, results }) => {
      if (this.windowId !== windowId) {
        return;
      }

      if (!this.isReady) {
        return;
      }

      const query = this.window.gURLBar.mController.searchString.trim();

      this.ui.render({
        rawResults: results,
        queriedAt: Date.now(),
        query,
      });
    },
  };

  actions = {
    init: () => {
      this.ui.handleResults = () => { };
      this.isReady = true;
      this.window.CLIQZ.UI = this.ui;
      this.ui.init();
    }
  };

  constructor(config) {
    super(config);
    this.background = config.background;
    this.settings = config.settings;
    this.ui = new UI(this.window, this.settings.id, {
      window: this.window,
      windowId: this.windowId,
      extensionID: this.settings.id,
      getSessionCount: this.background.getSessionCount.bind(this.background),
    });
    this.isReady = false;
  }

  init() {
    super.init();
    Handlebars.partials = Object.assign({}, Handlebars.partials, templates);
    addStylesheet(this.window.document, STYLESHEET_URL);

    Object.keys(helpers).forEach(
      helperName => Handlebars.registerHelper(helperName, helpers[helperName])
    );
  }

  unload() {
    super.unload();
    delete this.window.CLIQZ.UI;
    removeStylesheet(this.window.document, STYLESHEET_URL);
    this.ui.unload();
  }
}
