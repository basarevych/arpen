/**
 * MongoRepository.findAll()
 */
'use strict';

const NError = require('nerror');

/**
 * Find all models
 * @instance
 * @method findAll
 * @memberOf module:arpen/repositories/mongo~MongoRepository
 * @param {MongoClient|string} [mongo]      Will reuse the Mongo client provided, or if it is a string then will
 *                                          connect to this instance of Mongo.
 * @return {Promise}                        Resolves to array of models
 */
module.exports = async function (mongo) {
    let client;

    try {
        client = typeof mongo === 'object' ? mongo : await this._mongo.connect(mongo);
        let rows = await new Promise((resolve, reject) => {
            client.collection(this.constructor.table).find(
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

        throw new NError(error, 'MongoRepository.findAll()');
    }
};
