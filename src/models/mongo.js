/**
 * Base class for Mongo models
 * @module arpen/models/mongo
 */
const BaseModel = require('./base');

/**
 * Base class for Mongo models
 */
class MongoModel extends BaseModel {
    /**
     * Create model
     * @param {Postgres|MySQL|Mongo} db     Database service
     * @param {Util} util                   Util service
     */
    constructor(db, util) {
        super(db, util);

        this._addField('_id', 'id');
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'mongo', 'util' ];
    }

    /**
     * ID setter
     * @type {undefined|number}
     */
    set id(id) {
        return this._setField('_id', id);
    }

    /**
     * ID getter
     * @type {undefined|number}
     */
    get id() {
        return this._getField('_id');
    }
}

module.exports = MongoModel;
