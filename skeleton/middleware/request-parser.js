/**
 * HTTP request parsing middleware
 * @module middleware/request-parser
 */
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

/**
 * Request parser
 */
class RequestParser {
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
     * Service name is 'middleware.requestParser'
     * @type {string}
     */
    static get provides() {
        return 'middleware.requestParser';
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
        this._express.use(bodyParser.json({
            limit: this._config.get('web_server.options.body_limit'),
        }));
        this._express.use(bodyParser.urlencoded({
            limit: this._config.get('web_server.options.body_limit'),
            extended: false,
        }));

        this._express.use(cookieParser());

        return Promise.resolve();
    }
}

module.exports = RequestParser;