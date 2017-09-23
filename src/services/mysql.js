/**
 * MySQL service. Requires 'mysql' module.
 * @module arpen/services/mysql
 */
let mysql;
try {
    mysql = require('mysql');
} catch (error) {
    // do nothing
}

const debug = require('debug')('arpen:mysql');
const moment = require('moment-timezone');
const NError = require('nerror');

/**
 * Transaction function
 * @callback MySQLTransaction
 * @param {function} rollback   Calling this function will immediately rollback the transaction,
 *                              transaction promise will resolve to this function argument
 * @return {Promise}            Returns promise resolving to transaction result
 */

/**
 * MySQL client
 * @property {object} client                        mysql client
 * @property {number} maxTransactionRetries=59      Max number of transaction retries on serialization failures
 * @property {number} minTransactionDelay=100       Minimum time to wait before retrying transaction
 * @property {number} maxTransactionDelay=1000      Maximum time to wait before retrying transaction
 */
class MySQLClient {
    /**
     * Create MySQL client
     * @param {MySQL} service                       MySQL service instance
     * @param {object} client                       Connected PG client
     * @param {function} done                       Client termination function
     */
    constructor(service, client, done) {
        this.client = client;
        this.maxTransactionRetries = 59;
        this.minTransactionDelay = 100;
        this.maxTransactionDelay = 1000;

        this._done = done;
        this._mysql = service;
        this._transactionLevel = 0;
    }

    /**
     * Client termination
     */
    done() {
        if (!this.client)
            return;

        debug('Disconnecting...');
        let res = this._done();
        this.client = null;
        this._done = null;
        return res;
    }

    /**
     * Run MySQL query<br>
     * Date/Moment params are converted to strings in UTC timezone.
     * @param {string} sql                          SQL query string
     * @param {Array} [params]                      Query parameters
     * @return {Promise}                            Resolves to query result
     */
    async query(sql, params = []) {
        let parsedSql = sql.trim().replace(/\s+/g, ' ');
        let parsedParams = [];

        for (let param of params) {
            if (param instanceof Date)
                param = moment(param);
            if (moment.isMoment(param))
                parsedParams.push(param.tz('UTC').format(this._mysql.constructor.datetimeFormat)); // DB uses UTC
            else
                parsedParams.push(param);
        }

        let debugSql = parsedSql;
        for (let i = parsedParams.length - 1; i >= 0; i--) {
            let param = parsedParams[i];
            switch (typeof param) {
                case 'string':
                    if (!isFinite(param))
                        param = "'" + param.replace("'", "\\'") + "'";
                    break;
                case 'object':
                    if (param === null)
                        param = 'null';
                    else
                        param = JSON.stringify(param);
                    break;
                case 'boolean':
                    param = param ? 'true' : 'false';
                    break;
            }
            debugSql = debugSql.replace(new RegExp('\\$' + (i + 1), 'g'), param);
        }
        debug(debugSql);

        if (!this.client)
            throw Error('Query on terminated client');

        return new Promise((resolve, reject) => {
                try {
                    this.client.query(
                        parsedSql, parsedParams,
                        (error, result) => {
                            if (error) {
                                return reject(
                                    new NError(
                                        error,
                                        { code: error.code, query: parsedSql, params: parsedParams },
                                        'Query failed: ' + error.code
                                    )
                                );
                            }

                            resolve(result);
                        }
                    );
                } catch (error) {
                    reject(new NError(error, 'MySQLClient.query()'));
                }
            });
    }

