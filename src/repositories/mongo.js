/**
 * Base class for Mongo repositories
 * @module arpen/repositories/mongo
 */
const path = require('path');
const BaseRepository = require('./base');

/**
 * Repository base class
 */
class MongoRepository extends BaseRepository {
    /**
     * Create repository
     * @param {App} app                             The application
     * @param {Mongo} mongo                         Mongo service
     * @param {Util} util                           Util service
     */
    constructor(app, mongo, util) {
        super(app, util);
        this._mongo = mongo;

        this._loadMethods(path.join(__dirname, 'mongo'));
    }

    /**
     * Service name is 'repositories.mongo'
     * @type {string}
     */
    static get provides() {
        return 'repositories.mongo';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'mongo', 'util' ];
    }

    /**
     * Table time zone - mongo always uses UTC and converts to local
     * @type {string|null}
     */
    static get timeZone() {
        return null; // no convert
    }
}

module.exports = MongoRepository;
