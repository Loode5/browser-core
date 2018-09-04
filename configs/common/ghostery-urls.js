/* please keep keys in this object sorted */
module.exports = {
  ANOLYSIS_BACKEND_URL: 'https://anolysis.privacy.cliqz.com', // anolysis/sources/backend-communication.es
  ANOLYSIS_STAGING_BACKEND_URL: 'https://anolysis.privacy.clyqz.com', // anolysis/sources/backend-communication.es
  BACKGROUND_IMAGE_URL: 'https://cdn.cliqz.com/brands-database/database/', // core/sources/utils.es
  BW_URL: 'https://antiphishing.cliqz.com/api/bwlist?md5=', // anti-phishing/sources/anti-phishing.es
  CAMPAIGN_SERVER: 'https://fec.cliqz.com/message/', // campaign-manager/sources/campaign-manager.es
  CDN_BASEURL: 'https://cdn.cliqz.com',
  CLIQZ_SAVE_URL: 'https://cliqz.com/q=', // core/sources/utils.es (Need to find a more suitable name for this.)
  CONFIG_PROVIDER: 'https://api.ghostery.net/api/v1/config',
  ENDPOINT_ANONPATTERNSURL: 'https://cdn.cliqz.com/human-web/patterns-anon',
  ENDPOINT_BLIND_SIGNER: 'https://hpn-sign.cliqz.com/sign',
  ENDPOINT_CONFIGURL: 'https://safe-browsing.cliqz.com/config',
  ENDPOINT_HPNV2_COLLECTOR: 'https://collector-hpn.cliqz.com',
  ENDPOINT_HPNV2_CONFIG: 'https://collector-hpn.cliqz.com/config',
  ENDPOINT_HPNV2_JOIN: 'https://collector-hpn.cliqz.com/join',
  ENDPOINT_KEYS_PROVIDER: 'https://hpn-collector.cliqz.com/signerKey?q=1',
  ENDPOINT_LOOKUP_TABLE_PROVIDER: 'https://hpn-collector.cliqz.com/v2/lookuptable?q=1',
  ENDPOINT_PATTERNSURL: 'https://cdn.cliqz.com/human-web/patterns',
  ENDPOINT_SAFE_QUORUM_ENDPOINT: 'https://safe-browsing-quorum.cliqz.com/',
  ENDPOINT_SAFE_QUORUM_PROVIDER: 'https://safe-browsing-quorum.cliqz.com/config',
  ENDPOINT_SOURCE_MAP_PROVIDER: 'https://hpn-collector.cliqz.com/sourcemapjson?q=1',
  ENDPOINT_URL: 'https://api.ghostery.net/api/v1/rich-header?path=/map&bmresult=', // autocomplete/sources/smart-cliqz-cache/rich-header.es
  ENDPOINT_USER_REG: 'https://hpn-sign.cliqz.com/register',
  FEEDBACK: 'https://cliqz.com/feedback/', // core/sources/utils.es
  HB_NEWS: 'hb-news.cliqz.com', // freshtab/sources/news.es, history/sources/rich-header-proxy.es
  HOMPAGE_URL: 'https://cliqz.com/', // autocomplete/sources/result-providers.es, history/sources/history-dto.es (Need to check for trailing slash)
  INVENTORY_URL: 'https://cdn.cliqz.com/browser-f/fun-demo/inventoryv2.txt.gz', // green-ads/sources/inventory.es
  JOBS_URL: 'https://cliqz.com/jobs/', // autocomplete/sources/result-providers.es
  OFFERS_BE_BASE_URL: 'https://offers-api.cliqz.com',
  PRIVACY_SCORE_URL: 'https://anti-tracking.cliqz.com/api/v1/score?', // antitracking/sources/privacy-score.es
  RESULTS_PROVIDER: 'https://api.ghostery.net/api/v2/results?nrh=1&q=', // core/config.es
  RESULTS_PROVIDER_LOG: 'https://api.ghostery.net/api/v1/logging?q=', // core/config.es
  RESULTS_PROVIDER_PING: 'https://api.ghostery.net/ping', // core/config.es
  RICH_HEADER: 'https://api.ghostery.net/api/v2/rich-header?path=/v2/map',
  RICH_HEADER_PROXY_URL: 'hb-news.cliqz.com',
  ROTATED_TOP_NEWS: 'rotated-top-news.cliqz.com', // freshtab/sources/news.es
  SAFE_BROWSING: 'https://safe-browsing.cliqz.com', // core/sources/utils.es
  STATISTICS: 'https://stats.cliqz.com', // core/sources/utils.es
  SUGGESTIONS_URL: 'https://cliqz.com/search?q=', // dropdown/sources/results/suggestions.es, freshtab/sources/background.es, history/sources/background.es, history/sources/content.es
  SUPPORT_URL: 'https://cliqz.com/support/', // autocomplete/sources/result-providers.es
  TEAM_URL: 'https://cliqz.com/team/', // autocomplete/sources/result-providers.es
  TELEMETRY_ENDPOINT: 'https://safebrowsing-experiment.cliqz.com', // green-ads/sources/background.es
  TRACKER_PROXY_PROXY_PEERS_DEFAULT: 'https://p2p-signaling-proxypeer.cliqz.com/peers', // tracker-proxy.es
  TRACKER_PROXY_PROXY_PEERS_EXIT_DEFAULT: 'https://p2p-signaling-proxypeer.cliqz.com/exitNodes', // tracker-proxy.es
  TRACKER_PROXY_PROXY_SIGNALING_DEFAULT: 'wss://p2p-signaling-proxypeer.cliqz.com', // tracker-proxy.es
  TRIQZ_URL: 'https://cliqz.com/tips', // control-center/sources/window.es
  UNINSTALL: 'https://cliqz.com/home/offboarding', // core/sources/utils.es
};
