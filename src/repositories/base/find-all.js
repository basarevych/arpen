/**
 * BaseRepository.findAll()
 */
'use strict';

const NError = require('nerror');

/**
 * Find all models
 * @instance
 * @method findAll
 * @memberOf module:arpen/repositories/base~BaseRepository
 * @param {PostgresClient|string} [pg]      Will reuse the Postgres client provided, or if it is a string then will
 *                                          connect to this instance of Postgres.
 * @return {Promise}                        Resolves to array of models
 */
module.exports = async function (pg) {
    let client;

    try {
        client = typeof pg === 'object' ? pg : await this._postgres.connect(pg);
        let result = await client.query(
            `SELECT * 
               FROM ${this.constructor.table}`,
            []
        );
        let rows = result.rowCount ? result.rows : [];

        if (typeof pg !== 'object')
            client.done();

        return this.getModel(rows);
    } catch (error) {
        if (client && typeof pg !== 'object')
            client.done();

        throw new NError(error, 'BaseRepository.findAll()');
    }
};
