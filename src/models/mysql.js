/**
 * Base class for MySQL models
 * @module arpen/models/mysql
 */
const BaseModel = require('./base');

/**
 * Base class for MySQL models
 */
class MysqlModel extends BaseModel {
    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'mysql', 'util' ];
    }
}

module.exports = MysqlModel;
