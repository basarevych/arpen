/**
 * Static files middleware
 * @module middleware/static-files
 */
const path = require('path');
const express = require('express');

/**
 * Module-provided static files
 */
class StaticFiles {
    /**
     * Create the service
     * @param {object} config           Configuration
     * @param {object} _express         Express app
     */
    constructor(config, _express) {
        this._config = config;
        this._express = _express;
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
        return [ 'config', 'express' ];
    }

    /**
     * Register middleware
     * @return {Promise}
     */
    register() {
        for (let _module of this._config.modules) {
            for (let dir of _module.static) {
                let filename = dir[0] == '/' ?
                    dir :
                    path.join(this._config.base_path, 'modules', _module.name, dir);
                this._express.use(express.static(filename));
            }
        }
        return Promise.resolve();
    }
}

module.exports = StaticFiles;