/**
 * Base application
 * @module arpen/app/base
 */
const debug = require('debug')('arpen:app');
const fs = require('fs-ext');
const path = require('path');
const merge = require('merge');
const WError = require('verror').WError;
const Filer = require('../services/filer.js');

/**
 * Base application class
 */
class App {
    /**
     * Create app
     * @param {string} basePath             Base path
     * @param {string[]} argv               Arguments
     */
    constructor(basePath, argv) {
        debug('Constructing the app');
        this.basePath = basePath;
        this.argv = argv;

        this._initialized = null;
        this._running = null;
        this._container = new Map();
        this._logger = null;

        this.registerInstance(this, 'app');
    }

    /**
     * Graceful shutdown timeout
     * @type {number}
     */
    static get gracefulTimeout() {
        return 10 * 1000; // ms
    }

    /**
     * Register an instance of a service
     * @param {*} instance                  Instance
     * @param {string} name                 Name
     * @return {string}                     Returns name of the service
     */
    registerInstance(instance, name) {
        if (!name)
            throw new Error('No name provided for an instance');

        debug(`Registering instance '${name}'`);
        let service = this._initService(name);
        service.instance = instance;

        return service.provides;
    }

    /**
     * Register class function as a service
     * @param {function} classFunc          Class function
     * @param {string} [filename]           Path to the file
     * @return {string}                     Returns name of the service
     */
    registerClass(classFunc, filename) {
        let name = classFunc.provides;
        if (!name)
            throw new Error('No name provided for a class');

        debug(`Registering class '${name}'`);
        let service = this._initService(name, filename);
        service.class = classFunc;
        service.requires = classFunc.requires || [];

        return service.provides;
    }

    /**
     * Check if service is registered
     * @param {string} name                 Service name
     * @return {boolean}
     */
    has(name) {
        if (!name)
            throw new Error('No service name provided');

        return this._container.has(name);
    }

    /**
     * Get instance of a service
     * @param {string} name                 Service name
     * @param {...*} extra                  Optional extra arguments to the constructor
     * @return {object}                     Returns instance
     */
    get(name, ...extra) {
        if (!name)
            throw new Error('No service name provided');

        debug(`Retrieving service '${name}'`);
        return this._resolveService(name, extra, new Map());
    }

    /**
     * Search registered services
     * @param {RegExp} re                   Service name RegExp
     * @return {string[]}                   Returns array of matching service names
     */
    search(re) {
        debug(`Searching for services ${re}`);
        let result = [];
        for (let name of this._container.keys()) {
            if (re.test(name))
                result.push(name);
        }
        return result;
    }

    /**
     * Debug output
     * @param {...*} messages                           Messages
     */
    debug(...messages) {
        if (!(!!process.env.DEBUG))
            return Promise.resolve();

        return this._output(process.stderr, messages);
    }

    /**
     * Info output
     * @param {...*} messages                           Messages
     */
    info(...messages) {
        return this._output(process.stdout, messages);
    }

    /**
     * Error output
     * @param {...*} messages                           Messages
     */
    error(...messages) {
        return this._output(process.stderr, messages);
    }

    /**
     * Run the app. This method will simply call .init() and then .start().
     * @param {...*} args                               Descendant-specific arguments
     */
    run(...args) {
        this.init(...args)
            .then(() => {
                return this.start(...args);
            })
            .catch(error => {
                return this.error('App.run() failed:', error.message + '\n' + error.stack)
                    .then(() => {
                        process.exit(1);
                    });
            });
    }

    /**
     * Initialize the app
     * @param {...*} args                               Descendant-specific arguments
     * @return {Promise}
     */
    init(...args) {
        if (this._initialized)
            return Promise.resolve();

        debug('Initializing the app');
        let onSignal = signal => {
            if (typeof this.onSignal === 'function')
                this.onSignal(signal);
        };
        process.on('SIGINT', () => { onSignal('SIGINT'); });
        process.on('SIGTERM', () => { onSignal('SIGTERM'); });
        process.on('SIGHUP', () => { onSignal('SIGHUP'); });

        return new Promise((resolve, reject) => {
                if (this._initialized === false)
                    return reject(new Error('Application is in process of initialization'));

                this._initialized = false;
                resolve();
            })
            .then(() => {
                return this._initConfig();
            })
            .then(() => {
                return this._initSources();
            })
            .then(() => {
                return this._initModules();
            })
            .then(() => {
                this._initialized = true;
            });
    }

