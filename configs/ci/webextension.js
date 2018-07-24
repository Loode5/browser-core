const webextensionBase = require('../webextension');

module.exports = Object.assign({}, webextensionBase, {
  settings: Object.assign({}, webextensionBase.settings, {
    channel: '99',
  }),
  modules: webextensionBase.modules.concat('chromium-tests'),
  default_prefs: {
    showConsoleLogs: true,
  },
  bundles: webextensionBase.bundles.concat([
    'chromium-tests/antitracking-attrack.bundle.js',
    'chromium-tests/antitracking-bloomfilter.bundle.js',
    'chromium-tests/antitracking-qswhitelist.bundle.js',
    'chromium-tests/antitracking-test.bundle.js',
    // 'chromium-tests/core-utils.bundle.js',
    'chromium-tests/run.bundle.js',
    'chromium-tests/webrequest-leak.bundle.js',
    'chromium-tests/webrequest-page.bundle.js',
    'chromium-tests/webrequest-test.bundle.js',
    'core/integration-tests.bundle.js',
  ]),
});
