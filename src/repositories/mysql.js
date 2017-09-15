/**
 * Base class for MySQL repositories
 * @module arpen/repositories/mysql
 */
const path = require('path');
const fs = require('fs');
const NError = require('nerror');

/**
 * Repository base class
 */
class MySQLRepository {
    /**
     * Create repository
     * @param {App} app                             The application
     * @param {MySQL} mysql                         MySQL service
     * @param {Util} util                           Util service
     */
    constructor(app, mysql, util) {
        this._app = app;
        this._mysql = mysql;
        this._util = util;
        this._enableCache = true;

        this._loadMethods(path.join(__dirname, 'mysql'));
    }

    /**
     * Service name is 'repositories.mysql'
     * @type {string}
     */
    static get provides() {
        return 'repositories.mysql';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'mysql', 'util' ];
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
     * @param {string} [name]                       Model name, defaults to the model of this class
     * @param {undefined|object|object[]} [data]    Data to to load
     * @return {object|object[]}                    If data is an array returns array of models otherwise a single model
     */
    getModel(name, data) {
        if (name && !data && typeof name !== 'string') {
            data = name;
            name = undefined;
        }

        if (!name)
            name = this.constructor.model;

        if (Array.isArray(data)) {
            let models = [];
            for (let row of data) {
                let model = this._app.get(`models.${name}`);
                model._unserialize(row);
                models.push(model);
            }
            return models;
        }

        let model = this._app.get(`models.${name}`);
        if (typeof data !== 'undefined')
            model._unserialize(data);
        return model;
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
                throw new NError(error, `MySQLRepository._loadMethods() - processing: ${name}`);
            }
        }
    }
}

module.exports = MySQLRepository;
