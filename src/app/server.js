/**
 * Server application
 * @module arpen/app/server
 */
const debug = require('debug')('arpen:app');
const path = require('path');
const App = require('./base');

/**
 * Server application class
 * @extends module:arpen/app/base~App
 */
class Server extends App {
    /**
     * Create app
     * @param {string} basePath             Base path
     * @param {string[]} argv               Arguments
     */
    constructor(basePath, argv) {
        super(basePath, argv);

        this._started = new Set();
    }

    /**
     * Initialize the app
     * @param {object} options                          App.run() options
     * @param {...string} names                         Server names
     * @return {Promise}
     */
    init(options, ...names) {
        return super.init(options, ...names)
            .then(() => {
                let config = this.get('config');
                let servers = new Map();
                this.registerInstance(servers, 'servers');

                for (let name of names) {
                    let params = config.get(`servers.${name}`);
                    if (!params)
                        throw new Error(`Server ${name} not found in config`);

                    debug(`Creating server ${name} as '${params.class}'`);
                    let server = this.get(params.class);
                    if (!server)
                        throw new Error(`Service ${params.class} not found when initializing server ${name}`);
                    servers.set(name, server);
                }

                return names.reduce(
                    (prev, name) => {
                        return prev.then(() => {
                            let server = servers.get(name);
                            if (!server || typeof server.init !== 'function')
                                return;

                            let result = server.init(name);
                            if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                                throw new Error(`Server '${name}' init() did not return a Promise`);
                            return result;
                        });
                    },
                    Promise.resolve()
                );
            });
    }

    /**
     * Start the app
     * @param {object} options                          App.run() options
     * @param {...*} names                               Server names
     * @return {Promise}
     */
    start(options, ...names) {
        return super.start(options, ...names)
            .then(() => {
                let config = this.get('config');
                let servers = this.get('servers');

                return names.reduce(
                    (prev, name) => {
                        return prev.then(() => {
                            let server = servers.get(name);
                            if (!server || typeof server.start !== 'function')
                                return;

                            this._started.add(name);

                            let result = server.start(name);
                            if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                                throw new Error(`Server '${name}' start() did not return a Promise`);
                            return result;
                        });
                    },
                    Promise.resolve()
                );
            })
            .then(() => {
                let config = this.get('config');
                if (config.get('user')) {
                    process.setuid(config.get('user.uid'));
                    process.setgid(config.get('user.gid'));
                }
                this._running = true;
            });
    }

    /**
     * Stop the app
     * @param {object} options                          App.run() options
     * @param {...*} names                               Server names
     * @return {Promise}
     */
    stop(options, ...names) {
        return Promise.resolve()
            .then(() => {
                let servers = this.get('servers');
                return names.reverse().reduce(
                    (prev, name) => {
                        return prev.then(() => {
                            let server = servers.get(name);
                            if (!server || typeof server.stop !== 'function')
                                return;

                            let result = server.stop(name);
                            if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                                throw new Error(`Server '${name}' stop() did not return a Promise`);
                            return result;
                        });
                    },
                    Promise.resolve()
                );
            })
            .then(() => {
                return super.stop(options, ...names);
            });
    }

    /**
     * Handle process signal
     * @param {string} signal                           Signal as SIGNAME
     */
    onSignal(signal) {
        let names = Array.from(this._started);
        this._started.clear();
        this.stop(names)
            .then(
                () => {
                    super.onSignal(signal);
                },
                error => {
                    try {
                        let logger = this.get('logger');
                        logger.error(error, () => { super.onSignal(signal); });
                    } catch (error) {
                        super.onSignal(signal);
                    }
                }
            );
    }
}

module.exports = Server;