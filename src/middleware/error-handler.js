/**
 * Error handling middleware
 * @module arpen/middleware/error
 */
const http = require('http');
const NError = require('nerror');

/**
 * Error handler
 */
class ErrorHandler {
    /**
     * Create the service
     * @param {object} config           Configuration
     * @param {Logger} logger           Logger service
     */
    constructor(config, logger) {
        this._config = config;
        this._logger = logger;
    }

    /**
     * Service name is 'middleware.errorHandler'
     * @type {string}
     */
    static get provides() {
        return 'middleware.errorHandler';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'config', 'logger' ];
    }

    /**
     * Register middleware
     * @param {Express} server          The server
     * @return {Promise}
     */
    async register(server) {
        server.express.use((req, res, next) => {
            next(new NError({ httpStatus: 404 }, 'Not Found'));
        });
        server.express.use((err, req, res, next) => {
            let status = (err.info && err.info.httpStatus) || 500;

            if (status === 500)
                this._logger.error(err);

            if (res.headersSent)
                return;

            res.locals.statusCode = status;
            res.locals.statusPhrase = http.STATUS_CODES[status];
            res.locals.data = null;
            res.locals.errors = [];
            if (this._config.get('env') === 'development' && status === 500) {
                res.locals.data = JSON.stringify(err.info || {}, undefined, 4);
                res.locals.errors = err.toArray ? err.toArray() : [ err ];
            }

            res.status(status);
            res.render('error');
        });
    }
}

module.exports = ErrorHandler;
