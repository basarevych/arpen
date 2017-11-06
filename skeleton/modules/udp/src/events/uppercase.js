/**
 * Uppercase event
 * @module udp/events/uppercase
 */
const NError = require('nerror');
const Base = require('./base');

/**
 * Uppercase event class
 */
class Uppercase extends Base {
    /**
     * Create service
     * @param {App} app                                 The application
     * @param {object} config                           Configuration
     * @param {Logger} logger                           Logger service
     */
    constructor(app, config, logger) {
        super(app);
        this._config = config;
        this._logger = logger;
    }

    /**
     * Service name is 'udp.events.uppercase'
     * @type {string}
     */
    static get provides() {
        return 'udp.events.uppercase';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return ['app', 'config', 'logger'];
    }

    /**
     * Event name
     * @type {string}
     */
    get name() {
        return 'uppercase';
    }

    /**
     * Event handler
     * @param {object} info         rinfo as in dgram
     * @param {object} message      The message
     */
    async handle(info, message) {
        this._logger.debug('uppercase', `Got UPPERCASE from ${info.address}:${info.port}`);
        try {
            await this.udp.send(info.port, info.address, Buffer.from(message.toUpperCase()));
        } catch (error) {
            this._logger.error(new NError(error, 'Uppercase.handle()'));
        }
    }
}

module.exports = Uppercase;
