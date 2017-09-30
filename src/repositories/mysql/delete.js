/**
 * MySQLRepository.delete()
 */
'use strict';

const NError = require('nerror');

/**
 * Delete a model
 * @instance
 * @method delete
 * @memberOf module:arpen/repositories/mysql~MySQLRepository
 * @param {BaseModel|number} model          Model or ID
 * @param {MySQLClient|string} [mysql]      Will reuse the MySQL client provided, or if it is a string then will
 *                                          connect to this instance of MySQL.
 * @return {Promise}                        Resolves to number of deleted records
 */
module.exports = async function (model, mysql) {
    let client;
    try {
        client = typeof mysql === 'object' ? mysql : await this._mysql.connect(mysql);
        let result = await client.query(
            `DELETE 
               FROM ${this.constructor.table}
              WHERE id = ?`,
            [ typeof model === 'object' ? model.id : model ]
        );

        if (typeof mysql !== 'object')
            client.done();

        return result.affectedRows;
    } catch (error) {
        if (client && typeof mysql !== 'object')
            client.done();

        throw new NError(error, { model }, 'MySQLRepository.delete()');
    }
};
