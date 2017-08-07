/**
 * Base class for repositories
 * @module arpen/repositories/base
 */
const path = require('path');
const fs = require('fs');
const NError = require('nerror');

/**
 * Repository base class
 */
class BaseRepository {
    /**
     * Create repository
     * @param {App} app                             The application
     * @param {Postgres} postgres                   Postgres service
     * @param {Cacher} cacher                       Cacher service
     * @param {Util} util                           Util service
     */
    constructor(app, postgres, cacher, util) {
        this._app = app;
        this._postgres = postgres;
        this._cacher = cacher;
        this._util = util;

        this._loadMethods(path.join(__dirname, 'base'));
    }

    /**
     * Service name is 'repositories.base'
     * @type {string}
     */
    static get provides() {
        return 'repositories.base';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'postgres', 'cacher', 'util' ];
    }

    /**
     * DB table name - override it
     * @type {string}
     */
    static get table() {
        return 'base';
    }

    /**
     * Model name - override it
     * @type {string}
     */
    static get model() {
        return 'base';
    }

    /**
     * Get repository
     * @param {string} [name]                       Repository name
     * @return {object}
     */
    getRepository(name) {
        name = name ? `repositories.${name}` : this.constructor.provides;
        return this._app.get(name);
    }

    /**
     * Get model
     * @param {string} [name]                       Model name
     * @return {Object}
     */
    getModel(name) {
        if (!name)
            name = this.constructor.model;
        return this._app.get(`models.${name}`);
    }

    /**
     * Load methods from given directory
     * @param {string} dir                  Directory full path
     * @throw {Error}                       Throws if couldn't load a file in the directory
     */
    _loadMethods(dir) {
        for (let name of fs.readdirSync(dir)) {
            let methodName = this._util.dashedToCamel(name.replace(/\.js$/, ''));
            let file = path.join(dir, name);
            try {
                this[methodName] = require(file).bind(this);
            } catch (error) {
                throw new NError(error, `Repository._loadMethods() - processing: ${name}`);
            }
        }
    }
}

module.exports = BaseRepository;