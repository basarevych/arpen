/**
 * UDP server
 * @module servers/udp
 */
const dgram = require('dgram');
const EventEmitter = require('events');
const NError = require('nerror');

/**
 * Server class
 */
class Udp extends EventEmitter {
    /**
     * Create the service
     * @param {App} app                             Application
     * @param {object} config                       Configuration
     * @param {Logger} logger                       Logger service
     */
    constructor(app, config, logger) {
        super();

        this.server = null;

        this._name = null;
        this._app = app;
        this._config = config;
        this._logger = logger;
        this._listening = false;
    }

    /**
     * Service name is 'servers.udp'
     * @type {string}
     */
    static get provides() {
        return 'servers.udp';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'config', 'logger' ];
    }

    /**
     * Initialize the server
     * @param {string} name                     Config section name
     * @return {Promise}
     */
    async init(name) {
        this._name = name;

        try {
            this.server = dgram.createSocket('udp4');
            this.server.on('error', this.onError.bind(this));
            this.server.on('listening', this.onListening.bind(this));
            this.server.on('message', this.onMessage.bind(this));
        } catch (error) {
            return this._app.exit(
                this._app.constructor.fatalExitCode,
                error.messages || error.message
            );
        }
    }

    /**
     * Start the server
     * @param {string} name                     Config section name
     * @return {Promise}
     */
    async start(name) {
        if (name !== this._name)
            throw new Error(`Server ${name} was not properly initialized`);

        try {
            await Array.from(this._app.get('modules')).reduce(
                async (prev, [curName, curModule]) => {
                    await prev;

                    if (!curModule.register)
                        return;

                    let result = curModule.register(name);
                    if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                        throw new Error(`Module '${curName}' register() did not return a Promise`);
                    return result;
                },
                Promise.resolve()
            );

            this._logger.debug('udp', 'Starting the server');
            await new Promise((resolve, reject) => {
                try {
                    let port = this._config.get(`servers.${name}.port`);
                    let host = this._config.get(`servers.${name}.host`);

                    this.server.once('listening', () => {
                        this._listening = true;
                        this._logger.info(`UDP server is longer listening on ${host}:${port}`, resolve);
                    });
                    this.server.bind(port, host);
                } catch (error) {
                    reject(error);
                }
            });
        } catch (error) {
            return this._app.exit(
                this._app.constructor.fatalExitCode,
                error.messages || error.message
            );
        }
    }

    /**
     * Stop the server
     * @param {string} name                     Config section name
     * @return {Promise}
     */
    async stop(name) {
        if (name !== this._name)
            throw new Error(`Server ${name} was not properly initialized`);

        try {
            this._logger.debug('udp', 'Stopping the server');
            if (this._listening) {
                await new Promise(resolve => {
                    this.server.once('close', () => {
                        this._listening = false;
                        this._logger.info('UDP server is no longer listening', resolve);
                    });
                    this.server.close();
                });
            }
        } catch (error) {
            return this._app.exit(
                this._app.constructor.fatalExitCode,
                error.messages || error.message
            );
        }
    }

    /**
     * Send a message
     * @param {number} port             Port
     * @param {string} host             Host
     * @param {Buffer} data             The message
     */
    async send(port, host, data) {
        return new Promise(resolve => {
            this.server.send(data, port, host, resolve);
        });
    }

    /**
     * Error handler
     * @param {object} error            The error
     */
    onError(error) {
        if (error.syscall !== 'listen')
            return this._logger.error(new NError(error, 'Udp.onError()'));

        let msg;
        switch (error.code) {
            case 'EACCES':
                msg = 'Could not bind to UDP port';
                break;
            case 'EADDRINUSE':
                msg = 'UDP port is already in use';
                break;
            default:
                msg = error;
        }
        return this._app.exit(this._app.constructor.fatalExitCode, msg);
    }

    /**
     * Listening event handler
     */
    onListening() {
    }

    /**
     * UDP message from client
     * @param {Buffer} data                 The message
     * @param {object} info                 Info
     */
    onMessage(data, info) {
        this._logger.debug('udp', `Got message from ${info.address}:${info.port}`);

        if (!data.length)
            return;

        let params = data.toString().split(' ');
        let command = params.shift();
        try {
            switch (command) {
                case 'uppercase':
                    this.emit('uppercase', info, params.join(' '));
                    break;
            }
        } catch (error) {
            this._logger.error(new NError(error, 'Udp.onMessage()'));
        }
    }
}

module.exports = Udp;
