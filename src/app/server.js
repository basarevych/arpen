/**
 * Server application
 * @module arpen/app/server
 */
const debug = require('debug')('arpen:app');
const App = require('./base');
const fs = require('fs');
const path = require('path');

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
        this._startedServers = new Set();

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

        let logger = this.get('logger');
        await new Promise(resolve => {
            logger.info(`${config.name} v${config.version}`, resolve);
        });

        let modules = this.get('modules');
        return names.reduce(
            async (prev, name) => {
                await prev;

                let server = servers.get(name);
                if (!server || typeof server.init !== 'function')
                    return;

                let result = server.init(name);
                if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                    throw new Error(`Server '${name}' init() did not return a Promise`);
                await result;

                return Array.from(modules).reduce(
                    async (prev, [name, _module]) => {
                        await prev;

                        if (typeof _module.register !== 'function')
                            return;

                        let result = _module.register(server);
                        if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                            throw new Error(`Module '${name}' register() did not return a Promise`);
                        return result;
                    },
                    Promise.resolve()
                );
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

        let servers = this.get('servers');
        await names.reduce(
            async (prev, name) => {
                await prev;

                let server = servers.get(name);
                if (!server || typeof server.start !== 'function') {
                    this._startedServers.add(name);
                    return;
                }

                let result = server.start(name);
                if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                    throw new Error(`Server '${name}' start() did not return a Promise`);
                await result;
                this._startedServers.add(name);
            },
            Promise.resolve()
        );

        let config = this.get('config');
        if (config.get('user') && process.getuid() === 0) {
            let uid = config.get('user.gid');
            let gid = config.get('user.uid');

            for (let log of Object.keys(config.logs)) {
                let filename = path.join(config.logs[log].path, config.logs[log].name);
                try {
                    fs.chownSync(filename, uid, gid);
                } catch (error) {
                    // do nothing
                }
            }

            try {
                if (this._mapFile)
                    fs.chownSync(path.join('/var/tmp', this._mapFile), uid, gid);
            } catch (error) {
                // do nothing
            }

            if (gid)
                process.setgid(gid);
            process.setuid(uid);
        }
    }

    /**
     * Stop the app
     * @param {...*} names                               Server names
     * @return {Promise}
     */
    async stop(...names) {
        await super.stop(...names);

        let servers = this.get('servers');
        await names.reverse().reduce(
            async (prev, name) => {
                await prev;

                if (!this._startedServers.has(name))
                    return;

                let server = servers.get(name);
                if (!server || typeof server.stop !== 'function') {
                    this._startedServers.delete(name);
                    return;
                }

                let result = server.stop(name);
                if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                    throw new Error(`Server '${name}' stop() did not return a Promise`);
                await result;
                this._startedServers.delete(name);
            },
            Promise.resolve()
        );
    }

    /**
     * Terminate the app. Will call .stop() with start args
     * @param {number} code=0                       Exit code, default is 0
     * @param {string} [message]                    Exit log message
     * @return {Promise}
     */
    async exit(code = 0, message) {
        let finish = async () => {
            return new Promise(() => {
                try {
                    let logger = this.get('logger');
                    let func = (code ? logger.error : logger.info);
                    func.call(
                        logger,
                        message || `Terminating with code ${code}`,
                        () => {
                            process.exit(code);
                        }
                    );
                } catch (error) {
                    process.exit(code);
                }
            });
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
}

module.exports = Server;
