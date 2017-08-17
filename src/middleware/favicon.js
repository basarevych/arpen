/**
 * Favicon middleware
 * @module arpen/middleware/favicon
 */
let favicon;
try {
    favicon = require('serve-favicon');
} catch (error) {
    // do nothing
}

const fs = require('fs');
const path = require('path');

/**
 * Favicon
 * <br><br>
 * serve-favicon module is required
 */
class Favicon {
    /**
     * Create the service
     * @param {object} config           Configuration
     */
    constructor(config) {
        this._config = config;

        if (!favicon)
            throw new Error('serve-favicon module is required for Favicon middleware');
    }

    /**
     * Service name is 'middleware.favicon'
     * @type {string}
     */
    static get provides() {
        return 'middleware.favicon';
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
                let filename = path.join(
                    dir[0] === '/'
                        ? dir
                        : path.join(this._config.base_path, 'modules', moduleName, dir),
                    'img',
                    'favicon.ico'
                );
                try {
                    if (fs.lstatSync(filename).isFile()) {
                        server.express.use(favicon(filename));
                        return;
                    }
                } catch (error) {
                    // do nothing
                }
            }
        }
    }
}

module.exports = Favicon;
