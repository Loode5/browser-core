/* global chai, describeModule, sinon */
/* eslint no-return-assign: off */
/* eslint new-cap: off */

const Moment = require('moment');
const MomentRange = require('moment-range');

let mockCoreVersion = null;
let mockUserDemographics = { };
let mockSynchronizedDate = Moment(new Date(2017, 5, 1));
let mockRandom = 0;

const normalizeString = value => value.trim().toLowerCase().replace(/\s+/g, '-');

const MOCK = {
  'abtests/logger': {
    default: {
      debug() {},
      log() {},
      error() {},
    },
  },
  'abtests/demographics': {
    default: () => mockCoreVersion,
  },
  'core/kord/inject': {
    default: {
      module() { return { action() {} }; }
    }
  },
  'core/demographics': {
    default: () => Promise.resolve(mockUserDemographics),
    normalizeString,
  },
  'core/synchronized-time': {
    default: () => mockSynchronizedDate,
  },
  'core/crypto/random': {
    default: () => mockRandom,
  },
  'platform/lib/moment': {
    default: Moment,
  },
  'platform/lib/moment-range': {
    default: MomentRange,
  },
};

class MockStorage {
  constructor() {
    this.database = { };
  }

  get(k, d) {
    return Promise.resolve(
      Object.prototype.hasOwnProperty.call(this.database, k) ? this.database[k] : d
    );
  }

  set(k, v) {
    return Promise.resolve(this.database[k] = v);
  }

  remove(k) {
    return Promise.resolve(delete this.database[k]);
  }
}


const SHARED_STORAGE_KEY = 'abtests_running';

const mockTest1 = {
  id: '1',
  probability: 0.5,
  demographic: '{}',
  groups: {
    A: {
      pref_1a1: true,
      pref_1a2: 5,
    },
    B: {
      pref_1b1: 'bla',
    },
  },
  status: 'Active',
};