    /**
     * Start the app
     * @param {...*} args                               Descendant-specific arguments
     * @return {Promise}
     */
    start(...args) {
        return new Promise((resolve, reject) => {
            if (this._running !== null)
                return reject(new Error('Application is already started'));

            this._running = false;
            resolve();
        });
    }

    /**
     * Handle process signal
     * @param {string} signal                           Signal as SIGNAME
     */
    onSignal(signal) {
        if (!this._logger)
            process.exit(0);

        this._logger.info(`Terminating due to ${signal} signal`, () => { process.exit(0); });
        setTimeout(() => { process.exit(0); }, this.constructor.gracefulTimeout);
    }

    /**
     * Load the configuration
     * @return {Promise}
     */
    _initConfig() {
        let config, modules = new Map();
        debug('Loading application configuration');
        return Promise.all([
                this.constructor._require(path.join(this.basePath, 'config', 'global.js')),
                this.constructor._require(path.join(this.basePath, 'config', 'local.js'), {}),
            ])
            .then(([globalConf, localConf]) => {
                if (typeof globalConf !== 'object')
                    throw new Error('Global config is not an object');
                if (typeof localConf!== 'object')
                    throw new Error('Local config is not an object');

                config = merge.recursive(true, globalConf, localConf);
                config.base_path = this.basePath;
                config.get = function (key) {
                    return key.split('.').reduce((prev, cur) => {
                        if (!prev)
                            return prev;
                        return prev[cur];
                    }, this);
                };
                this.registerInstance(config, 'config');

                if (!config.autoload)
                    config.autoload = [];
                else if (!Array.isArray(config.autoload))
                    throw new Error('Config.autoload is not an array');

                if (!config.modules)
                    config.modules = [];
                else if (!Array.isArray(config.modules))
                    throw new Error('Config.modules is not an array');

                return config.modules.reduce(
                    (prev, cur) => {
                        return prev.then(() => {
                                debug(`Loading module ${cur} configuration`);
                                return Promise.all([
                                    this.constructor._require(
                                        path.join(this.basePath, 'modules', cur, 'config', 'global.js'),
                                        { autoload: [] }
                                    ),
                                    this.constructor._require(
                                        path.join(this.basePath, 'modules', cur, 'config', 'local.js'),
                                        {}
                                    )
                                ])
                                .then(([globalConf, localConf]) => {
                                    if (typeof globalConf !== 'object')
                                        throw new Error(`Global config is not an object (module: ${cur})`);
                                    if (typeof localConf !== 'object')
                                        throw new Error(`Local config is not an object (module: ${cur})`);

                                    let moduleConfig = merge.recursive(true, globalConf, localConf);

                                    if (!moduleConfig.autoload)
                                        moduleConfig.autoload = [];
                                    else if (!Array.isArray(moduleConfig.autoload))
                                        throw new Error(`Config.autoload is not an array (module: ${cur})`);

                                    modules.set(cur, moduleConfig);
                                });
                        });
                    },
                    Promise.resolve()
                );
            })
            .then(() => {
                config.modules = modules;

                let filer = new Filer();
                return filer.lockRead(path.join(config.base_path, 'package.json'));
            })
            .then(packageInfo => {
                let json;
                try {
                    json = JSON.parse(packageInfo);
                } catch (error) {
                    json = {};
                }
                config.version = json.version;
            });
    }

