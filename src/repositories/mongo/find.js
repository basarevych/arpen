/**
 * MongoRepository.find()
 */
'use strict';

const NError = require('nerror');

/**
 * Find a model by ID
 * @instance
 * @method find
 * @memberOf module:arpen/repositories/mongo~MongoRepository
 * @param {number} id                       ID to search by
 * @param {MongoClient|string} [mongo]      Will reuse the Mongo client provided, or if it is a string then will
 *                                          connect to this instance of Mongo.
 * @return {Promise}                        Resolves to array of models
 */
module.exports = async function (id, mongo) {
    let client;

    try {
        client = typeof mongo === 'object' ? mongo : await this._mongo.connect(mongo);
        let rows = await new Promise((resolve, reject) => {
            client.collection(this.constructor.table).find(
                { _id: id },
                (error, result) => {
                    if (error)
                        return reject(error);

                    result.toArray((error, rows) => {
                        if (error)
                            return reject(error);

                        resolve(rows);
                    });
                }
            );
        });

        if (typeof mongo !== 'object')
            client.close();

        return rows ? this.getModel(rows) : [];
    } catch (error) {
        if (client && typeof mongo !== 'object')
            client.close();

        throw new NError(error, { id }, 'MongoRepository.find()');
    }
};
