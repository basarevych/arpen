/**
 * Server application
 * @module arpen/app/server
 */
const debug = require('debug')('arpen:app');
const App = require('./base');

/**
 * @extends module:arpen/app/base~App
 *
 * Server application class
 * <br><br>
 * This implementation will read server class names from the supplied arguments, instantiate and start them
 */
class Server extends App {
    /**
     * Initialize the app
     * @param {...*} names                              Server names
     * @return {Promise}
     */
    async init(...names) {
        await super.init(...names);

        let servers = new Map();
        this.registerInstance(servers, 'servers');

        let config = this.get('config');
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
            async (prev, name) => {
                await prev;

                let server = servers.get(name);
                if (!server || typeof server.init !== 'function')
                    return;

                let result = server.init(name);
                if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                    throw new Error(`Server '${name}' init() did not return a Promise`);
                return result;
            },
            Promise.resolve()
        );
    }

    /**
     * Start the app
     * @param {...*} names                               Server names
     * @return {Promise}
     */
    async start(...names) {
        await super.start(...names);

        this._startedServers = [];
        let servers = this.get('servers');
        await names.reduce(
            async (prev, name) => {
                await prev;

                let server = servers.get(name);
                if (!server || typeof server.start !== 'function') {
                    this._startedServers.push(name);
                    return;
                }

                let result = server.start(name);
                if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                    throw new Error(`Server '${name}' start() did not return a Promise`);
                await result;
                this._startedServers.push(name);
            },
            Promise.resolve()
        );

        let config = this.get('config');
        if (config.get('user')) {
            process.setuid(config.get('user.uid'));
            process.setgid(config.get('user.gid'));
        }

        this._running = true;
    }

    /**
     * Stop the app
     * @param {...*} names                               Server names
     * @return {Promise}
     */
    async stop(...names) {
        if (this._running === null)
            throw new Error('Application has not been started');

        let servers = this.get('servers');
        await names.reverse().reduce(
            async (prev, name) => {
                await prev;

                if (!this._startedServers.includes(name))
                    return;

                let server = servers.get(name);
                if (!server || typeof server.stop !== 'function')
                    return;

                let result = server.stop(name);
                if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                    throw new Error(`Server '${name}' stop() did not return a Promise`);
                return result;
            },
            Promise.resolve()
        );

        this._running = false;

        return super.stop(...names);
    }
}

module.exports = Server;
