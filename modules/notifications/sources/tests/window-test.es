/* global chai, sinon */
/* eslint no-undef: 'off' */
/* eslint prefer-arrow-callback: off */
/* eslint func-names: off */

export default describeModule('notifications/window',
  function () {
    return {
      'core/kord/inject': {
        default: {
          module() { return { action() {} }; }
        }
      },
    };
  },
  function () {
    let subject;

    beforeEach(function () {
      const Notifications = this.module().default;
      subject = new Notifications();
    });

    describe('#init', function () {
      context('with Freshtab active', function () {
        beforeEach(function () {
          subject.freshtab.isReady = () => Promise.resolve();
        });

        it('calls action: notifications/updateUnreadStatus', function () {
          const actionStub = sinon.stub(subject.notifications, 'action',
            () => Promise.resolve(true));

          return subject.init().then(() => {
            chai.expect(actionStub).to.have.been.calledWith('hasUnread');
            chai.expect(actionStub).to.have.been.calledWith('updateUnreadStatus');
          });
        });
      });
    });
  });
