'use strict';

const path = require('path');
const App = require('../../src/app/base');

describe('DI container', () => {
    let app;
    let basePath = path.join(__dirname, '..', '..');
    let testKey = 'testKey';

    beforeEach(() => {
        app = new App(basePath);
    });

    it('registers instance', done => {
        let obj = { test: 'value' };
        let get = () => {
            return app.get(testKey);
        };

        expect(get).toThrow();
        app.registerInstance(obj, testKey);
        expect(get()).toBe(obj);

        done();
    });

    it('registers class', done => {
        class TestClass {
            static get provides() {
                return testKey;
            }
        }

        let get = () => {
            return app.get(testKey);
        };

        expect(get).toThrow();
        app.registerClass(TestClass);
        expect(get() instanceof TestClass).toBeTruthy();

        done();
    });
});