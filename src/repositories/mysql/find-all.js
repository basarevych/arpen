/**
 * MySQLRepository.findAll()
 */
'use strict';

const NError = require('nerror');

/**
 * Find all models
 * @instance
 * @method findAll
 * @memberOf module:arpen/repositories/mysql~MySQLRepository
 * @param {MySQLClient|string} [mysql]      Will reuse the MySQL client provided, or if it is a string then will
 *                                          connect to this instance of MySQL.
 * @return {Promise}                        Resolves to array of models
 */
module.exports = async function (mysql) {
    let client;

    try {
        client = typeof mysql === 'object' ? mysql : await this._mysql.connect(mysql);
        let rows = await client.query(
            `SELECT * 
               FROM ${this.constructor.table}`,
            []
        );

        if (typeof mysql !== 'object')
            client.done();

        return this.getModel(rows);
    } catch (error) {
        if (client && typeof mysql !== 'object')
            client.done();

        throw new NError(error, 'MySQLRepository.findAll()');
    }
};
