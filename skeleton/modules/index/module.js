/**
 * Index module
 * @module index/module
 */


/**
 * Module main class
 */
class Index {
    /**
     * Create the module
     * @param {App} app             The application
     */
    constructor(app) {
        this._app = app;
    }

    /**
     * Service name is 'modules.index'
     * @type {string}
     */
    static get provides() {
        return 'modules.index';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app' ];
    }

    /**
     * Bootstrap the module
     * @return {Promise}
     */
    bootstrap() {
        return Promise.resolve();
    }

    /**
     * Register the routes
     * @param {object} express              Express app
     * @return {Promise}
     */
    routes(express) {
        express.use('/', this._app.get('modules.index.routes.index').router);
        return Promise.resolve();
    }
}

module.exports = Index;
