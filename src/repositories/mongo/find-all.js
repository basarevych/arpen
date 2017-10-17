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
        client = typeof mongo === 'object' ? mongo : await this._mongo.connect(mongo || this.constructor.instance);
        let coll = client.collection(this.constructor.table);
        let data = coll.find();
        let rows = await data.toArray();

        if (typeof mongo !== 'object')
            client.done();

        return rows.length ? this.getModel(rows) : [];
    } catch (error) {
        if (client && typeof mongo !== 'object')
            client.done();

        throw new NError(error, 'MongoRepository.findAll()');
    }
};
