import CliqzUtils from '../core/utils';
import prefs from '../core/prefs';
import ProxyFilterBase from '../platform/proxy-filter';
import { getRandomIntInclusive } from './utils';
import CliqzSecureMessage from './main';
import console from '../core/console';
/*
Picked up from unblock proxy.es
*/

export default class ProxyFilter extends ProxyFilterBase {
  /**
  * Wrapper for rule-based url proxying: implementation for Firefox
  * @class Proxy
  * @namespace unblock
  * @constructor
  */
  constructor() {
    super();
    this.method = 'socks';
    this.port = 9004;
  }

  shouldProxy(url) {
    const window = CliqzUtils.getWindow();
    return (url.scheme === 'https') &&
      (CliqzSecureMessage.servicesToProxy.indexOf(url.host) > -1) &&
      (
        prefs.get('hpn-query', false) ||
        CliqzUtils.isPrivateMode(window)
      );
  }

  proxy() {
    if (!CliqzSecureMessage.proxyList) {
      return undefined;
    }
    const proxyIdx = getRandomIntInclusive(0, CliqzSecureMessage.proxyList.length - 1);
    const proxyHost = CliqzSecureMessage.proxyList[proxyIdx].dns;
    if (CliqzSecureMessage.debug) {
      console.log(`Proxying Query: ${proxyHost}`, CliqzSecureMessage.LOG_KEY);
    }

    if (CliqzSecureMessage.proxyInfoObj[proxyHost]) {
      return CliqzSecureMessage.proxyInfoObj[proxyHost];
    }
    const ob = this.newProxy({
      type: this.method,
      host: proxyHost,
      port: this.port,
      failoverTimeout: 1000,
      failoverProxy: null
    });
    CliqzSecureMessage.proxyInfoObj[proxyHost] = ob;
    return ob;
  }
}
