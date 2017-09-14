/**
 * Base application
 * @module arpen/app/base
 */
const debug = require('debug')('arpen:app');
const path = require('path');
const merge = require('merge');
const NError = require('nerror');
const Filer = require('../services/filer.js');

/**
 * Base application class
 * <br><br>
 * Main purpose is DI container with class autoloading through configuration files.
 */
class App {
    /**
     * Create app
     * @param {string} basePath             Path to the root of the project
     * @param {string[]} argv               Command line arguments
     */
    constructor(basePath, argv) {
        debug('Constructing the app');
        this.basePath = basePath;
        this.argv = argv;
        this.options = {};

        this._container = new Map();
        this.registerInstance(this, 'app');
    }

    /**
     * Fatal error exit code
     * @type {number}
     */
    static get fatalExitCode() {
        return 255;
    }

    /**
     * Graceful shutdown timeout
     * @type {number}
     */
    static get gracefulTimeout() {
        return 60 * 1000; // ms
    }

    /**
     * Catched signals
     * @type {string[]}
     */
    static get signals() {
        return ['SIGINT', 'SIGTERM', 'SIGHUP'];
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
     * @return {Promise}
     */
    async debug(...messages) {
        if (!process.env.DEBUG)
            return;

        return this._output(process.stderr, messages);
    }

    /**
     * Info output
     * @param {...*} messages                           Messages
     * @return {Promise}
     */
    async info(...messages) {
        return this._output(process.stdout, messages);
    }

    /**
     * Error output
     * @param {...*} messages                           Messages
     * @return {Promise}
     */
    async error(...messages) {
        return this._output(process.stderr, messages);
    }

    /**
     * Run the app. This method will simply call .init() and then .start().
     * @param {object} [options]                                Arpen options
     * @param {boolean} [options.disableServicesCache=false]    When true services cache will not be used
     * @param {boolean] [options.interceptConsole=true]         Redirect console.log(), etc. to default logger
     * @param {...*} args                                       Descendant class specific arguments
     * @return {Promise}
     */
    async run(options, ...args) {
        let {
            disableServicesCache = false,
            interceptConsole = true,
        } = options || {};
        this.options = { disableServicesCache, interceptConsole };

        try {
            await this.init(...args);
            await this.start(...args);
        } catch (error) {
            await this.error('Fatal: ' + (error.fullStack || error.stack || error.message || error));
            process.exit(this.constructor.fatalExitCode);
        }
    }

    /**
     * Terminate the app. Will call .stop() with start args
     * @param {number} code=0                       Exit code, default is 0
     * @param {string} [message]                    Exit log message
     * @return {Promise}
     */
    async exit(code = 0, message) {
        let finish = async () => {
            try {
                if (message) {
                    if (code)
                        await this.error(message);
                    else
                        await this.info(message);
                }
            } catch (error) {
                // do nothing
            }
            process.exit(code);
        };

        if (this.constructor.gracefulTimeout)
            setTimeout(finish, this.constructor.gracefulTimeout);

        try {
            let args = this._startArgs || [];
            await this.stop(...args);
        } catch (error) {
            await this.error('Fatal: ' + (error.fullStack || error.stack || error.message || error));
        }

        await finish();
    }

    /**
     * Initialize the app
     * @param {...*} args                               Descendant class specific arguments
     * @return {Promise}
     */
    async init(...args) {
        let onSignal = async signal => {
            try {
                if (typeof this.onSignal === 'function')
                    await this.onSignal(signal);
            } catch (error) {
                await this.error('App.onSignal(): ' + (error.fullStack || error.stack || error.message || error));
                process.exit(this.constructor.fatalExitCode);
            }
        };

        for (let signal of this.constructor.signals)
            process.on(signal, async () => { return onSignal(signal); });

        debug('Initializing the app');
        await this._initConfig();
        await this._initSources();
        await this._initModules();
    }

    /**
     * Start the app. Should be overridden.
     * <br><br>
     * Descendant must call this (parent) method and start the app
     * @param {...*} args                               Descendant class specific arguments
     * @return {Promise}
     */
    async start(...args) {
        this._startArgs = args;
    }

    /**
     * Stop the app. Should be overridden.
     * <br><br>
     * Descendant must call this (parent) method and stop the app
     * @param {...*} args                               Descendant-specific arguments
     * @return {Promise}
     */
    async stop(...args) {
    }

    /**
     * Handle process signal
     * @param {string} signal                           Signal as SIGNAME
     * @return {Promise}
     */
    async onSignal(signal) {
        return this.exit(0, `Terminating due to ${signal} signal`);
    }

    /**
     * Load the configuration
     * @return {Promise}
     */
    async _initConfig() {
        debug('Loading application configuration');
        let [globalConf, localConf] = await Promise.all([
            this.constructor._require(path.join(this.basePath, 'config', 'global.js')),
            this.constructor._require(path.join(this.basePath, 'config', 'local.js'), {}),
        ]);
        if (typeof globalConf !== 'object')
            throw new Error('Global config is not an object');
        if (typeof localConf !== 'object')
            throw new Error('Local config is not an object');

        let modules = new Map();
        let config = merge.recursive(true, globalConf, localConf);
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

        await config.modules.reduce(
            async (prev, cur) => {
                await prev;

                debug(`Loading module ${cur} configuration`);
                let [globalConf, localConf] = await Promise.all([
                    this.constructor._require(
                        path.join(this.basePath, 'modules', cur, 'config', 'global.js'),
                        {}
                    ),
                    this.constructor._require(
                        path.join(this.basePath, 'modules', cur, 'config', 'local.js'),
                        {}
                    )
                ]);
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
            },
            Promise.resolve()
        );

        config.modules = modules;

        let filer = new Filer();
        let packageInfo = await filer.lockRead(path.join(config.base_path, 'package.json'));
        let json;
        try {
            json = JSON.parse(packageInfo);
        } catch (error) {
            json = {};
        }
        config.name = json.name;
        config.version = json.version;
    }

    /**
     * Load the source files
     * @return {Promise}
     */
    async _initSources() {
        debug('Loading application sources');
        let filer = new Filer();
        let config = this.get('config');
        let mapFile = `${config.project}.${config.instance}.map.json`;

        let cache = null;
        if (!process.env.DEBUG && !this.options.disableServicesCache) {
            try {
                let contents = await filer.lockRead(path.join('/var/tmp', mapFile));
                cache = JSON.parse(contents.trim());
                if (typeof cache !== 'object' || cache === null || cache.version !== config.version)
                    cache = null;
            } catch (error) {
                // do nothing
            }
        }

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

        await config.autoload.reduce(
            async (prev, cur) => {
                await prev;

                let file = cur;
                if (cur[0] === '!')
                    file = path.join(this.basePath, 'node_modules', cur.slice(1));
                else if (cur[0] !== '/')
                    file = path.join(this.basePath, cur);

                await filer.process(
                    file,
                    async filename => {
                        let obj = await this.constructor._require(filename);
                        if (!obj.provides)
                            return;

                        try {
                            this.registerClass(obj, filename);
                        } catch (error) {
                            throw new NError(error, `Registering ${filename}`);
                        }
                    }
                );
            },
            Promise.resolve()
        );

        await Array.from(config.modules).reduce(
            async (prevModule, [ curModule, curConfig ]) => {
                await prevModule;

                debug(`Loading module ${curModule} sources`);
                await curConfig.autoload.reduce(
                    async (prevLoad, curLoad) => {
                        await prevLoad;

                        let file = curLoad;
                        if (curLoad[0] === '!')
                            file = path.join(this.basePath, 'modules', curModule, 'node_modules', curLoad.slice(1));
                        else if (curLoad[0] !== '/')
                            file = path.join(this.basePath, 'modules', curModule, curLoad);

                        await filer.process(
                            file,
                            async filename => {
                                let obj = await this.constructor._require(filename);

                                try {
                                    this.registerClass(obj, filename);
                                } catch (error) {
                                    throw new NError(error, `Registering ${filename}`);
                                }
                            }
                        );
                    },
                    Promise.resolve()
                );
            },
            Promise.resolve()
        );

        let map = {
            version: config.version,
            services: [],
        };
        for (let service of this._container.values()) {
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
    }

    /**
     * Create modules
     * @return {Promise}
     */
    async _initModules() {
        let modules = new Map();
        this.registerInstance(modules, 'modules');

        for (let name of this.search(/^modules\.[^.]+$/))
            modules.set(name, this.get(name));

        await Array.from(modules.keys()).reduce(
            async (prev, cur) => {
                await prev;

                let _module = modules.get(cur);
                if (typeof _module.bootstrap !== 'function')
                    return;

                debug(`Bootstrapping module '${cur}'`);
                let result = _module.bootstrap();
                if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                    throw new Error(`Module '${cur}' bootstrap() did not return a Promise`);
                return result;
            },
            Promise.resolve()
        );
    }

    /**
     * Initialize as empty and return the item of service container, adding new one if it does not exist yet
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

        let ClassFunc = service.class;
        if (ClassFunc)
            return new ClassFunc(...args);

        if (!service.filename)
            throw new Error(`No class function and no filename for ${service.provides}`);

        let obj = require(service.filename);
        if (obj.provides !== service.provides)
            throw new Error(`Invalid file detected when loading ${service.provides}`);

        ClassFunc = service.class = obj;
        return new ClassFunc(...args);
    }

    /**
     * Print output
     * @param {*} stream                    Stream for output
     * @param {Array} messages              Messages
     * @return {Promise}
     */
    async _output(stream, messages) {
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
            });
        });
    }

    /**
     * Load js file
     * @param {string} filename             Path of the file
     * @param {*} [defaultObject]           If specified this will be returned if file could not be loaded
     * @return {Promise}                    Resolves to the exported object
     */
    static async _require(filename, defaultObject) {
        return new Promise((resolve, reject) => {
            try {
                resolve(require(filename));
            } catch (error) {
                if (typeof defaultObject === 'undefined')
                    reject(new NError(error, `Could not load ${filename}`));
                else
                    resolve(defaultObject);
            }
        });
    }
}

module.exports = App;
