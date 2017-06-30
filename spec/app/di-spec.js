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

    it('resolves dependencies', done => {
        let lifecycle;

        class ClassA {
            constructor(b, c) {
                this.b = b;
                this.c = c;
            }

            static get provides() {
                return 'a';
            }

            static get requires() {
                return [ 'b', 'c' ];
            }
        }

        class ClassB {
            constructor(d) {
                this.d = d;
            }

            static get provides() {
                return 'b';
            }

            static get requires() {
                return [ 'd' ];
            }
        }

        class ClassC {
            constructor(d) {
                this.d = d;
            }

            static get provides() {
                return 'c';
            }

            static get requires() {
                return [ 'd' ];
            }
        }

        class ClassD {
            static get provides() {
                return 'd';
            }

            static get lifecycle() {
                return lifecycle;
            }
        }

        app.registerClass(ClassA);
        app.registerClass(ClassB);
        app.registerClass(ClassC);

        let get = () => {
            return app.get('a');
        };

        expect(get).toThrow();

        app.registerClass(ClassD);

        let a = get();
        expect(a).not.toBe(get());
        expect(a instanceof ClassA).toBeTruthy();
        expect(a.b instanceof ClassB).toBeTruthy();
        expect(a.c instanceof ClassC).toBeTruthy();
        expect(a.b.d instanceof ClassD).toBeTruthy();
        expect(a.c.d instanceof ClassD).toBeTruthy();
        expect(a.b.d).toBe(a.c.d);

        lifecycle = 'singleton';
        app.registerClass(ClassD);

        a = get();
        expect(a).not.toBe(get());
        expect(a instanceof ClassA).toBeTruthy();
        expect(a.b instanceof ClassB).toBeTruthy();
        expect(a.c instanceof ClassC).toBeTruthy();
        expect(a.b.d instanceof ClassD).toBeTruthy();
        expect(a.c.d instanceof ClassD).toBeTruthy();
        expect(a.b.d).toBe(a.c.d);
        expect(a.b.d).toBe(app.get('d'));

        lifecycle = 'unique';
        app.registerClass(ClassD);

        a = get();
        expect(a).not.toBe(get());
        expect(a instanceof ClassA).toBeTruthy();
        expect(a.b instanceof ClassB).toBeTruthy();
        expect(a.c instanceof ClassC).toBeTruthy();
        expect(a.b.d instanceof ClassD).toBeTruthy();
        expect(a.c.d instanceof ClassD).toBeTruthy();
        expect(a.b.d).not.toBe(a.c.d);

        let d = { test: 'value' };
        app.registerInstance(d, 'd');

        a = get();
        expect(a).not.toBe(get());
        expect(a instanceof ClassA).toBeTruthy();
        expect(a.b instanceof ClassB).toBeTruthy();
        expect(a.c instanceof ClassC).toBeTruthy();
        expect(a.b.d).toBe(d);
        expect(a.c.d).toBe(d);

        done();
    });

    it('detects cyclic dependencies', done => {
        let withError;

        class ClassA {
            static get provides() {
                return 'a';
            }

            static get requires() {
                return [ 'b' ];
            }
        }

        class ClassB {
            static get provides() {
                return 'b';
            }

            static get requires() {
                return [ 'c' ];
            }
        }

        class ClassC {
            static get provides() {
                return 'c';
            }

            static get requires() {
                return withError ? [ 'b' ] : [];
            }
        }

        app.registerClass(ClassA);
        app.registerClass(ClassB);

        let get = () => {
            return app.get('a');
        };

        withError = true;
        app.registerClass(ClassC);
        expect(get).toThrow();

        withError = false;
        app.registerClass(ClassC);
        expect(get).not.toThrow();

        done();
    });
});