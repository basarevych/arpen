/**
 * BaseRepository.search()
 */
'use strict';

const NError = require('nerror');

/**
 * Search repository
 * @method search
 * @memberOf module:arpen/repositories/base~BaseRepository
 * @param {object} [options]
 * @param {string} [options.table]               Table or view name
 * @param {string[]} [options.fields]            Fields to retrieve
 * @param {string[]} [options.where]             SQL WHERE clause: will be joined with 'AND'
 * @param {Array} [options.params]               Bound parameters of WHERE (referenced as $1, $2, ... in SQL)
 * @param {string} [options.sort=['id asc']]     Used in ORDER BY if provided
 * @param {number} [options.pageSize=0]          Used in LIMIT, 0 = all records
 * @param {number} [options.pageNumber=1]        Used in OFFSET
 * @param {PostgresClient|string} [pg]          Will reuse the Postgres client provided, or if string then will
 *                                              connect to this instance of Postgres.
 * @return {Promise}                            Returns promise resolving to the following:
 * <code>
 * {
     *      totalRows: 1, // total rows in result
     *      totalPages: 1, // total number of pages
     *      pageSize: 0, // page size
     *      pageNumber: 1, // returned page number
     *      sort: [ ... ], // keys used to sort the result
     *      data: [ ... ], // resulting rows as array
     * }
 * </code>
 */
module.exports = function (options = {}, pg = undefined) {
    let {
        table = this.constructor.table,
        fields = Object.keys(this.getModel()._serialize()),
        where = [],
        params = [],
        sort = [ 'id asc' ],
        pageSize = 0,
        pageNumber = 1
    } = options;

    return Promise.resolve()
        .then(() => {
            if (typeof pg === 'object')
                return pg;

            return this._postgres.connect(pg);
        })
        .then(client => {
            return client.query(
                    `SELECT count(*)::int AS count 
                       FROM ${table} 
                     ${where.length ? `WHERE (${where.join(') AND (')})` : ''}`,
                    params
                )
                .then(result => {
                    let totalRows = result.rowCount ? result.rows[0].count : 0;
                    let totalPages;
                    if (totalRows === 0 || pageSize === 0) {
                        totalPages = 1;
                        pageNumber = 1;
                    } else {
                        totalPages = Math.floor(totalRows / pageSize) + (totalRows % pageSize ? 1 : 0);
                        if (pageNumber > totalPages)
                            pageNumber = totalPages;
                    }

                    let offset = (pageNumber - 1) * pageSize;
                    return client.query(
                            `SELECT ${fields.join(', ')}
                               FROM ${table} 
                             ${where.length ? `WHERE (${where.join(') AND (')})` : ''},
                             ${sort.length ? `ORDER BY ${sort.join(', ')}` : ''}
                             ${offset > 0 ? `OFFSET ${offset}` : ''}
                             ${pageSize > 0 ? `LIMIT ${pageSize}` : ''}`,
                            params
                        )
                        .then(result => {
                            return {
                                totalRows: totalRows,
                                totalPages: totalPages,
                                pageSize: pageSize,
                                pageNumber: pageNumber,
                                sort: sort,
                                data: result.rows,
                            };
                        });
                })
                .then(
                    value => {
                        if (typeof pg !== 'object')
                            client.done();
                        return value;
                    },
                    error => {
                        if (typeof pg !== 'object')
                            client.done();
                        throw error;
                    }
                );
        })
        .catch(error => {
            throw new NError(error, 'BaseRepository.search()');
        });
};