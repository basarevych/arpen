/**
 * BaseRepository.find()
 */
'use strict';

const NError = require('nerror');

/**
 * Find a model by ID
 * @method find
 * @memberOf module:arpen/repositories/base~BaseRepository
 * @param {number} id                       ID to search by
 * @param {PostgresClient|string} [pg]      Will reuse the Postgres client provided, or if it is a string then will
 *                                          connect to this instance of Postgres.
 * @return {Promise}                        Resolves to array of models
 */
module.exports = function (id, pg) {
    let key = `sql:${this.constructor.table}-by-id:${id}`;

    return this._cacher.get(key)
        .then(value => {
            if (value)
                return value;

            return Promise.resolve()
                .then(() => {
                    if (typeof pg === 'object')
                        return pg;

                    return this._postgres.connect(pg);
                })
                .then(client => {
                    return client.query(
                            `SELECT * 
                               FROM ${this.constructor.table} 
                              WHERE id = $1`,
                            [ id ]
                        )
                        .then(result => {
                            let rows = result.rowCount ? result.rows : [];
                            if (!rows.length)
                                return rows;

                            return this._cacher.set(key, rows)
                                .then(() => {
                                    return rows;
                                });
                        })
                        .then(
                            value => {
                                if (typeof pg !== 'object')
                                    client.done();
                                return value;
                            },
                            error => {
                                if (typeof pg !== 'object')
                                    client.done();
                                throw error;
                            }
                        );
                });
        })
        .then(rows => {
            let models = [];
            for (let row of rows) {
                let model = this.getModel();
                model._unserialize(row);
                models.push(model);
            }

            return models;
        })
        .catch(error => {
            throw new NError(error, { id }, 'BaseRepository.find()');
        });
};
