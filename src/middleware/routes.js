/**
 * Module-defined routes middleware
 * @module arpen/middleware/routes
 */

/**
 * Module-provided routes
 */
class Routes {
    /**
     * Create the service
     * @param {Map} modules             Loaded application modules
     */
    constructor(modules) {
        this._modules = modules;
    }

    /**
     * Service name is 'middleware.routes'
     * @type {string}
     */
    static get provides() {
        return 'middleware.routes';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'modules' ];
    }

    /**
     * Register middleware
     * @param {Express} server          The server
     * @return {Promise}
     */
    async register(server) {
        for (let router of server.routes)
            server.express.use('/', router);
    }
}

module.exports = Routes;
