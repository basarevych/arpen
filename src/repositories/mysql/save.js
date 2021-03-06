/**
 * MySQLRepository.save()
 */
'use strict';

const NError = require('nerror');

/**
 * Save model
 * @instance
 * @method save
 * @memberOf module:arpen/repositories/mysql~MySQLRepository
 * @param {BaseModel} model                 The model
 * @param {MySQLClient|string} [mysql]      Will reuse the MySQL client provided, or if it is a string then will
 *                                          connect to this instance of MySQL.
 * @return {Promise}                        Resolves to record ID
 */
module.exports = async function (model, mysql) {
    let client;
    let sample = this.getModel();

    try {
        if (model.id && !model._dirty)
            return model.id;

        client = typeof mysql === 'object' ? mysql : await this._mysql.connect(mysql || this.constructor.instance);

        let data = model._serialize({ timeZone: this.constructor.timeZone });
        let fields = Object.keys(data)
            .filter(field => {
                return field !== sample._propToField.get('id');
            });

        let query;
        let params = [];
        if (model.id) {
            query = `UPDATE ${this.constructor.table} SET `;
            query += fields
                .map(field => {
                    params.push(data[field]);
                    return `${field} = ?`;
                })
                .join(', ');
            params.push(data.id);
            query += ` WHERE ${sample._propToField.get('id')} = ?`;
        } else {
            query = `INSERT INTO ${this.constructor.table} (`;
            query += fields.join(', ');
            query += ') VALUES (';
            query += fields
                .map(field => {
                    params.push(data[field]);
                    return `?`;
                })
                .join(', ');
            query += ')';
        }

        let result = await client.query(query, params);
        if (result.affectedRows !== 1)
            throw new Error('Failed to ' + (model.id ? 'UPDATE' : 'INSERT') + ' row');

        if (!model.id)
            model.id = result.insertId;

        model._dirty = false;

        if (typeof mysql !== 'object')
            client.done();

        return model.id;
    } catch (error) {
        if (client && typeof mysql !== 'object')
            client.done();

        throw new NError(error, { model }, 'MySQLRepository.save()');
    }
};
