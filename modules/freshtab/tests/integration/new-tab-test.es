import {
  expect,
  getResourceUrl,
  newTab,
  queryHTML,
  waitFor,
  waitForElement,
} from '../../../tests/core/integration/helpers';
import { isBootstrap } from '../../../core/platform';

export default function () {
  const url = getResourceUrl('freshtab/home.html');
  if (isBootstrap) {
    return;
  }

  context('Freshtab', function () {
    describe('opened in a new tab', function () {
      beforeEach(async function () {
        // Load freshtab in new tab
        await newTab(url, { focus: true });
        await waitForElement({ url, selector: '#section-most-visited .dial-header' });
      });

      it('renders successfully', async () => {
        const $mostVisitedHeader = await queryHTML(url, '#section-most-visited .dial-header', 'innerText');
        expect($mostVisitedHeader).to.have.length(1);

        await waitFor(async () => {
          const $search = await queryHTML(url, '.search', 'nodeName');
          return expect($search).to.have.length(1);
        });

        await waitFor(async () => {
          const $news = await queryHTML(url, '.news', 'nodeName');
          return expect($news).to.have.length(1);
        });
      });
    });
  });
}
