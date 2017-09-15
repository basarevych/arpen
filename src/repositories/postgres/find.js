/**
 * PostgresRepository.find()
 */
'use strict';

const NError = require('nerror');

/**
 * Find a model by ID
 * @instance
 * @method find
 * @memberOf module:arpen/repositories/postgres~PostgresRepository
 * @param {number} id                       ID to search by
 * @param {PostgresClient|string} [pg]      Will reuse the Postgres client provided, or if it is a string then will
 *                                          connect to this instance of Postgres.
 * @return {Promise}                        Resolves to array of models
 */
module.exports = async function (id, pg) {
    let key = `sql:${this.constructor.table}-by-id:${id}`;
    let client;

    try {
        if (this._enableCache) {
            let value = await this._cacher.get(key);
            if (value)
                return this.getModel(value);
        }

        client = typeof pg === 'object' ? pg : await this._postgres.connect(pg);
        let result = await client.query(
            `SELECT * 
               FROM ${this.constructor.table} 
              WHERE id = $1`,
            [id]
        );
        let rows = result.rowCount ? result.rows : [];

        if (this._enableCache)
            await this._cacher.set(key, rows);

        if (typeof pg !== 'object')
            client.done();

        return this.getModel(rows);
    } catch (error) {
        if (client && typeof pg !== 'object')
            client.done();

        throw new NError(error, { id }, 'PostgresRepository.find()');
    }
};
