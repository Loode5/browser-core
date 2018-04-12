import {
  blurUrlBar,
  $cliqzResults,
  expect,
  fillIn,
  respondWith,
  waitForPopup,
  withHistory } from './helpers';
import results from './fixtures/resultsLottoKeno';

export default function () {
  context('for a Keno rich header', function () {
    let $resultElement;

    before(function () {
      blurUrlBar();
      respondWith({ results });
      withHistory([]);
      fillIn('keno');
      return waitForPopup().then(function () {
        $resultElement = $cliqzResults().find(`a.result[data-url='${results[0].url}']`)[0].parentNode;
      });
    });

    it('renders rich header result successfully', function () {
      expect($resultElement).to.exist;
    });

    describe('renders top element', function () {
      it('successfully', function () {
        const lottoTopSelector = 'a.result';
        expect($resultElement.querySelector(lottoTopSelector)).to.exist;
      });

      it('with existing and correct title', function () {
        const lottoTopTitleSelector = 'a.result div.abstract span.title';
        expect($resultElement.querySelector(lottoTopTitleSelector)).to.exist;
        expect($resultElement.querySelector(lottoTopTitleSelector))
          .to.have.text(results[0].snippet.title);
      });

      it('with existing and correct domain', function () {
        const lottoTopTitleSelector = 'a.result div.abstract span.url';
        expect($resultElement.querySelector(lottoTopTitleSelector)).to.exist;
        expect($resultElement.querySelector(lottoTopTitleSelector))
          .to.contain.text(results[0].snippet.friendlyUrl);
      });

      it('with existing logo', function () {
        const lottoTopLogoSelector = 'a.result div.icons span.logo';
        expect($resultElement.querySelector(lottoTopLogoSelector)).to.exist;
      });

      it('with a correct link', function () {
        const lottoTopLinkSelector = 'a.result';
        expect($resultElement.querySelector(lottoTopLinkSelector).dataset.url)
          .to.equal(results[0].url);
      });

      it('with existing and correct description', function () {
        const lottoTopDescSelector = 'a.result div.abstract span.description';
        expect($resultElement.querySelector(lottoTopDescSelector)).to.exist;
        expect($resultElement.querySelector(lottoTopDescSelector))
          .to.have.text(results[0].snippet.description);
      });
    });

    describe('renders buttons', function () {
      const buttonsAreaSelector = 'div.buttons';
      const buttonSelector = 'div.buttons a.btn';
      let buttonsArea;
      let buttonsItems;

      beforeEach(function () {
        buttonsArea = $resultElement.querySelector(buttonsAreaSelector);
        buttonsItems = $resultElement.querySelectorAll(buttonSelector);
      });

      it('successfully', function () {
        expect(buttonsArea).to.exist;
        [...buttonsItems].forEach(function (button) {
          expect(button).to.exist;
        });
      });

      it('correct amount', function () {
        expect(buttonsItems.length).to.equal(results[0].snippet.deepResults[0].links.length);
      });

      it('with correct text', function () {
        [...buttonsItems].forEach(function (button, i) {
          expect(button).to.contain.text(results[0].snippet.deepResults[0].links[i].title);
        });
      });

      it('with correct links', function () {
        [...buttonsItems].forEach(function (button, i) {
          expect(button.dataset.url).to.equal(results[0].snippet.deepResults[0].links[i].url);
        });
      });
    });

    describe('renders winning results block', function () {
      const lottoRowSelector = 'div.lotto div.row';
      const lottoElementSelector = 'div.item';
      let lottoItemsRows;
      let keno;

      beforeEach(function () {
        lottoItemsRows = $resultElement.querySelectorAll(lottoRowSelector);
      });

      it('successfully', function () {
        const lottoResultSelector = 'div.lotto';
        expect($resultElement.querySelector(lottoResultSelector)).to.exist;
      });

      it('with existing and correct heading', function () {
        const lottoResultHeadingSelector = 'div.lotto p.lotto-date';
        expect($resultElement.querySelector(lottoResultHeadingSelector)).to.exist;

        expect($resultElement.querySelector(lottoResultHeadingSelector))
          .to.contain.text('Gewinnzahlen');
        expect($resultElement.querySelector(lottoResultHeadingSelector))
          .to.contain.text('Mittwoch');
        expect($resultElement.querySelector(lottoResultHeadingSelector))
          .to.contain.text('26.7.2017');
      });

      it('with existing and correct disclaimer', function () {
        const lottoDisclaimerSelector = 'div.lotto p.no-guarantee';
        expect($resultElement.querySelector(lottoDisclaimerSelector)).to.exist;
        expect($resultElement.querySelector(lottoDisclaimerSelector))
          .to.have.text('Alle Angaben ohne Gewähr');
      });

      it('with existing winning results blocks and in correct amount', function () {
        [...lottoItemsRows].forEach(function (row) {
          expect(row).to.exist;
        });
        expect($resultElement.querySelectorAll(lottoRowSelector).length)
          .to.equal(3);
      });

      describe('with 1st row of Keno results', function () {
        let lottoKenoFirstHalf;

        beforeEach(function () {
          keno = lottoItemsRows[0];
          lottoKenoFirstHalf = keno.querySelectorAll(lottoElementSelector);
        });

        it('with existing elements', function () {
          [...lottoElementSelector].forEach(function (element) {
            expect(element).to.exist;
          });
        });

        it('with correct amount of elements', function () {
          expect(lottoKenoFirstHalf.length)
            .to.equal(results[0].snippet.extra.lotto_list.cur_date.keno.gewinnzahlen.length / 2);
        });

        it('with correct value of numerical elelements', function () {
          [...lottoKenoFirstHalf].forEach(function (element, i) {
            expect(element).to.contain.text(
              results[0].snippet.extra.lotto_list.cur_date.keno.gewinnzahlen[i]);
          });
        });
      });

      describe('with 2nd row of Keno results', function () {
        let lottoKenoSecondHalf;

        beforeEach(function () {
          keno = lottoItemsRows[1];
          lottoKenoSecondHalf = keno.querySelectorAll(lottoElementSelector);
        });

        it('with existing elements', function () {
          [...lottoElementSelector].forEach(function (element) {
            expect(element).to.exist;
          });
        });

        it('with correct amount of elements', function () {
          expect(lottoKenoSecondHalf.length)
            .to.equal(results[0].snippet.extra.lotto_list.cur_date.keno.gewinnzahlen.length / 2);
        });

        it('with correct value of numerical elelements', function () {
          [...lottoKenoSecondHalf].forEach(function (element, i) {
            expect(element).to.contain.text(
              results[0].snippet.extra.lotto_list.cur_date.keno.gewinnzahlen[i + 10]);
          });
        });
      });

      describe('with plus5 results', function () {
        let plus5;
        let lottoPlus5Elements;
        let lottoPlus5Numbers;
        let plus5Label;

        beforeEach(function () {
          plus5 = lottoItemsRows[2];
          lottoPlus5Elements = plus5.querySelectorAll(lottoElementSelector);
          lottoPlus5Numbers = [...lottoPlus5Elements].slice(1);
          plus5Label = lottoPlus5Elements[0];
        });

        it('with existing elements', function () {
          [...lottoElementSelector].forEach(function (element) {
            expect(element).to.exist;
          });
        });

        it('with correct amount of elements', function () {
          expect(lottoPlus5Elements.length)
            .to.equal(results[0].snippet.extra.lotto_list.cur_date.plus5.gewinnzahlen.length + 1);
        });

        it('with correct value of numerical elelements', function () {
          [...lottoPlus5Numbers].forEach(function (element, i) {
            expect(element).to.contain.text(
              results[0].snippet.extra.lotto_list.cur_date.plus5.gewinnzahlen[i]);
          });
        });

        it('with a correct label', function () {
          expect(plus5Label).to.contain.text('plus5');
        });
      });
    });
  });
}
