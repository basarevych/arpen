/**
 * Base class for Postgres models
 * @module arpen/models/postgres
 */
const BaseModel = require('./base');

/**
 * Base class for Postgres models
 */
class PostgresModel extends BaseModel {
    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'postgres', 'util' ];
    }
}

module.exports = PostgresModel;
