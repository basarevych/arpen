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
module.exports = function (model, pg) {
    return Promise.resolve()
        .then(() => {
            if (typeof pg === 'object')
                return pg;

            return this._postgres.connect(pg);
        })
        .then(client => {
            return client.query(
                    `DELETE 
                       FROM ${this.constructor.table}
                      WHERE id = $1`,
                    [ typeof model === 'object' ? model.id : model ]
                )
                .then(result => {
                    return result.rowCount;
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
        })
        .catch(error => {
            throw new NError(error, { model }, 'BaseRepository.delete()');
        });
};
