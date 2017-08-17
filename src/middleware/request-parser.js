/**
 * HTTP request parsing middleware
 * @module arpen/middleware/request-parser
 */
let bodyParser;
try {
    bodyParser = require('body-parser');
} catch (error) {
    // do nothing
}

let cookieParser;
try {
    cookieParser = require('cookie-parser');
} catch (error) {
    // do nothing
}

/**
 * Request parser
 * <br><br>
 * body-parser and cookie-parser modules are required
 */
class RequestParser {
    /**
     * Create the service
     * @param {object} config           Configuration
     */
    constructor(config) {
        this._config = config;

        if (!bodyParser)
            throw new Error('body-parser module is required for RequestParser middleware');
        if (!cookieParser)
            throw new Error('cookie-parser module is required for RequestParser middleware');
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
        return [ 'config' ];
    }

    /**
     * Register middleware
     * @param {Express} server          The server
     * @return {Promise}
     */
    async register(server) {
        server.express.use(bodyParser.json({
            limit: this._config.get(`servers.${server.name}.options.body_limit`),
        }));
        server.express.use(bodyParser.urlencoded({
            limit: this._config.get(`servers.${server.name}.options.body_limit`),
            extended: false,
        }));

        server.express.use(cookieParser());
    }
}

module.exports = RequestParser;
