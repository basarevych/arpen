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
     * Create model
     * @param {Postgres|MySQL|Mongo} db     Database service
     * @param {Util} util                   Util service
     */
    constructor(db, util) {
        super(db, util);

        this._addField('id', 'id');
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'postgres', 'util' ];
    }

    /**
     * ID setter
     * @type {undefined|number}
     */
    set id(id) {
        return this._setField('id', id);
    }

    /**
     * ID getter
     * @type {undefined|number}
     */
    get id() {
        return this._getField('id');
    }
}

module.exports = PostgresModel;
