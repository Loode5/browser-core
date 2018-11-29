import inject from '../core/kord/inject';
import utils from '../core/utils';
import prefs from '../core/prefs';
import { forEachWindow } from '../platform/browser';
import config from '../core/config';

export default class Win {
  constructor({ window, settings }) {
    this.settings = settings;
    this.window = window;
    this.coreCliqz = inject.module('core-cliqz');

    // in case the extension runs in the Cliqz browser we could get fake uninstall
    // signals from the system addon updater so we must remove any offboarding page
    // see https://bugzilla.mozilla.org/show_bug.cgi?id=1351617
    if (settings.channel === '40') {
      const offboardingURL = [
        'https://cliqz.com/home/offboarding', // == config.settings.UNINSTALL
        'https://cliqz.com/offboarding',
        'https://cliqz.com/en/offboarding',
        'https://cliqz.com/fr/offboarding'
      ];
      forEachWindow((win) => {
        win.gBrowser.tabs.forEach((tab) => {
          if (offboardingURL.indexOf(tab.linkedBrowser.currentURI.spec) !== -1) {
            win.gBrowser.removeTab(tab);
          }
        });
      });
    }
  }

  init() {}

  unload() {}

  disable() {
    const version = this.settings.version;
    const window = this.window;
    if (window === utils.getWindow()) {
      this.coreCliqz.action('setSupportInfo', 'disabled');
      try {
        const UNINSTALL_PREF = 'uninstallVersion';
        const lastUninstallVersion = prefs.get(UNINSTALL_PREF, '');

        if (version && (lastUninstallVersion !== version)) {
          prefs.set(UNINSTALL_PREF, version);
          utils.openLink(
            window,
            config.settings.UNINSTALL,
            true, // newTab
            false, // newWindow
            false, // newPrivateWindow
            true // focus
          );
        }
      } catch (e) {
        // Nothing
      }
    }
  }
}
