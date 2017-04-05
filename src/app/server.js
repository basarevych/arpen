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

                for (let name of names) {
                    let params = config.get(`servers.${name}`);
                    if (!params)
                        throw new Error(`Server ${name} not found in config`);

                    let server = this.get(params.class);
                    if (!server)
                        throw new Error(`Service ${params.class} not found when initializing server ${name}`);
                    servers.set(name, server);
                }

                return names.reduce(
                    (prev, name) => {
                        return prev.then(() => {
                            let server = servers.get(name);
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
     * @param {...*} names                               Server names
     * @return {Promise}
     */
    start(...names) {
        return super.start(...names)
            .then(() => {
                let config = this.get('config');
                let servers = this.get('servers');

                return names.reduce(
                    (prev, name) => {
                        return prev.then(() => {
                            let server = servers.get(name);
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
}

module.exports = Server;