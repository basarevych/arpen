/**
 * Base class for Postgres repositories
 * @module arpen/repositories/postgres
 */
const path = require('path');
const BaseRepository = require('./base');

/**
 * Repository base class
 */
class PostgresRepository extends BaseRepository {
    /**
     * Create repository
     * @param {App} app                             The application
     * @param {Postgres} postgres                   Postgres service
     * @param {Cacher} cacher                       Cacher service
     * @param {Util} util                           Util service
     */
    constructor(app, postgres, cacher, util) {
        super(app, util);
        this._postgres = postgres;
        this._cacher = cacher;
        this._enableCache = true;

        this._loadMethods(path.join(__dirname, 'postgres'));
    }

    /**
     * Service name is 'repositories.postgres'
     * @type {string}
     */
    static get provides() {
        return 'repositories.postgres';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'postgres', 'cacher', 'util' ];
    }
}

module.exports = PostgresRepository;