    /**
     * Load the source files
     * @return {Promise}
     */
    _initSources() {
        let config = this.get('config');
        let filer = new Filer();
        let cache = null;
        let mapFile = `arpen.${config.project}.${config.instance}.map.json`;

        debug('Loading application sources');
        return Promise.resolve()
            .then(() => {
                if (!!process.env.DEBUG)
                    return null;

                return filer.lockRead(path.join('/var/tmp', mapFile))
                    .then(
                        contents => {
                            try {
                                cache = JSON.parse(contents.trim());
                                if (typeof cache !== 'object' || cache === null || cache.version !== config.version)
                                    cache = null;
                            } catch (error) {
                                cache = null;
                            }
                        },
                        () => {
                            cache = null;
                        }
                    );
            })
            .then(() => {
                if (cache) {
                    for (let service of cache.services || []) {
                        if (typeof service.filename !== 'string' || typeof service.provides !== 'string' || !Array.isArray(service.requires))
                            continue;

                        debug(`Preloading ${service.provides}`);
                        let obj = this._initService(service.provides, service.filename);
                        obj.requires = service.requires;
                    }
                    return;
                }

                return config.autoload.reduce(
                        (prev, cur) => {
                            return prev.then(() => {
                                let file = cur;
                                if (cur[0] === '!')
                                    file = path.join(this.basePath, 'node_modules', 'arpen', cur.slice(1));
                                else if (cur[0] !== '/')
                                    file = path.join(this.basePath, cur);
                                return filer.process(
                                    file,
                                    filename => {
                                        return this.constructor._require(filename)
                                            .then(obj => {
                                                if (!obj.provides)
                                                    return;

                                                try {
                                                    this.registerClass(obj, filename);
                                                } catch (error) {
                                                    throw new WError(error, `Registering ${filename}`);
                                                }
                                            });
                                    }
                                );
                            });
                        },
                        Promise.resolve()
                    )
                    .then(() => {
                        return Array.from(config.modules).reduce(
                            (prevModule, [ curModule, curConfig ]) => {
                                return prevModule.then(() => {
                                    debug(`Loading module ${curModule} sources`);
                                    return curConfig.autoload.reduce(
                                        (prevLoad, curLoad) => {
                                            return prevLoad.then(() => {
                                                let file = curLoad;
                                                if (curLoad[0] === '!')
                                                    file = path.join(this.basePath, 'node_modules', 'arpen', curLoad.slice(1));
                                                else if (curLoad[0] !== '/')
                                                    file = path.join(this.basePath, 'modules', curModule, curLoad);
                                                return filer.process(
                                                    file,
                                                    filename => {
                                                        return this.constructor._require(filename)
                                                            .then(obj => {
                                                                try {
                                                                    this.registerClass(obj, filename);
                                                                } catch (error) {
                                                                    throw new WError(error, `Registering ${filename}`);
                                                                }
                                                            });
                                                    }
                                                );
                                            });
                                        },
                                        Promise.resolve()
                                    );
                                });
                            },
                            Promise.resolve()
                        );
                    })
                    .then(() => {
                        let map = {
                            version: config.version,
                            services: [],
                        };
                        for (let [ name, service ] of this._container) {
                            if (!service.filename)
                                continue;

                            map.services.push({
                                filename: service.filename,
                                provides: service.provides,
                                requires: service.requires || [],
                            });
                        }

                        debug('Saving class map');
                        return filer.lockWrite(path.join('/var/tmp', mapFile), JSON.stringify(map, undefined, 4) + '\n');
                    })
            });
    }

    /**
     * Create log streams
     * @return {Promise}
     */
    _initLogger() {
        let config;
        return new Promise((resolve, reject) => {
                try {
                    config = this.get('config');
                    if (!config.logs)
                        return resolve();

                    this._logger = this.get('logger');
                    for (let log of Object.keys(config.logs)) {
                        let info = Object.assign({}, config.logs[log]);
                        let filename = info.name;
                        delete info.name;
                        let level = info.level || 'info';
                        delete info.level;
                        let isDefault = info.default || false;
                        delete info.default;
                        this._logger.setLogStream(log, filename, level, isDefault, info);
                    }
                    resolve();
                } catch (error) {
                    reject(new WError(error, 'App._initLogger()'));
                }
            });
    }

