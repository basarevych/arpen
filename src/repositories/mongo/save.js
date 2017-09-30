/**
 * MongoRepository.save()
 */
'use strict';

const NError = require('nerror');

/**
 * Save model
 * @instance
 * @method save
 * @memberOf module:arpen/repositories/mongo~MongoRepository
 * @param {BaseModel} model                 The model
 * @param {MongoClient|string} [mongo]      Will reuse the Mongo client provided, or if it is a string then will
 *                                          connect to this instance of Mongo.
 * @return {Promise}                        Resolves to record ID
 */
module.exports = async function (model, mongo) {
    let client;

    try {
        if (model.id && !model._dirty)
            return model.id;

        client = typeof mongo === 'object' ? mongo : await this._mongo.connect(mongo);

        let data = model._serialize({ timeZone: this.constructor.timeZone });
        let id = typeof model === 'object' ? model.id : model;
        if (id) {
            await new Promise((resolve, reject) => {
                client.collection(this.constructor.table).findOneAndReplace(
                    { _id: id },
                    { $set: data },
                    (error, result) => {
                        if (error)
                            return reject(error);

                        resolve();
                    }
                );
            });
        } else {
            model.id = await new Promise((resolve, reject) => {
                delete data._id;
                client.collection(this.constructor.table).insertOne(
                    data,
                    (error, result) => {
                        if (error)
                            return reject(error);

                        resolve(result.insertedId);
                    }
                );
            });
        }

        model._dirty = false;

        if (typeof mongo !== 'object')
            client.close();

        return model.id;
    } catch (error) {
        if (client && typeof mongo !== 'object')
            client.close();

        throw new NError(error, { model }, 'MongoRepository.save()');
    }
};
