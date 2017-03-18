/**
 * Server application
 * @module arpen/app/server
 */
const debug = require('debug')('arpen:app');
const path = require('path');
const App = require('./base');
const WError = require('verror').WError;

/**
 * Server application class
 * @extends module:arpen/app/base~App
 */
class Server extends App {
    /**
     * Initialize the app
     * @param {...string} names                         Server names
     * @return {Promise}
     */
    init(...names) {
        return super.init()
            .then(() => {
                return this._initLogger();
            })
            .then(() => {
                let config = this.get('config');
                let servers = new Map();
                this.registerInstance(servers, 'servers');

                let promises = [];
                for (let name of names) {
                    let params = config.get(`servers.${name}`);
                    if (!params)
                        throw new Error(`Server ${name} not found in config`);

                    let server = this.get(params.class);
                    if (!server)
                        throw new Error(`Service ${params.class} not found when initializing server ${name}`);
                    servers.set(name, server);

                    let result = server.init(name);
                    if (result === null || typeof result != 'object' || typeof result.then != 'function')
                        throw new Error(`Server '${name}' init() did not return a Promise`);
                    promises.push(result);
                }

                return Promise.all(promises);
            })
    }

    /**
     * Start the app
     * @param {...*} args                               Server names
     * @return {Promise}
     */
    start(...args) {
        return super.start(...args)
            .then(() => {
                let config = this.get('config');
                return this._initSubscribers(config.get('subscribers') || []);
            })
            .then(() => {
                let config = this.get('config');
                let servers = this.get('servers');

                return args.reduce(
                    (prev, name) => {
                        return prev.then(() => {
                            let server = servers.get(name);
                            let result = server.start(name);
                            if (result === null || typeof result != 'object' || typeof result.then != 'function')
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
     * Start subscribers
     * @param {string[]} names              Subscribers list
     * @return {Promise}
     */
    _initSubscribers(names) {
        let subscribers = new Map();
        this.registerInstance(subscribers, 'subscribers');

        return names.reduce(
            (prev, cur) => {
                let subscriber = this.get(cur);
                subscribers.set(cur, subscriber);

                return prev.then(() => {
                    debug(`Registering subscriber '${cur}'`);
                    let result = subscriber.register();
                    if (result === null || typeof result != 'object' || typeof result.then != 'function')
                        throw new Error(`Subscriber '${cur}' register() did not return a Promise`);
                    return result;
                });
            },
            Promise.resolve()
        );
    }
}

module.exports = Server;