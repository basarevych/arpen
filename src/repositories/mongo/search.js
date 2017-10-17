/**
 * MongoRepository.search()
 */
'use strict';

const NError = require('nerror');

/**
 * Search repository
 * @instance
 * @method search
 * @memberOf module:arpen/repositories/mongo~MongoRepository
 * @param {object} [options]
 * @param {string} [options.collection]         Collection name
 * @param {object} [options.search]             Search object if any
 * @param {object} [options.sort]               Sort object if any
 * @param {number} [options.pageSize=0]         Used in limit(), 0 = all records
 * @param {number} [options.pageNumber=1]       Used in skip()
 * @param {boolean} [options.infoOnly=false]    Retrieve data rows or not
 * @param {MongoClient|string} [mongo]          Will reuse the Mongo client provided, or if it is a string then will
 *                                              connect to this instance of Mongo.
 * @return {Promise}                            Returns promise resolving to the following:
 * <pre>
 * {
 *      totalRows: 1, // total rows in result
 *      totalPages: 1, // total number of pages
 *      pageSize: 0, // page size
 *      pageNumber: 1, // returned page number
 *      search: object, // object used to search the collection
 *      sort: object, // object used to sort the result
 *      data: [ ... ], // resulting rows as an array of models
 * }
 * </pre>
 */
module.exports = async function (options = {}, mongo = undefined) {
    let {
        collection = this.constructor.table,
        search = undefined,
        sort = undefined,
        pageSize = 0,
        pageNumber = 1,
        infoOnly = false,
    } = options;

    let client;

    try {
        client = typeof mongo === 'object' ? mongo : await this._mongo.connect(mongo || this.constructor.instance);
        let coll = client.collection(collection);
        let totalRows = await coll.count(search);
        let totalPages;
        if (totalRows === 0 || pageSize === 0) {
            totalPages = 1;
            pageNumber = 1;
        } else {
            totalPages = Math.floor(totalRows / pageSize) + (totalRows % pageSize ? 1 : 0);
            if (pageNumber > totalPages)
                pageNumber = totalPages;
        }

        let result;
        if (!infoOnly) {
            let offset = (pageNumber - 1) * pageSize;
            let data = coll.find(search);
            if (sort)
                data = data.sort(sort);
            if (offset)
                data = data.skip(offset);
            if (pageSize)
                data = data.limit(pageSize);
            result = await data.toArray();
            if (result.length)
                result = this.getModel(result);
        }

        if (typeof mongo !== 'object')
            client.done();

        return {
            totalRows: totalRows,
            totalPages: totalPages,
            pageSize: pageSize,
            pageNumber: pageNumber,
            search: search,
            sort: sort,
            data: infoOnly ? [] : result,
        };
    } catch (error) {
        if (client && typeof mongo !== 'object')
            client.done();

        throw new NError(
            error,
            {
                collection,
                search,
                sort,
                pageSize: options.pageSize || 0,
                pageNumber: options.pageNumber || 1,
            },
            'MongoRepository.search()'
        );
    }
};
