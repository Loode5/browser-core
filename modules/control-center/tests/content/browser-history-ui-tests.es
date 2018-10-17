import {
  expect,
  waitFor,
} from '../../core/test-helpers';
import Subject from './local-helpers';
import { dataOn, dataOff, dataAmo } from './fixtures/history-section';

describe('Control Center: History options browser', function () {
  let subject;
  const target = 'control-center';

  beforeEach(function () {
    subject = new Subject();
  });

  afterEach(function () {
    subject.unload();
  });

  function historySectionTests() {
    it('history section appeared', function () {
      expect(subject.query('.accordion #accordion-3.accordion-section-content.open')).to.exist;
    });

    it('renders "History options"', function () {
      const titleSelector = '#othersettings .accordion .accordion-section-title[href="#accordion-3"] [data-i18n="control_center_history_options"]';
      expect(subject.query(titleSelector)).to.exist;
      expect(subject.query(titleSelector).textContent.trim()).to.equal('control_center_history_options');
    });

    it('renders arrow for history options', function () {
      const arrowSelector = '#othersettings .accordion .accordion-section-title[href="#accordion-3"] #arrow';
      expect(subject.query(arrowSelector)).to.exist;
    });

    it('renders three options', function () {
      expect(subject.queryAll('.accordion #accordion-3 .bullet').length).to.equal(3);
    });

    it('renders "Show all history"', function () {
      const historySelector = '.accordion #accordion-3 .bullet [data-i18n="control_center_show_history"]';
      expect(subject.query(historySelector)).to.exist;
      expect(subject.query(historySelector).textContent.trim()).to.equal('control_center_show_history');
    });

    it('renders button "Open" for "Show all history"', function () {
      const buttonSelector = '.accordion #accordion-3 .bullet [data-open-url="history"]';
      expect(subject.query(buttonSelector)).to.exist;
      expect(subject.query(buttonSelector).textContent.trim()).to.equal('control_center_open');
    });

    it('renders "Forget history"', function () {
      const forgetSelector = '.accordion #accordion-3 .bullet [data-i18n="control_center_forget_history"]';
      expect(subject.query(forgetSelector)).to.exist;
      expect(subject.query(forgetSelector).textContent.trim()).to.equal('control_center_forget_history');
    });

    it('renders button "Open" for "Forget history"', function () {
      const buttonSelector = '.accordion #accordion-3 .bullet [data-open-url="forget_history"]';
      expect(subject.query(buttonSelector)).to.exist;
      expect(subject.query(buttonSelector).textContent.trim()).to.equal('control_center_open');
    });

    it('renders dropdown for autoforget mode', function () {
      expect(subject.query('.accordion #accordion-3 .bullet .custom-dropdown')).to.exist;
    });
  }

  describe('with autoforget mode on', function () {
    beforeEach(function () {
      subject.respondsWith({
        module: target,
        action: 'getData',
        response: dataOn
      });
      return subject.load();
    });

    it('history section exists', function () {
      expect(subject.query('#othersettings .accordion [data-target="history"]')).to.exist;
    });

    describe('click on the history section', function () {
      beforeEach(function () {
        subject.query('#othersettings .accordion [data-target="history"]').click();
        return waitFor(() => subject.query('.accordion .accordion-section-title[href="#accordion-3"]').classList.contains('active'));
      });

      historySectionTests();

      it('renders "Automatic forget mode"', function () {
        const modeSelector = '.accordion #accordion-3 .bullet [data-i18n="control_center_forget_mode"]';
        expect(subject.query(modeSelector)).to.exist;
        expect(subject.query(modeSelector).textContent.trim()).to.equal('control_center_forget_mode');
      });

      it('renders info button', function () {
        expect(subject.query('.accordion #accordion-3 .bullet .cc-tooltip')).to.exist;
      });


      it('Automatic forget mode is on', function () {
        const select = subject.query('.accordion #accordion-3 .bullet .custom-dropdown');
        const evt = document.createEvent('HTMLEvents');
        evt.initEvent('change', true, true);
        select.dispatchEvent(evt);
        return waitFor(
          () => subject.messages.find(message => message.action === 'updatePref')
        ).then(
          (message) => {
            expect(message).to.have.nested.property('args[0].pref', 'browser.privatebrowsing.apt');
            expect(message).to.have.nested.property('args[0].value', 'true');
            expect(message).to.have.nested.property('args[0].target', 'history_autoforget');
            expect(message).to.have.nested.property('args[0].prefType', 'boolean');
          }
        );
      });
    });
  });

  describe('with autoforget mode off', function () {
    beforeEach(function () {
      subject.respondsWith({
        module: target,
        action: 'getData',
        response: dataOff
      });
      return subject.load();
    });

    it('history section exists', function () {
      expect(subject.query('#othersettings .accordion [data-target="history"]')).to.exist;
    });

    describe('click on the history section', function () {
      beforeEach(function () {
        subject.query('#othersettings .accordion [data-target="history"]').click();
        return waitFor(() => subject.query('.accordion .accordion-section-title[href="#accordion-3"]').classList.contains('active'));
      });

      historySectionTests();

      it('renders "Automatic forget mode"', function () {
        const modeSelector = '.accordion #accordion-3 .bullet [data-i18n="control_center_forget_mode"]';
        expect(subject.query(modeSelector)).to.exist;
        expect(subject.query(modeSelector).textContent.trim()).to.equal('control_center_forget_mode');
      });

      it('renders info button', function () {
        expect(subject.query('.accordion #accordion-3 .bullet .cc-tooltip')).to.exist;
      });

      it('Automatic forget mode is off', function () {
        const select = subject.query('.accordion #accordion-3 .bullet .custom-dropdown');
        const evt = document.createEvent('HTMLEvents');
        evt.initEvent('change', true, true);
        select.dispatchEvent(evt);
        return waitFor(
          () => subject.messages.find(message => message.action === 'updatePref')
        ).then(
          (message) => {
            expect(message).to.have.nested.property('args[0].pref', 'browser.privatebrowsing.apt');
            expect(message).to.have.nested.property('args[0].value', 'false');
            expect(message).to.have.nested.property('args[0].target', 'history_autoforget');
            expect(message).to.have.nested.property('args[0].prefType', 'boolean');
          }
        );
      });
    });
  });
});

