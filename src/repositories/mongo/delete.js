/**
 * MongoRepository.delete()
 */
'use strict';

const NError = require('nerror');

/**
 * Delete a model
 * @instance
 * @method delete
 * @memberOf module:arpen/repositories/mongo~MongoRepository
 * @param {BaseModel|number} model          Model or ID
 * @param {MongoClient|string} [mongo]      Will reuse the Mongo client provided, or if it is a string then will
 *                                          connect to this instance of Mongo.
 * @return {Promise}                        Resolves to number of deleted records
 */
module.exports = async function (model, mongo) {
    let client;
    try {
        client = typeof mongo === 'object' ? mongo : await this._mongo.connect(mongo);
        let result = await new Promise((resolve, reject) => {
            client.collection(this.constructor.table).deleteOne(
                { _id: typeof model === 'object' ? model.id : model },
                (error, result) => {
                    if (error)
                        return reject(error);

                    resolve(result);
                }
            );
        });

        if (typeof mongo !== 'object')
            client.close();

        return result.deletedCount;
    } catch (error) {
        if (client && typeof mongo !== 'object')
            client.close();

        throw new NError(error, { model }, 'MongoRepository.delete()');
    }
};
