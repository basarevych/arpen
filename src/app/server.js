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
     * @return {Promise}
     */
    init() {
        this.name = this.argv['_'][0];
        return super.init()
            .then(() => {
                let config = this.get('config');
                let params = config.get(`servers.${this.name}`);
                if (!params)
                    throw new Error(`Server ${this.name} not found in config`);

                return this._initSubscribers(params.subscribers ? params.subscribers : [])
                    .then(() => {
                        let server = this.get(params.class);
                        if (!server)
                            throw new Error(`Service ${params.class} not found when creating server ${this.name}`);
                        let result = server.bootstrap(this.name);
                        if (result === null || typeof result != 'object' || typeof result.then != 'function')
                            throw new Error(`Server '${params.class}' bootstrap() did not return a Promise`);
                        return result;
                    });
            })
    }

    /**
     * Start the app
     * @return {Promise}
     */
    start() {
        let config = this.get('config');
        return super.start()
            .then(() => {
                let params = config.get(`servers.${this.name}`);
                if (!params)
                    throw new Error(`Server ${this.name} not found in config`);

                let server = this.get(params.class);
                if (!server)
                    throw new Error(`Service ${params.class} not found when starting server ${this.name}`);

                let result = server.start();
                if (result === null || typeof result != 'object' || typeof result.then != 'function')
                    throw new Error(`Server '${params.class}' start() did not return a Promise`);
                return result;
            })
            .then(() => {
                if (config.get('user')) {
                    process.setuid(config.get('user.uid'));
                    process.setgid(config.get('user.gid'));
                }
                this._running = true;
            });
    }
}

module.exports = Server;