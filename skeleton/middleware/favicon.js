/**
 * Favicon middleware
 * @module middleware/favicon
 */
const fs = require('fs');
const path = require('path');
const favicon = require('serve-favicon');

/**
 * Favicon
 */
class Favicon {
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
        return [ 'config', 'express' ];
    }

    /**
     * Register middleware
     * @return {Promise}
     */
    register() {
        for (let _module of this._config.modules) {
            for (let dir of _module.static) {
                let filename = path.join(
                    dir[0] == '/' ?
                        dir :
                        path.join(this._config.base_path, 'modules', _module.name, dir),
                    'img',
                    'favicon.ico'
                );
                try {
                    if (fs.lstatSync(filename).isFile()) {
                        this._express.use(favicon(filename));
                        break;
                    }
                } catch (error) {
                    // do nothing
                }
            }
        }

        return Promise.resolve();
    }
}

module.exports = Favicon;