    /**
     * Run a transaction
     * @param {object} [params]
     * @param {string} [params.name]                        Transaction name for debugging
     * @param {PostgresTransaction} cb                      The transaction
     * @return {Promise}                                    Resolves to transaction result
     */
    async transaction() {
        let params = {};
        let cb;
        if (arguments.length >= 2) {
            if (arguments[0].name)
                params.name = arguments[0].name;
            cb = arguments[1];
        } else if (arguments.length === 1) {
            cb = arguments[0];
        }

        if (!this.client) {
            return Promise.reject(new Error(
                'Transaction ' +
                (params.name ? params.name + ' ' : '') +
                'on terminated client'
            ));
        }

        class RollbackError extends Error {
        }

        function rollback(savepoint) {
            return result => {
                let error = new RollbackError(
                    'Uncatched transaction rollback' +
                    (params.name ? ` in ${params.name}` : '')
                );
                error.savepoint = savepoint;
                error.result = result;
                throw error;
            };
        }

        if (++this._transactionLevel !== 1) {
            let savepoint = 'arpen_' + this._mysql._util.getRandomString(16, { lower: true, digits: true });
            let savepointCreated = false;
            try {
                await this.query('SAVEPOINT ' + savepoint);
                savepointCreated = true;
                let result = cb(rollback(savepoint));
                if (result === null || typeof result !== 'object' || typeof result.then !== 'function') {
                    throw new Error(
                        'Transaction ' +
                        (params.name ? params.name + ' ' : '') +
                        'function must return a Promise'
                    );
                }
                let value = await result;
                this._transactionLevel--;
                return value;
            } catch (error) {
                this._transactionLevel--;
                if (error instanceof RollbackError && error.savepoint === savepoint) {
                    if (savepointCreated)
                        await this.query('ROLLBACK TO ' + savepoint);
                    return error.result;
                }
                throw error;
            }
        }

        let value;
        try {
            value = await new Promise(async (resolve, reject) => {
                let numTries = 0;
                let tryAgain = async () => {
                    let transactionStarted = false;
                    try {
                        await this.query('BEGIN TRANSACTION');
                        transactionStarted = true;

                        let result = cb(rollback(null));
                        if (result === null || typeof result !== 'object' || typeof result.then !== 'function') {
                            throw new Error(
                                'Transaction ' +
                                (params.name ? params.name + ' ' : '') +
                                'function must return a Promise'
                            );
                        }

                        let value = await result;
                        await this.query('COMMIT TRANSACTION');
                        resolve(value);
                    } catch (error) {
                        if (transactionStarted)
                            await this.query('ROLLBACK TRANSACTION');

                        if (error instanceof RollbackError)
                            return resolve(error.result);

                        if (error.info && error.info.code === 'ER_LOCK_DEADLOCK') { // SERIALIZATION FAILURE
                            if (++numTries > this.maxTransactionRetries) {
                                return reject(
                                    new NError(
                                        error,
                                        'Maximum transaction retries reached' +
                                        (params.name ? ` in ${params.name}` : '')
                                    )
                                );
                            }

                            this._mysql._logger.warn(
                                'MySQL transaction serialization failure' +
                                (params.name ? ` in ${params.name}` : '')
                            );

                            let delay = this._mysql._util.getRandomInt(
                                this.minTransactionDelay,
                                this.maxTransactionDelay
                            );
                            return setTimeout(async () => { await tryAgain(); }, delay);
                        }

                        reject(error);
                    }
                };
                await tryAgain();
            });
        } catch (error) {
            this._transactionLevel--;
            throw error;
        }

        this._transactionLevel--;
        return value;
    }
}

/**
 * Mysql service
 * <br><br>
 * mysql module is required
 */
class MySQL {
    /**
     * Create the service
     * @param {object} config       Config service
     * @param {Logger} logger       Logger service
     * @param {Util} util           Util service
     */
    constructor(config, logger, util) {
        this._config = config;
        this._logger = logger;
        this._util = util;

        this._pool = new Map();

        if (!mysql)
            throw new Error('mysql module is required for MySQL service');
    }

    /**
     * Service name is 'mysql'
     * @type {string}
     */
    static get provides() {
        return 'mysql';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'config', 'logger', 'util' ];
    }

    /**
     * This service is a singleton
     * @type {string}
     */
    static get lifecycle() {
        return 'singleton';
    }

    /**
     * Format of date/time string
     * @type {string}
     */
    static get datetimeFormat() {
        return 'YYYY-MM-DD HH:mm:ss.SSS';
    }

    /**
     * Obtain MySQL client
     * @param {string} name='main'              Server name in config
     * @return {Promise}                        Resolves to connected MySQLClient instance
     */
    async connect(name = 'main') {
        return new Promise((resolve, reject) => {
            let options = this._config.get(`mysql.${name}`);
            if (!options)
                return reject(new Error(`Undefined MySQL server name: ${name}`));
            if (typeof options.dateStrings === 'undefined')
                options.dateStrings = true;

            let pool = this._pool.get(name);
            if (!pool) {
                let Pool = mysql.createPool; // make eslint happy: uppercase first letter of the constructor name
                pool = new Pool(options);
                this._pool.set(name, pool);
            }

            debug('Connecting...');
            pool.getConnection((error, client) => {
                if (error)
                    return reject(new NError(error, `MySQL: Error connecting to ${name}`));

                resolve(new MySQLClient(this, client, () => { pool.releaseConnection(client); }));
            });
        });
    }
}

module.exports = MySQL;