export default describeModule('abtests/manager',
  () => MOCK,
  () => {
    describe('#updateTests', () => {
      let availableTests;
      let manager;
      let mockModuleStorage;
      let mockSharedStorage;

      beforeEach(function () {
        const Manager = new this.module().default;
        mockModuleStorage = new MockStorage();
        mockSharedStorage = new MockStorage();
        manager = new Manager({ }, mockModuleStorage, mockSharedStorage);
        availableTests = [
          { id: '1', groups: {} },
          {
            id: '2',
            groups: {
              A: {
                a_pref: 10,
              },
            }
          }
        ];
        manager.chooseTestGroup = () => 'A';
        manager.client.getAvailableTests = () => Promise.resolve(availableTests);
        manager.client.leaveTest = () => Promise.resolve();
        manager.updateRunningTests = sinon.spy(() => []);
      });

      it('calls `updateRunningTests` with available tests', () =>
        manager.updateTests().then(() => {
          chai.expect(manager.updateRunningTests).to.have.been.calledWith(availableTests);
        }));

      it('starts upcoming tests and stops expired tests', () => {
        const startedTests = [];
        const stoppedTests = [];
        manager.runningTests = { 3: { id: '3' }, 4: { id: '4' } };
        manager.shouldStartTest = ({ id }) => Promise.resolve(id === '2');
        manager.shouldStopTest = ({ id }) => id === '3';
        manager.client.enterTest = () => Promise.resolve(true);
        manager.startTest = (test) => { startedTests.push(test); return Promise.resolve(test); };
        manager.stopTest = (test) => { stoppedTests.push(test); return Promise.resolve(test); };
        return manager.updateTests().then(() => {
          chai.expect(startedTests.length).to.equal(1);
          chai.expect(startedTests[0].id).to.equal('2');

          chai.expect(stoppedTests.length).to.equal(1);
          chai.expect(stoppedTests[0].id).to.equal('3');
        });
      });

      it('takes prefs of upcoming tests if expired and upcoming tests modify the same prefs', () => {
        manager.runningTests = {
          3: {
            id: '3',
            groups: { A: { a_pref: 5 } },
            group: 'A',
          }
        };
        manager.shouldStartTest = ({ id }) => Promise.resolve(id === '2');
        // manager.shouldStartTest = ({ id }) => Promise.resolve(false);
        manager.shouldStopTest = ({ id }) => id === '3';
        manager.client.enterTest = () => Promise.resolve(true);
        const stopTest = manager.stopTest.bind(manager);
        manager.stopTest = async (...args) => {
          await new Promise(resolve => setTimeout(resolve, 100));
          const test = await stopTest(...args);
          return test;
        };
        return manager.updateTests().then(() => {
          chai.expect(mockSharedStorage.database[SHARED_STORAGE_KEY]).to.equal('["2_A"]');
          chai.expect(mockSharedStorage.database.a_pref).to.equal(10);
        });
      });
    });

    describe('#getRunningLegacyTests', () => {
      let manager;
      let mockModuleStorage;
      let mockSharedStorage;

      beforeEach(function () {
        const Manager = new this.module().default;
        mockModuleStorage = new MockStorage();
        mockSharedStorage = new MockStorage();
        manager = new Manager(null, mockModuleStorage, mockSharedStorage);
      });

      it('gets running SERP test', async () => {
        mockSharedStorage.database.serp_test = 'C';
        const tests = await manager.getRunningLegacyTests();
        chai.expect(tests).to.be.deep.equal({ 1114: {} });
      });

      it('returns empty object for no running SERP test', async () => {
        mockSharedStorage.database.serp_test = undefined;
        const tests = await manager.getRunningLegacyTests();
        chai.expect(tests).to.be.deep.equal({});
      });
    });

    describe('#startTest', () => {
      let manager;
      let mockModuleStorage;
      let mockSharedStorage;

      beforeEach(function () {
        const Manager = new this.module().default;
        mockModuleStorage = new MockStorage();
        mockSharedStorage = new MockStorage();
        manager = new Manager(null, mockModuleStorage, mockSharedStorage);
      });

      it('sets test-specific prefs for selected group', () =>
        manager.startTest({ ...mockTest1, group: 'A' }).then(() => {
          chai.expect(mockSharedStorage.database.pref_1a1).to.be.true;
          chai.expect(mockSharedStorage.database.pref_1a2).to.equal(5);
        }));

      it('add test to running tests', () =>
        manager.startTest({ ...mockTest1, group: 'A' }).then(() => {
          chai.expect(manager.runningTests).to.have.key(mockTest1.id);
          chai.expect(manager.runningTests[mockTest1.id].started).to.equal('2017/06/01');
        }));

      it('accepts empty test group prefs', () =>
        manager.startTest({ ...mockTest1, groups: { A: { } }, group: 'A' }).then(() => {
          chai.expect(mockSharedStorage.database).to.be.empty;
        }));
    });

    describe('#stopTest', () => {
      let manager;
      let mockModuleStorage;
      let mockSharedStorage;

      beforeEach(function () {
        const Manager = new this.module().default;
        mockModuleStorage = new MockStorage();
        mockSharedStorage = new MockStorage();
        manager = new Manager(null, mockModuleStorage, mockSharedStorage);
      });

      it('sets test-specific prefs for selected group', () => {
        mockSharedStorage.database = { pref_1a1: true, pref_1a2: 5, other: 'foo' };
        return manager.stopTest({ ...mockTest1, group: 'A' }).then(() => {
          chai.expect(mockSharedStorage.database).to.have.key('other');
        });
      });

      it('removes test from running tests and ads it to completed tests', () => {
        manager.runningTests = { [mockTest1.id]: { } };
        return manager.stopTest({ ...mockTest1, group: 'A' }).then(() => {
          chai.expect(manager.runningTests).to.not.have.key(mockTest1.id);
          chai.expect(manager.completedTests).to.have.key(mockTest1.id);
          chai.expect(manager.completedTests[mockTest1.id].completed).to.equal('2017/06/01');
        });
      });
    });

    describe('#updateRunningTests', () => {
      let manager;
      let mockModuleStorage;
      let mockSharedStorage;

      beforeEach(function () {
        const Manager = new this.module().default;
        mockModuleStorage = new MockStorage();
        mockSharedStorage = new MockStorage();
        manager = new Manager(null, mockModuleStorage, mockSharedStorage);
      });

      it('updates status and end date', () => {
        manager.runningTests = { 1: { status: 'a', end_date: 'b' } };
        manager.updateRunningTests([{ id: '1', status: 'x', end_date: 'y' }]);
        chai.expect(manager.runningTests['1'].status).to.equal('x');
        chai.expect(manager.runningTests['1'].end_date).to.equal('y');
      });
    });

    describe('#getNewTests', () => {
      let manager;
      let mockModuleStorage;
      let mockSharedStorage;

      beforeEach(function () {
        const Manager = new this.module().default;
        mockModuleStorage = new MockStorage();
        mockSharedStorage = new MockStorage();
        manager = new Manager(null, mockModuleStorage, mockSharedStorage);
      });

      it('removes tests that are running', () => {
        manager.runningTests = { 1: { } };
        const newTests = manager.getNewTests([{ id: '1' }, { id: '2' }]);
        chai.expect(newTests.length).to.equal(1);
        chai.expect(newTests[0]).to.deep.equal({ id: '2' });
      });

      it('filters tests that have been completed', () => {
        manager.completedTests = { 1: { } };
        const newTests = manager.getNewTests([{ id: '1' }, { id: '2' }]);
        chai.expect(newTests.length).to.equal(1);
        chai.expect(newTests[0]).to.deep.equal({ id: '2' });
      });
    });

    describe('#getExpiredTests', () => {
      let manager;
      let mockModuleStorage;
      let mockSharedStorage;

      beforeEach(function () {
        const Manager = new this.module().default;
        mockModuleStorage = new MockStorage();
        mockSharedStorage = new MockStorage();
        manager = new Manager(null, mockModuleStorage, mockSharedStorage);
      });

      it('finds tests (from running tests) that should be stopped', () => {
        manager.shouldStopTest = ({ id }) => id === '2';
        manager.runningTests = { 1: { id: '1' }, 2: { id: '2' }, 3: { id: '3' } };
        const expiredTests = manager.getExpiredTests();
        chai.expect(expiredTests.length).to.equal(1);
        chai.expect(expiredTests[0]).to.deep.equal({ id: '2' });
      });
    });

    describe('#getUpcomingTests', () => {
      let manager;
      let mockModuleStorage;
      let mockSharedStorage;

      beforeEach(function () {
        const Manager = new this.module().default;
        mockModuleStorage = new MockStorage();
        mockSharedStorage = new MockStorage();
        manager = new Manager({ }, mockModuleStorage, mockSharedStorage);
      });

      it('finds tests that pass local enter tests and calls `chooseTestGroup`', () => {
        manager.chooseTestGroup = () => 'A';
        manager.shouldStartTest = ({ id }) => Promise.resolve(id === '2');
        manager.client.enterTest = () => Promise.resolve(true);
        return manager.getUpcomingTests([{ id: '1' }, { id: '2' }, { id: '3' }]).then((upcomingTests) => {
          chai.expect(upcomingTests.length).to.equal(1);
          chai.expect(upcomingTests[0]).to.deep.equal({ id: '2', group: 'A' });
        });
      });

      it('finds tests that pass remote enter tests and calls `chooseTestGroup`', () => {
        manager.chooseTestGroup = () => '';
        manager.shouldStartTest = () => Promise.resolve(true);
        manager.client.enterTest = id => (id === '3' ? Promise.resolve(false) : Promise.resolve(true));
        return manager.getUpcomingTests([{ id: '1' }, { id: '2' }, { id: '3' }]).then((upcomingTests) => {
          chai.expect(upcomingTests.length).to.equal(2);
          chai.expect(upcomingTests[0].id).to.equal('1');
          chai.expect(upcomingTests[1].id).to.equal('2');
        });
      });

      it('finds tests that pass both local and remote enter tests and calls `chooseTestGroup`', () => {
        manager.chooseTestGroup = () => 'A';
        manager.shouldStartTest = ({ id }) => Promise.resolve(id === '2');
        manager.client.enterTest = id => (id === '3' ? Promise.reject() : Promise.resolve(true));
        return manager.getUpcomingTests([{ id: '1' }, { id: '2' }, { id: '3' }]).then((upcomingTests) => {
          chai.expect(upcomingTests.length).to.equal(1);
          chai.expect(upcomingTests[0]).to.deep.equal({ id: '2', group: 'A' });
        });
      });

      it('excludes tests for which remote call fails', () => {
        manager.chooseTestGroup = () => '';
        manager.shouldStartTest = () => Promise.resolve(true);
        manager.client.enterTest = id => (id === '3' ? Promise.reject() : Promise.resolve(true));
        return manager.getUpcomingTests([{ id: '1' }, { id: '2' }, { id: '3' }]).then((upcomingTests) => {
          chai.expect(upcomingTests.length).to.equal(2);
          chai.expect(upcomingTests[0].id).to.equal('1');
          chai.expect(upcomingTests[1].id).to.equal('2');
        });
      });

      it('excludes test if running test lists it as competitor', () => {
        manager.chooseTestGroup = () => '';
        manager.shouldStartTest = () => Promise.resolve(true);
        manager.client.enterTest = () => Promise.resolve(true);
        manager.runningTests = { 2: { id: '2', competitors: ['1'] } };
        return manager.getUpcomingTests([{ id: '1' }, { id: '3' }]).then((upcomingTests) => {
          chai.expect(upcomingTests.length).to.equal(1);
          chai.expect(upcomingTests[0].id).to.equal('3');
        });
      });

      it('excludes test if it lists running test as competitor', () => {
        manager.chooseTestGroup = () => '';
        manager.shouldStartTest = () => Promise.resolve(true);
        manager.client.enterTest = () => Promise.resolve(true);
        manager.runningTests = { 2: { id: '2' } };
        return manager.getUpcomingTests([{ id: '1', competitors: ['2'] }, { id: '3' }]).then((upcomingTests) => {
          chai.expect(upcomingTests.length).to.equal(1);
          chai.expect(upcomingTests[0].id).to.equal('3');
        });
      });

      it('excludes test if completed test lists it as competitor', () => {
        manager.chooseTestGroup = () => '';
        manager.shouldStartTest = () => Promise.resolve(true);
        manager.client.enterTest = () => Promise.resolve(true);
        manager.completedTests = { 2: { id: '2', competitors: ['1'] } };
        return manager.getUpcomingTests([{ id: '1' }, { id: '3' }]).then((upcomingTests) => {
          chai.expect(upcomingTests.length).to.equal(1);
          chai.expect(upcomingTests[0].id).to.equal('3');
        });
      });

      it('excludes test if it lists completed test as competitor', () => {
        manager.chooseTestGroup = () => '';
        manager.shouldStartTest = () => Promise.resolve(true);
        manager.client.enterTest = () => Promise.resolve(true);
        manager.completedTests = { 2: { id: '2' } };
        return manager.getUpcomingTests([{ id: '1', competitors: ['2'] }, { id: '3' }]).then((upcomingTests) => {
          chai.expect(upcomingTests.length).to.equal(1);
          chai.expect(upcomingTests[0].id).to.equal('3');
        });
      });

      it('excludes test if it lists legacy test as competitor', () => {
        manager.chooseTestGroup = () => '';
        manager.shouldStartTest = () => Promise.resolve(true);
        manager.getRunningLegacyTests = () => Promise.resolve({ 100: {} });
        manager.client.enterTest = () => Promise.resolve(true);
        return manager.getUpcomingTests([{ id: '1', competitors: ['100'] }, { id: '3' }]).then((upcomingTests) => {
          chai.expect(upcomingTests.length).to.equal(1);
          chai.expect(upcomingTests[0].id).to.equal('3');
        });
      });

      it('excludes test that is listed by an earlier new test as competitor', () => {
        manager.chooseTestGroup = () => '';
        manager.shouldStartTest = () => Promise.resolve(true);
        manager.client.enterTest = () => Promise.resolve(true);
        return manager.getUpcomingTests([{ id: '1', competitors: ['2'] }, { id: '2' }]).then((upcomingTests) => {
          chai.expect(upcomingTests.length).to.equal(1);
          chai.expect(upcomingTests[0].id).to.equal('1');
        });
      });

      it('excludes test that lists an earlier new test as competitor', () => {
        manager.chooseTestGroup = () => '';
        manager.shouldStartTest = () => Promise.resolve(true);
        manager.client.enterTest = () => Promise.resolve(true);
        return manager.getUpcomingTests([{ id: '1' }, { id: '2', competitors: ['1'] }, { id: '3' }]).then((upcomingTests) => {
          chai.expect(upcomingTests.length).to.equal(2);
          chai.expect(upcomingTests[0].id).to.equal('1');
          chai.expect(upcomingTests[1].id).to.equal('3');
        });
      });

      it('does not exlude tests if they are not competing', () => {
        manager.chooseTestGroup = () => '';
        manager.shouldStartTest = () => Promise.resolve(true);
        manager.client.enterTest = () => Promise.resolve(true);
        manager.runningTests = { 1: { id: '1', competitors: ['11'] } };
        manager.completedTests = { 2: { id: '2', competitors: ['12'] } };
        return manager.getUpcomingTests([{ id: '3', competitors: ['13'] }, { id: '4' }]).then((upcomingTests) => {
          chai.expect(upcomingTests.length).to.equal(2);
          chai.expect(upcomingTests[0].id).to.equal('3');
          chai.expect(upcomingTests[1].id).to.equal('4');
        });
      });
    });

    describe('#chooseTestGroup', () => {
      let manager;

      beforeEach(function () {
        const Manager = new this.module().default;
        manager = new Manager();
      });

      it('chooses only available group', () => {
        const test = { groups: { A: { } } };
        mockRandom = 0;
        chai.expect(manager.chooseTestGroup(test)).to.equal('A');
        mockRandom = 0.99999999;
        chai.expect(manager.chooseTestGroup(test)).to.equal('A');
      });

      it('chooses one group out of two', () => {
        const test = { groups: { A: { }, B: { } } };
        mockRandom = 0;
        chai.expect(manager.chooseTestGroup(test)).to.equal('A');
        mockRandom = 0.49;
        chai.expect(manager.chooseTestGroup(test)).to.equal('A');
        mockRandom = 0.5;
        chai.expect(manager.chooseTestGroup(test)).to.equal('B');
      });

      it('chooses one group out of three', () => {
        const test = { groups: { A: { }, B: { }, C: { } } };
        mockRandom = 0;
        chai.expect(manager.chooseTestGroup(test)).to.equal('A');
        mockRandom = 0.33;
        chai.expect(manager.chooseTestGroup(test)).to.equal('A');
        mockRandom = 0.34;
        chai.expect(manager.chooseTestGroup(test)).to.equal('B');
        mockRandom = 0.67;
        chai.expect(manager.chooseTestGroup(test)).to.equal('C');
      });
    });

    describe('#shouldStartTest', () => {
      let manager;
      let mockTest2;

      beforeEach(function () {
        const Manager = new this.module().default;
        manager = new Manager();

        mockTest2 = Object.assign({ }, mockTest1);

        manager.isDemographicsMatch = (test) => {
          chai.expect(test.demographic).to.not.be.undefined;
          return Promise.resolve(true);
        };
        manager.isTestActive = (test) => {
          chai.expect(test.status).to.not.be.undefined;
          return true;
        };
        manager.isVersionMatch = () => true;
        manager.isTestCompeting = () => false;
      });

      it('returns true if probability threshold is higher than random draw', () => {
        mockRandom = 0.4;
        mockTest2.probability = 0.5;
        return chai.expect(manager.shouldStartTest(mockTest2)).to.eventually.be.true;
      });

      it('returns false if probability threshold is lower than random draw', () => {
        mockRandom = 0.4;
        mockTest2.probability = 0.3;
        return chai.expect(manager.shouldStartTest(mockTest2)).to.eventually.be.false;
      });

      it('returns false if demographics do not match', () => {
        mockRandom = 0.4;
        mockTest2.probability = 0.5;
        manager.isDemographicsMatch = () => Promise.resolve(false);
        return chai.expect(manager.shouldStartTest(mockTest2)).to.eventually.be.false;
      });

      it('returns false if version does not match', () => {
        mockRandom = 0.4;
        mockTest2.probability = 0.5;
        manager.isVersionMatch = () => false;
        return chai.expect(manager.shouldStartTest(mockTest2)).to.eventually.be.false;
      });

      it('returns true if condition evaluates to true', () => {
        mockRandom = 0.4;
        mockTest2.probability = 0.5;
        return chai.expect(manager.shouldStartTest({
          ...mockTest2,
          conditions: {
            and: [
              { noneOf: [
                { pref: { name: 'foo', hasValue: 'baz' } },
              ] },
              { noneOf: [
                { pref: { name: 'foo', hasValue: 'bar' } },
              ] },
            ]
          },
        })).to.eventually.be.true;
      });

      it('returns false if condition evaluates to false', () => {
        mockRandom = 0.4;
        mockTest2.probability = 0.5;
        return chai.expect(manager.shouldStartTest({
          ...mockTest2,
          conditions: {
            and: [
              { pref: { name: 'foo', hasValue: 'baz' } },
              { noneOf: [
                { pref: { name: 'foo', hasValue: 'bar' } },
              ] },
            ]
          },
        })).to.eventually.be.false;
      });
    });

    describe('#shouldStopTest', () => {
      let manager;
      let mockTest2;

      beforeEach(function () {
        const Manager = new this.module().default;
        manager = new Manager();

        mockTest2 = Object.assign({ }, mockTest1);

        manager.isTestActive = (test) => {
          chai.expect(test.status).to.not.be.undefined;
          return true;
        };
      });

      it('returns false if treatment is ongoing', () => {
        mockTest2.started = '2017/01/01';
        mockTest2.treatment_length = 1;
        mockSynchronizedDate = Moment(new Date(2017, 0, 1));
        chai.expect(manager.shouldStopTest(mockTest2)).to.be.false;

        mockTest2.treatment_length = 3;
        mockSynchronizedDate = Moment(new Date(2017, 0, 2));
        chai.expect(manager.shouldStopTest(mockTest2)).to.be.false;
        mockSynchronizedDate = Moment(new Date(2017, 0, 3));
        chai.expect(manager.shouldStopTest(mockTest2)).to.be.false;
      });

      it('returns true if treatment is over', () => {
        mockTest2.started = '2017/01/01';
        mockTest2.treatment_length = 0;
        mockSynchronizedDate = Moment(new Date(2017, 0, 1));
        chai.expect(manager.shouldStopTest(mockTest2)).to.be.true;

        mockTest2.treatment_length = 2;
        mockSynchronizedDate = Moment(new Date(2017, 0, 3));
        chai.expect(manager.shouldStopTest(mockTest2)).to.be.true;
      });
    });

    describe('#isTestActive', () => {
      let manager;
      let mockTest2;

      beforeEach(function () {
        const Manager = new this.module().default;
        manager = new Manager();

        mockTest2 = Object.assign({ }, mockTest1);
      });

      it('returns true if is active and end date is before current date', () => {
        mockTest2.status = 'Active';
        mockTest2.end_date = mockSynchronizedDate.clone().add(1, 'days').format('YYYY/MM/DD');
        chai.expect(manager.isTestActive(mockTest2)).to.be.true;
      });

      it('returns false if is active and end date is current date', () => {
        mockTest2.status = 'Active';
        mockTest2.end_date = mockSynchronizedDate.format('YYYY/MM/DD');
        chai.expect(manager.isTestActive(mockTest2)).to.be.false;
      });

      it('returns false if is active and end date is after current date', () => {
        mockTest2.status = 'Active';
        mockTest2.end_date = mockSynchronizedDate.clone().subtract(1, 'days').format('YYYY/MM/DD');
        chai.expect(manager.isTestActive(mockTest2)).to.be.false;
      });

      it('returns false if is not active and end date is before current date', () => {
        mockTest2.status = 'Inactive';
        mockTest2.end_date = mockSynchronizedDate.clone().add(1, 'days').format('YYYY/MM/DD');
        chai.expect(manager.isTestActive(mockTest2)).to.be.false;
      });
    });

    describe('#isTestCompeting', () => {
      let manager;
      let mockTest2;

      beforeEach(function () {
        const Manager = new this.module().default;
        manager = new Manager();

        mockTest2 = Object.assign({ }, mockTest1);
      });

      it('returns false if current test has no competitor field', () => {
        chai.expect(manager.isTestCompeting(mockTest2, {})).to.be.false;
      });

      it('returns false if all others tests have no competitor fields', () => {
        const tests = { 1: { id: '1' }, 2: { id: '2' } };
        mockTest2.competitors = [];
        chai.expect(manager.isTestCompeting(mockTest2, tests)).to.be.false;
      });

      it('returns false if some others tests have no competitor fields', () => {
        const tests = { 1: { id: '1', competitors: [] }, 2: { id: '2' } };
        mockTest2.competitors = [];
        chai.expect(manager.isTestCompeting(mockTest2, tests)).to.be.false;
      });

      it('returns false if current test does not list competing tests', () => {
        mockTest2.competitors = ['0'];
        const tests = { 1: { id: '1', competitors: [] }, 2: { id: '2', competitors: [] } };
        chai.expect(manager.isTestCompeting(mockTest2, tests)).to.be.false;
      });

      it('returns false if current test is not listed by others tests as competing', () => {
        mockTest2.competitors = ['0'];
        const tests = { 1: { id: '1', competitors: ['10'] }, 2: { id: '2', competitors: ['11'] } };
        chai.expect(manager.isTestCompeting(mockTest2, tests)).to.be.false;
      });

      it('returns true if current test lists another test as competing', () => {
        mockTest2.competitors = ['1'];
        const tests = { 1: { id: '1', competitors: [] }, 2: { id: '2', competitors: [] } };
        chai.expect(manager.isTestCompeting(mockTest2, tests)).to.be.true;
      });

      it('returns true if current test is listed as competing by another test', () => {
        mockTest2.id = '0';
        mockTest2.competitors = [];
        const tests = { 1: { id: '1', competitors: ['0'] }, 2: { id: '2', competitors: [] } };
        chai.expect(manager.isTestCompeting(mockTest2, tests)).to.be.true;
      });
      it('returns true if current lists and is listed as competing', () => {
        mockTest2.id = '0';
        mockTest2.competitors = ['1'];
        const tests = { 1: { id: '1', competitors: [] }, 2: { id: '2', competitors: ['0'] } };
        chai.expect(manager.isTestCompeting(mockTest2, tests)).to.be.true;
      });
    });

    describe('#isVersionMatch', () => {
      let manager;
      let mockTest2;

      beforeEach(function () {
        const Manager = new this.module().default;
        manager = new Manager();

        mockTest2 = Object.assign({ }, mockTest1);
      });

      it('returns true for exact match', () => {
        mockCoreVersion = '1.0.0';
        mockTest2.core_version = '1.0.0';
        chai.expect(manager.isVersionMatch(mockTest2)).to.be.true;
      });

      it('returns true for partial match', () => {
        mockCoreVersion = '1.0.0';
        mockTest2.core_version = '1.0';
        chai.expect(manager.isVersionMatch(mockTest2)).to.be.true;
        mockTest2.core_version = '1';
        chai.expect(manager.isVersionMatch(mockTest2)).to.be.true;
      });

      it('returns false for no match', () => {
        mockCoreVersion = '1.0.0';
        mockTest2.core_version = '2.0.0';
        chai.expect(manager.isVersionMatch(mockTest2)).to.be.false;
        mockTest2.core_version = '2.0';
        chai.expect(manager.isVersionMatch(mockTest2)).to.be.false;
        mockTest2.core_version = '2';
        chai.expect(manager.isVersionMatch(mockTest2)).to.be.false;
      });

      it('returns false for missing core version in client', () => {
        mockCoreVersion = null;
        mockTest2.core_version = '2.0.0';
        chai.expect(manager.isVersionMatch(mockTest2)).to.be.false;
      });

      it('returns true for missing core version in test', () => {
        mockCoreVersion = '1.0.0';
        mockTest2.core_version = '';
        chai.expect(manager.isVersionMatch(mockTest2)).to.be.true;
        mockTest2.core_version = null;
        chai.expect(manager.isVersionMatch(mockTest2)).to.be.true;
        delete mockTest2.core_version;
        chai.expect(manager.isVersionMatch(mockTest2)).to.be.true;
      });
    });

    describe('#isDemographicsMatch', () => {
      let manager;

      beforeEach(function () {
        const Manager = new this.module().default;
        manager = new Manager();
        manager.anolysis = {
          action: () => Promise.resolve(JSON.stringify(mockUserDemographics)),
        };
      });

      it('does not match non-existent factor', () => {
        mockUserDemographics = { platform: 'Desktop/Mac OS/10.12' };
        return chai.expect(manager.isDemographicsMatch({ demographic: { product: 'CLIQZ' } })).to.eventually.be.false;
      });

      describe('with install date', () => {
        it('matches exact date', () => {
          mockUserDemographics = { install_date: '2017/04/28' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { install_date: '2017/04/28' } })).to.eventually.eventually.be.true;
        });

        it('matches center date', () => {
          mockUserDemographics = { install_date: '2017/04/24' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { install_date: '2017/04/20-2017/04/28' } })).to.eventually.be.true;
        });

        it('matches start date', () => {
          mockUserDemographics = { install_date: '2017/04/20' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { install_date: '2017/04/20-2017/04/28' } })).to.eventually.be.true;
        });

        it('matches end date', () => {
          mockUserDemographics = { install_date: '2017/04/28' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { install_date: '2017/04/20-2017/04/28' } })).to.eventually.be.true;
        });

        it('does not match date before range', () => {
          mockUserDemographics = { install_date: '2017/04/19' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { install_date: '2017/04/20-2017/04/28' } })).to.eventually.be.false;
        });

        it('does not match date after range', () => {
          mockUserDemographics = { install_date: '2017/04/29' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { install_date: '2017/04/20-2017/04/28' } })).to.eventually.be.false;
        });

        it('does not match date before date', () => {
          mockUserDemographics = { install_date: '2017/04/19' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { install_date: '2017/04/20' } })).to.eventually.be.false;
        });

        it('does not match date before date', () => {
          mockUserDemographics = { install_date: '2017/04/21' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { install_date: '2017/04/20' } })).to.eventually.be.false;
        });

        it('matches date and other factor', () => {
          mockUserDemographics = { install_date: '2017/04/24', product: 'CLIQZ/desktop/Cliqz for Mac OS/1.12.0' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { install_date: '2017/04/20-2017/04/28', product: 'CLIQZ' } })).to.eventually.be.true;
        });
      });

      describe('with one factor', () => {
        it('matches root', () => {
          mockUserDemographics = { product: 'CLIQZ/desktop/Cliqz for Mac OS/1.12.0' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { product: 'CLIQZ' } })).to.eventually.be.true;
        });

        it('matches different non-normalized values', () => {
          mockUserDemographics = { product: 'cliqz' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { product: 'CLIQZ' } })).to.eventually.be.true;
        });

        it('matches partial path', () => {
          mockUserDemographics = { product: 'CLIQZ/desktop/Cliqz for Mac OS/1.12.0' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { product: 'CLIQZ/desktop' } })).to.eventually.be.true;
        });

        it('matches full path', () => {
          mockUserDemographics = { product: 'CLIQZ/desktop/Cliqz for Mac OS/1.12.0' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { product: 'CLIQZ/desktop/Cliqz for Mac OS/1.12.0' } })).to.eventually.be.true;
        });

        it('does not match root', () => {
          mockUserDemographics = { product: 'CLIQZ/desktop/Cliqz for Mac OS/1.12.0' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { product: 'Firefox' } })).to.eventually.be.false;
        });

        it('does not match node', () => {
          mockUserDemographics = { product: 'CLIQZ/desktop/Cliqz for Mac OS/1.12.0' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { product: 'CLIQZ/mobile' } })).to.eventually.be.false;
        });
      });

      describe('with multiple factors', () => {
        it('matches partial test specification', () => {
          mockUserDemographics = { product: 'CLIQZ/desktop/Cliqz for Mac OS/1.12.0', platform: 'Desktop/Mac OS/10.12' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { product: 'CLIQZ' } })).to.eventually.be.true;
        });

        it('matches full test specification', () => {
          mockUserDemographics = { product: 'CLIQZ/desktop/Cliqz for Mac OS/1.12.0', platform: 'Desktop/Mac OS/10.12' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { product: 'CLIQZ', platform: 'Desktop' } })).to.eventually.be.true;
        });

        it('does not match in one factor for full specification', () => {
          mockUserDemographics = { product: 'CLIQZ/desktop/Cliqz for Mac OS/1.12.0', platform: 'Desktop/Mac OS/10.12' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { product: 'CLIQZ', platform: 'Mobile' } })).to.eventually.be.false;
        });

        it('does not match in one factor for partial specification', () => {
          mockUserDemographics = { product: 'CLIQZ/desktop/Cliqz for Mac OS/1.12.0', platform: 'Desktop/Mac OS/10.12' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { product: 'Firefox' } })).to.eventually.be.false;
        });

        it('does not match in all factors', () => {
          mockUserDemographics = { product: 'CLIQZ/desktop/Cliqz for Mac OS/1.12.0', platform: 'Desktop/Mac OS/10.12' };
          return chai.expect(manager.isDemographicsMatch({ demographic: { product: 'Firefox', platform: 'Mobile' } })).to.eventually.be.false;
        });
      });
    });
  });
