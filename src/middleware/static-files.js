/**
 * Static files middleware
 * @module arpen/middleware/static-files
 */
let express;
try {
    express = require('express');
} catch (error) {
    // do nothing
}

const path = require('path');

/**
 * Module-provided static files
 * <br><br>
 * express module is required
 */
class StaticFiles {
    /**
     * Create the service
     * @param {object} config           Configuration
     */
    constructor(config) {
        this._config = config;

        if (!express)
            throw new Error('express module is required for StaticFiles middleware');
    }

    /**
     * Service name is 'middleware.staticFiles'
     * @type {string}
     */
    static get provides() {
        return 'middleware.staticFiles';
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
        for (let [ moduleName, moduleConfig ] of this._config.modules) {
            for (let dir of moduleConfig.static || []) {
                let filename = dir[0] === '/'
                    ? dir
                    : path.join(this._config.base_path, 'modules', moduleName, dir);
                server.express.use(express.static(filename));
            }
        }
    }
}

module.exports = StaticFiles;
