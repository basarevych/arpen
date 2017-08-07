/**
 * BaseRepository.save()
 */
'use strict';

const NError = require('nerror');

/**
 * Save model
 * @method save
 * @memberOf module:arpen/repositories/base~BaseRepository
 * @param {BaseModel} model                 The model
 * @param {PostgresClient|string} [pg]      Will reuse the Postgres client provided, or if it is a string then will
 *                                          connect to this instance of Postgres.
 * @return {Promise}                        Resolves to record ID
 */
module.exports = function (model, pg) {
    return Promise.resolve()
        .then(() => {
            if (typeof pg === 'object')
                return pg;

            return this._postgres.connect(pg);
        })
        .then(client => {
            return Promise.resolve()
                .then(() => {
                    let data = model._serialize();
                    let fields = Object.keys(data)
                        .filter(field => {
                            return field !== 'id';
                        });

                    let query, params = [];
                    if (model.id) {
                        query = `UPDATE ${this.constructor.table} SET `;
                        query += fields
                            .map(field => {
                                params.push(data[field]);
                                return `${field} = $${params.length}`;
                            })
                            .join(', ');
                        params.push(data.id);
                        query += ` WHERE id = $${params.length}`;
                    } else {
                        query = `INSERT INTO ${this.constructor.table} (`;
                        query += fields.join(', ');
                        query += ') VALUES (';
                        query += fields
                            .map(field => {
                                params.push(data[field]);
                                return `$${params.length}`;
                            })
                            .join(', ');
                        query += ') RETURNING id';
                    }
                    return client.query(query, params);
                })
                .then(result => {
                    if (result.rowCount !== 1)
                        throw new Error('Failed to ' + (model.id ? 'UPDATE' : 'INSERT') + ' row');

                    model._dirty = false;
                    if (!model.id)
                        model.id = result.rows[0].id;

                    return model.id;
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
            throw new NError(error, { model }, 'BaseRepository.save()');
        });
};