    /**
     * Start modules
     * @return {Promise}
     */
    _initModules() {
        let modules = new Map();
        this.registerInstance(modules, 'modules');

        return this.search(/^modules\.[^.]+$/).reduce(
            (prev, cur) => {
                let _module = this.get(cur);
                modules.set(cur, _module);

                return prev.then(() => {
                    debug(`Bootstrapping module '${cur}'`);
                    let result = _module.bootstrap();
                    if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                        throw new Error(`Module '${cur}' bootstrap() did not return a Promise`);
                    return result;
                });
            },
            Promise.resolve()
        );
    }

    /**
     * Returns item of the service container, adding new one if it does not exist yet
     * @param {string} name                 Name of the service
     * @param {string} [filename]           Path to the class
     * @return {object}                     Returns service object
     */
    _initService(name, filename) {
        if (name[name.length - 1] === '?')
            throw new Error(`Invalid service name: ${name}`);

        let service;
        if (this._container.has(name)) {
            service = this._container.get(name);
        } else {
            service = {};
            this._container.set(name, service);
        }

        delete service.instance;
        delete service.class;
        service.provides = name;
        delete service.requires;
        if (filename)
            service.filename = filename;
        else
            delete service.filename;

        return service;
    }

    /**
     * Resolve dependencies and return an instance of a service
     * @param {string} name                 Service name
     * @param {Array} extra                 Extra constructor arguments
     * @param {Map} request                 Resolved dependencies
     * @return {object}                     Returns instance of the service
     */
    _resolveService(name, extra, request) {
        let mustExist = true;
        if (name[name.length - 1] === '?') {
            name = name.slice(0, -1);
            mustExist = false;
        }

        if (!this._container.has(name)) {
            if (mustExist)
                throw new Error(`No service was found: ${name}`);
            return undefined;
        }

        let service = this._container.get(name);
        if (service.instance)
            return service.instance;

        let instance;
        if (request.has(name)) { // already resolved
            instance = request.get(name);
        } else {
            request.set(name, null); // mark as visited but not resolved yet
            instance = this._instantiateClass(service, extra, request);
            switch (service.class.lifecycle || 'perRequest') {
                case 'perRequest':
                    request.set(name, instance);
                    break;
                case 'unique':
                    request.delete(name);
                    break;
                case 'singleton':
                    service.instance = instance;
                    request.delete(name);
                    break;
                default:
                    throw new Error(`Service '${name}' has invalid lifecycle: ${service.class.lifecycle}`);
            }
        }

        if (!instance)
            throw new Error(`Cyclic dependency while resolving '${name}'`);

        return instance;
    }

    /**
     * Instantiate given service class
     * @param {object} service              Service object
     * @param {Array} extra                 Extra constructor arguments
     * @param {Map} request                 Resolved dependencies
     * @return {object}                     Returns instance of the class
     */
    _instantiateClass(service, extra, request) {
        let args = [];
        for (let arg of service.requires || [])
            args.push(this._resolveService(arg, [], request));
        args = args.concat(extra);

        let classFunc = service.class;
        if (classFunc)
            return new classFunc(...args);

        if (!service.filename)
            throw new Error(`No class function and no filename for ${service.provides}`);

        let obj = require(service.filename);
        if (obj.provides !== service.provides)
            throw new Error(`Invalid file detected when loading ${service.provides}`);

        classFunc = service.class = obj;
        return new classFunc(...args);
    }

    /**
     * Print output
     * @param {*} stream                    Stream for output
     * @param {Array} messages              Messages
     */
    _output(stream, messages) {
        return new Promise((resolve, reject) => {
            let output = messages.join(' ');
            if (!output.length)
                return resolve();

            let onError = error => {
                reject(error);
            };

            stream.once('error', onError);
            stream.write(output + '\n', () => {
                stream.removeListener('error', onError);
                resolve();
            })
        });
    }

    /**
     * Load js file
     * @param {string} filename             Path of the file
     * @param {*} [defaultObject]           If specified this will be returned if file could not be loaded
     * @return {Promise}                    Resolves to the exported object
     */
    static _require(filename, defaultObject) {
        return new Promise((resolve, reject) => {
                try {
                    resolve(require(filename));
                } catch (err) {
                    if (typeof defaultObject === 'undefined')
                        reject(new WError(err, `Could not load ${filename}`));
                    else
                        resolve(defaultObject);
                }
            });
    }
}

module.exports = App;