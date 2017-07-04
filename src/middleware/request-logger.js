/**
 * HTTP request logging middleware
 * @module arpen/middleware/request-logger
 */
let morgan;
try {
    morgan = require('morgan');
} catch (error) {
    // do nothing
}

/**
 * Request logger
 * <br><br>
 * morgan module is required
 */
class RequestLogger {
    /**
     * Create the service
     * @param {App} app                 Application
     * @param {object} config           Configuration
     * @param {object} logStreams       Log streams
     */
    constructor(app, config, logStreams) {
        this._app = app;
        this._config = config;
        this._logStreams = logStreams;

        if (!morgan)
            throw new Error('morgan module is required for RequestLogger middleware');
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
        return [ 'app', 'config', 'logger.streamContainer' ];
    }

    /**
     * Register middleware
     * @param {Express} server          The server
     * @return {Promise}
     */
    register(server) {
        server.express.use(morgan('dev'));
        server.express.use(morgan('combined', { stream: this._logStreams.logs.get('access').stream }));

        return Promise.resolve();
    }
}

module.exports = RequestLogger;