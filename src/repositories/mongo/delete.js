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
        client = typeof mongo === 'object' ? mongo : await this._mongo.connect(mongo || this.constructor.instance);
        let coll = client.collection(this.constructor.table);
        let result = await coll.deleteOne({ _id: typeof model === 'object' ? model.id : model });

        if (typeof mongo !== 'object')
            client.done();

        return result.deletedCount;
    } catch (error) {
        if (client && typeof mongo !== 'object')
            client.done();

        throw new NError(error, { model }, 'MongoRepository.delete()');
    }
};
