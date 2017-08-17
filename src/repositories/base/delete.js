/**
 * BaseRepository.delete()
 */
'use strict';

const NError = require('nerror');

/**
 * Delete a model
 * @method delete
 * @memberOf module:arpen/repositories/base~BaseRepository
 * @param {BaseModel|number} model          Model or ID
 * @param {PostgresClient|string} [pg]      Will reuse the Postgres client provided, or if it is a string then will
 *                                          connect to this instance of Postgres.
 * @return {Promise}                        Resolves to number of deleted records
 */
module.exports = async function (model, pg) {
    let client;
    try {
        client = typeof pg === 'object' ? pg : await this._postgres.connect(pg);
        let result = await client.query(
            `DELETE 
               FROM ${this.constructor.table}
              WHERE id = $1`,
            [ typeof model === 'object' ? model.id : model ]
        );

        if (client && typeof pg !== 'object')
            client.done();

        return result.rowCount;
    } catch (error) {
        if (client && typeof pg !== 'object')
            client.done();

        throw new NError(error, { model }, 'BaseRepository.delete()');
    }
};
