import config from '../core/config';
import prefs from '../core/prefs';
import * as platform from '../core/platform';
import {
  setNewTabPage,
  resetNewTabPage,
  setHomePage,
  getHomePage,
  migrate,
  AboutCliqz,
} from '../platform/freshtab/new-tab-setting';

const NEW_TAB_URL = config.settings.NEW_TAB_URL;
const PREF_NEW_TAB_BUTTON_STATE = 'freshtab.state';
const PREF_HOME_PAGE_BACKUP = 'backup.homepage';

export default {

  get isActive() {
    if (platform.isCliqzBrowser) {
      return true;
    }

    return prefs.get(PREF_NEW_TAB_BUTTON_STATE, false);
  },

  startup() {
    if (this.isActive) {
      this.enableNewTabPage();
    }

    AboutCliqz.register();

    migrate();
  },

  shutdown() {
    resetNewTabPage();

    AboutCliqz.unregister();

    // save current homepage to backup
    if (this.isActive) {
      prefs.set(PREF_HOME_PAGE_BACKUP, getHomePage());
    }
  },

  enableNewTabPage() {
    AboutCliqz.register();
    setNewTabPage(NEW_TAB_URL);
  },

  enableHomePage() {
    const homePageBackup = prefs.get(PREF_HOME_PAGE_BACKUP);
    AboutCliqz.register();
    // If Home Page was already set once, we don't everwrite it again
    if (homePageBackup) {
      return;
    }

    const currentHomePage = getHomePage();

    prefs.set(PREF_HOME_PAGE_BACKUP, currentHomePage);
    prefs.set(PREF_NEW_TAB_BUTTON_STATE, true);

    setHomePage(NEW_TAB_URL);
  },


  /**
   * Rollback to browser original settings
   */
  rollback() {
    const homePageBackup = prefs.get(PREF_HOME_PAGE_BACKUP);
    const currentHomePage = getHomePage();

    AboutCliqz.unregister();

    if ((currentHomePage === NEW_TAB_URL) && homePageBackup) {
      setHomePage(homePageBackup);
    } else if (currentHomePage !== NEW_TAB_URL) {
      prefs.set(PREF_HOME_PAGE_BACKUP, currentHomePage);
    }

    resetNewTabPage();
  },

  setPersistentState(state) {
    prefs.set(PREF_NEW_TAB_BUTTON_STATE, state);
  }
};
