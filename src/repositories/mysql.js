/**
 * Base class for MySQL repositories
 * @module arpen/repositories/mysql
 */
const path = require('path');
const BaseRepository = require('./base');

/**
 * Repository base class
 */
class MySQLRepository extends BaseRepository {
    /**
     * Create repository
     * @param {App} app                             The application
     * @param {MySQL} mysql                         MySQL service
     * @param {Util} util                           Util service
     */
    constructor(app, mysql, util) {
        super(app, util);
        this._mysql = mysql;

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
}

module.exports = MySQLRepository;
