import {
  app,
  blurUrlBar,
  $cliqzResults,
  expect,
  fillIn,
  respondWith,
  waitForPopup,
  withHistory } from './helpers';

export default function () {
  const results = [];

  describe('default search engine tests', function () {
    const searchEnginesEn = ['Google', 'Bing', 'Wikipedia (en)',
      'Amazon.com', 'DuckDuckGo', 'Twitter', 'Google Maps', 'Google Images', 'YouTube', 'Start Page', 'Ecosia'];
    searchEnginesEn.forEach(function (engine) {
      context(`Search with ${engine}`, function () {
        let $resultElement;

        before(function () {
          blurUrlBar();
          app.modules.search.action('setDefaultSearchEngine', engine);
          respondWith({ results });
          withHistory([]);
          fillIn('test');
          return waitForPopup().then(function () {
            $resultElement = $cliqzResults()[0];
          });
        });

        after(function () {
          app.modules.search.action('setDefaultSearchEngine', 'Google');
        });

        it('renders result', function () {
          const resultSelector = '.result.search';
          expect($resultElement).to.contain(resultSelector);
        });

        it('renders search icon', function () {
          const iconSelector = '.result .icon.search';
          expect($resultElement).to.contain(iconSelector);
        });

        it('renders query', function () {
          const querySelector = '.result .abstract .strong';
          expect($resultElement).to.contain(querySelector);
          expect($resultElement.querySelector(querySelector).textContent.trim()).to.equal('test');
        });

        it('renders divider', function () {
          const dividerSelector = '.result .abstract .divider';
          expect($resultElement).to.contain(dividerSelector);
          expect($resultElement.querySelector(dividerSelector).textContent.trim()).to.equal('—');
        });

        it(`renders "Search with ${engine}"`, function () {
          const googleSelector = '.result.search .abstract .url';
          expect($resultElement).to.contain(googleSelector);
          expect($resultElement.querySelector(googleSelector).textContent.trim())
            .to.equal(`Search with ${engine}`);
        });
      });
    });
  });
}