describe('Control Center: AMO, History options tests', function () {
  let subject;
  const target = 'control-center';

  beforeEach(function () {
    subject = new Subject();
  });

  afterEach(function () {
    subject.unload();
  });

  function historySectionTests() {
    it('history section appeared', function () {
      expect(subject.query('.accordion #accordion-3.accordion-section-content.open')).to.exist;
    });

    it('renders "History options"', function () {
      const titleSelector = '#othersettings .accordion .accordion-section-title[href="#accordion-3"] [data-i18n="control_center_history_options"]';
      expect(subject.query(titleSelector)).to.exist;
      expect(subject.query(titleSelector).textContent.trim()).to.equal('control_center_history_options');
    });

    it('renders arrow for history options', function () {
      const arrowSelector = '#othersettings .accordion .accordion-section-title[href="#accordion-3"] #arrow';
      expect(subject.query(arrowSelector)).to.exist;
    });

    it('renders two options', function () {
      expect(subject.queryAll('.accordion #accordion-3 .bullet').length).to.equal(2);
    });

    it('renders "Show all history"', function () {
      const historySelector = '.accordion #accordion-3 .bullet [data-i18n="control_center_show_history"]';
      expect(subject.query(historySelector)).to.exist;
      expect(subject.query(historySelector).textContent.trim()).to.equal('control_center_show_history');
    });

    it('renders button "Open" for "Show all history"', function () {
      const buttonSelector = '.accordion #accordion-3 .bullet [data-open-url="history"]';
      expect(subject.query(buttonSelector)).to.exist;
      expect(subject.query(buttonSelector).textContent.trim()).to.equal('control_center_open');
    });

    it('renders "Forget history"', function () {
      const forgetSelector = '.accordion #accordion-3 .bullet [data-i18n="control_center_forget_history"]';
      expect(subject.query(forgetSelector)).to.exist;
      expect(subject.query(forgetSelector).textContent.trim()).to.equal('control_center_forget_history');
    });

    it('renders button "Open" for "Forget history"', function () {
      const buttonSelector = '.accordion #accordion-3 .bullet [data-open-url="forget_history"]';
      expect(subject.query(buttonSelector)).to.exist;
      expect(subject.query(buttonSelector).textContent.trim()).to.equal('control_center_open');
    });
  }

  beforeEach(function () {
    subject.respondsWith({
      module: target,
      action: 'getData',
      response: dataAmo
    });
    return subject.load();
  });

  it('history section exists', function () {
    expect(subject.query('#othersettings .accordion [data-target="history"]')).to.exist;
  });

  describe('click on the history section', function () {
    beforeEach(function () {
      subject.query('#othersettings .accordion [data-target="history"]').click();
      return waitFor(() => subject.query('.accordion .accordion-section-title[href="#accordion-3"]').classList.contains('active'));
    });

    historySectionTests();
  });
});
