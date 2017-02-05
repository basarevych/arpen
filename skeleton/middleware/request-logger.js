/**
 * HTTP request logging middleware
 * @module middleware/request-logger
 */
const morgan = require('morgan');
const RotatingFileStream = require('rotating-file-stream');

/**
 * Request logger
 */
class RequestLogger {
    /**
     * Create the service
     * @param {object} config           Configuration
     * @param {object} express          Express app
     */
    constructor(config, express) {
        this._config = config;
        this._express = express;
    }

    /**
     * Service name is 'middleware.requestLogger'
     * @type {string}
     */
    static get provides() {
        return 'middleware.requestLogger';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'config', 'express' ];
    }

    /**
     * Register middleware
     * @return {Promise}
     */
    register() {
        this._express.use(morgan('dev'));

        let logStream = RotatingFileStream('access.log', this._config.get('web_server.access_log'));
        this._express.use(morgan('combined', { stream: logStream }));

        return Promise.resolve();
    }
}

module.exports = RequestLogger;