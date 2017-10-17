/**
 * PostgresRepository.save()
 */
'use strict';

const NError = require('nerror');

/**
 * Save model
 * @instance
 * @method save
 * @memberOf module:arpen/repositories/postgres~PostgresRepository
 * @param {BaseModel} model                 The model
 * @param {PostgresClient|string} [pg]      Will reuse the Postgres client provided, or if it is a string then will
 *                                          connect to this instance of Postgres.
 * @return {Promise}                        Resolves to record ID
 */
module.exports = async function (model, pg) {
    let client;

    try {
        if (model.id && !model._dirty)
            return model.id;

        client = typeof pg === 'object' ? pg : await this._postgres.connect(pg || this.constructor.instance);

        let data = model._serialize();
        let fields = Object.keys(data)
            .filter(field => {
                return field !== 'id';
            });

        let query;
        let params = [];
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

        let result = await client.query(query, params);
        if (result.rowCount !== 1)
            throw new Error('Failed to ' + (model.id ? 'UPDATE' : 'INSERT') + ' row');

        if (!model.id)
            model.id = result.rows[0].id;

        model._dirty = false;

        if (typeof pg !== 'object')
            client.done();

        return model.id;
    } catch (error) {
        if (client && typeof pg !== 'object')
            client.done();

        throw new NError(error, { model }, 'PostgresRepository.save()');
    }
};
