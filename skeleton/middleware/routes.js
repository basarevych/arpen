/**
 * Module-defined routes middleware
 * @module middleware/routes
 */

/**
 * Module-provided routes
 */
class Routes {
    /**
     * Create the service
     * @param {Map} modules             Loaded application modules
     * @param {object} express          Express app
     */
    constructor(modules, express) {
        this._modules = modules;
        this._express = express;
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
        return [ 'modules', 'express' ];
    }

    /**
     * Register middleware
     * @return {Promise}
     */
    register() {
        return Array.from(this._modules).reduce(
            (prev, [ curName, curModule ]) => {
                return prev.then(() => {
                    let result = curModule.routes(this._express);
                    if (result === null || typeof result != 'object' || typeof result.then != 'function')
                        throw new Error(`Module '${curName}' routes() did not return a Promise`);
                    return result;
                });
            },
            Promise.resolve()
        );
    }
}

module.exports = Routes;