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
 * Logger to use when 'logger' service is not available
 */
class AppLogger {
    error(...args) {
        console.error(...args);
    }
}

/**
 * Base application class
 */
class App {
    /**
     * Create app
     * @param {string} basePath             Base path
     * @param {object} argv                 Minimist object
     */
    constructor(basePath, argv) {
        debug('Constructing the app');
        this.basePath = basePath;
        this.argv = argv;
        this._initialized = null;
        this._running = null;
        this._container = new Map();
        this.registerInstance(this, 'app');
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
        delete service.class;
        service.instance = instance;

        return name;
    }

    /**
     * Register class function as a service
     * @param {function} classFunc          Class function
     * @return {string}                     Returns name of the service
     */
    registerClass(classFunc) {
        let name = classFunc.provides;
        if (!name)
            throw new Error('No name provided for a class');

        debug(`Registering class '${name}'`);
        let service = this._initService(name);
        service.class = classFunc;
        delete service.instance;

        return name;
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
                let logger;
                try {
                    logger = this.get('logger');
                    logger.error(new WError(error, 'App.run() failed'));
                } catch (ignore) {
                    logger = new AppLogger();
                    logger.error('App.run() failed:', error.message);
                }
                process.exit(1);
            });
    }

    /**
     * Initialize the app
     * @return {Promise}
     */
    init() {
        if (this._initialized)
            return Promise.resolve();

        debug('Initializing the app');
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
                return this._initLogger();
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
     * @return {Promise}
     */
    start() {
        return new Promise((resolve, reject) => {
            if (this._running !== null)
                return reject(new Error('Application is already started'));

            this._running = false;
            resolve();
        });
    }

    /**
     * Load the configuration
     * @return {Promise}
     */
    _initConfig() {
        let config, modules = [];
        debug('Loading application configuration');
        return Promise.all([
                this.constructor._require(path.join(this.basePath, 'config', 'global.js')),
                this.constructor._require(path.join(this.basePath, 'config', 'local.js'), {}),
            ])
            .then(([globalConf, localConf]) => {
                if (typeof globalConf != 'object')
                    throw new Error('Global config is not an object');
                if (typeof localConf!= 'object')
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
                                    if (typeof globalConf != 'object')
                                        throw new Error(`Global config is not an object (module: ${cur})`);
                                    if (typeof localConf!= 'object')
                                        throw new Error(`Local config is not an object (module: ${cur})`);

                                    let moduleConfig = merge.recursive(true, globalConf, localConf);
                                    moduleConfig.name = cur;

                                    if (!moduleConfig.autoload)
                                        moduleConfig.autoload = [];
                                    else if (!Array.isArray(moduleConfig.autoload))
                                        throw new Error(`Config.autoload is not an array (module: ${cur})`);

                                    modules.push(moduleConfig);
                                });
                        });
                    },
                    Promise.resolve()
                );
            })
            .then(() => {
                config.modules = modules;
            });
    }

    /**
     * Load the source files
     * @return {Promise}
     */
    _initSources() {
        let config = this.get('config');
        let filer = new Filer();
        debug('Loading application sources');
        return config.autoload.reduce(
                (prev, cur) => {
                    return prev.then(() => {
                        let file = cur;
                        if (cur[0] == '!')
                            file = path.join(this.basePath, 'node_modules', 'arpen', cur.slice(1));
                        else if (cur[0] != '/')
                            file = path.join(this.basePath, cur);
                        return filer.process(
                            file,
                            filename => {
                                return this.constructor._require(filename)
                                    .then(obj => {
                                        if (!obj.provides)
                                            return;

                                        try {
                                            this.registerClass(obj);
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
                return config.modules.reduce(
                    (prevModule, curModule) => {
                        return prevModule.then(() => {
                            debug(`Loading module ${curModule.name} sources`);
                            return curModule.autoload.reduce(
                                (prevLoad, curLoad) => {
                                    return prevLoad.then(() => {
                                        let file = curLoad;
                                        if (curLoad[0] == '!')
                                            file = path.join(this.basePath, 'node_modules', 'arpen', curLoad.slice(1));
                                        else if (curLoad[0] != '/')
                                            file = path.join(this.basePath, 'modules', curModule.name, curLoad);
                                        return filer.process(
                                            file,
                                            filename => {
                                                return this.constructor._require(filename)
                                                    .then(obj => {
                                                        try {
                                                            this.registerClass(obj);
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
            });
    }

    /**
     * Create log streams
     * @return {Promise}
     */
    _initLogger() {
        return new Promise((resolve, reject) => {
            try {
                let config = this.get('config');
                if (!config.logs)
                    return resolve();

                let logger = this.get('logger');
                for (let log of Object.keys(config.logs)) {
                    let info = Object.assign({}, config.logs[log]);
                    let name = info.name;
                    delete info.name;
                    let level = info.level || 'info';
                    delete info.level;
                    let isDefault = info.default || false;
                    delete info.default;
                    logger.setLogStream(name, level, isDefault, info);
                }
                resolve();
            } catch (error) {
                console.log(error);
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
                    if (result === null || typeof result != 'object' || typeof result.then != 'function')
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
     * @return {object}                     Returns service object
     */
    _initService(name) {
        if (name[name.length - 1] == '?')
            throw new Error(`Invalid service name: ${name}`);

        let service;
        if (this._container.has(name)) {
            service = this._container.get(name);
        } else {
            service = {};
            this._container.set(name, service);
        }
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
        if (name[name.length - 1] == '?') {
            name = name.slice(0, -1);
            mustExist = false;
        }

        if (!this._container.has(name)) {
            if (mustExist)
                throw new Error(`No service was found: ${name}`);
            return undefined;
        }

        let service = this._container.get(name);
        if (!service.class)
            return service.instance;

        let instance;
        if (request.has(name)) { // already resolved
            instance = request.get(name);
        } else {
            request.set(name, null); // mark as visited but not resolved yet
            switch (service.class.lifecycle || 'perRequest') {
                case 'perRequest':
                    instance = this._instantiateClass(service.class, extra, request);
                    request.set(name, instance);
                    break;
                case 'unique':
                    instance = this._instantiateClass(service.class, extra, request);
                    request.delete(name);
                    break;
                case 'singleton':
                    if (service.instance) {
                        instance = service.instance;
                    } else {
                        instance = this._instantiateClass(service.class, extra, request);
                        service.instance = instance;
                    }
                    request.set(name, instance);
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
     * @param {function} classFunc          Class function
     * @param {Array} extra                 Extra constructor arguments
     * @param {Map} request                 Resolved dependencies
     * @return {object}                     Returns instance of the class
     */
    _instantiateClass(classFunc, extra, request) {
        let args = [];
        for (let arg of classFunc.requires || [])
            args.push(this._resolveService(arg, [], request));
        args = args.concat(extra);
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
            stream.write(output, () => {
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
                    if (typeof defaultObject == 'undefined')
                        reject(new WError(err, `Could not load ${filename}`));
                    else
                        resolve(defaultObject);
                }
            });
    }
}

module.exports = App;