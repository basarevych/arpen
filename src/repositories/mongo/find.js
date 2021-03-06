/**
 * MongoRepository.find()
 */
'use strict';

let mongodb;
try {
    mongodb = require('mongodb');
} catch (error) {
    // do nothing
}
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
    if (!mongodb)
        throw new Error('mongodb module is required for Mongo service');
    const { ObjectId } = mongodb;

    let client;
    let sample = this.getModel();

    try {
        client = typeof mongo === 'object' ? mongo : await this._mongo.connect(mongo || this.constructor.instance);
        let coll = client.collection(this.constructor.table);
        let data = coll.find({ [sample._propToField.get('id')]: new ObjectId(id) });
        let rows = await data.toArray();

        if (typeof mongo !== 'object')
            client.done();

        return rows.length ? this.getModel(rows) : [];
    } catch (error) {
        if (client && typeof mongo !== 'object')
            client.done();

        throw new NError(error, { id }, 'MongoRepository.find()');
    }
};
