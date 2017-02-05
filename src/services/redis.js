/**
 * Redis service
 * @module arpen/services/redis
 */
const debug = require('debug')('arpen:redis');
const redis = require('redis');
const WError = require('verror').WError;

/**
 * Transaction function
 *
 * @callback RedisTransaction
 * @param {RedisQueue} queue    Instance of RedisQueue
 * @return {Promise}            Returns Promise of the transaction
 */

/**
 * Transaction queue
 * @property {boolean} empty        Queue is empty flag
 */
class RedisQueue {
    /**
     * Create the queue
     * @param {object} client       Redis client
     */
    constructor(client) {
        this.empty = true;

        this._client = client;
        this._multi = this._client.multi();
    }

    /**
     * Clear the queue
     */
    clear() {
        this._multi = this._client.multi();
        this.empty = true;
    }

    /**
     * Queue Redis command for transaction
     * @param {string} command      Command
     * @param {Array} [params]      Command parameters
     */
    add(command, params = []) {
        let method = this._multi[command.toLowerCase()];
        if (typeof method != 'function')
            throw new Error('Unknown Multi command: ' + command);

        method.apply(this._multi, params);
        this.empty = false;
    }
}

/**
 * Redis client
 * @property {object} client                        Redis client
 * @property {number} maxTransactionRetries=59      Max number of transaction retries on serialization failures
 * @property {number} minTransactionDelay=100       Minimum time to wait before retrying transaction
 * @property {number} maxTransactionDelay=1000      Maximum time to wait before retrying transaction
 */
class RedisClient {
    /**
     * Create Redis client
     * @param {Redis} service                       Redis service instance
     * @param {object} client                       Redis client instance
     */
    constructor(service, client) {
        this.client = client;
        this.maxTransactionRetries = 59;
        this.minTransactionDelay = 100;
        this.maxTransactionDelay = 1000;

        this._redis = service;
        this._transactionLevel = 0;
    }

    /**
     * Client termination
     */
    done() {
        return this.client.quit();
    }

    /**
     * Run Redis command
     * @param {string} command                      Command
     * @param {Array} [params]                      Command parameters
     * @return {Promise}                            Resolves to command reply
     */
    query(command, params = []) {
        debug(command.toUpperCase() + ' ' + params);

        return new Promise((resolve, reject) => {
                let method = this._client[command.toLowerCase()];
                if (typeof method != 'function')
                    return reject('Unknown command: ' + command);

                let args = params.slice();
                args.push((error, reply) => {
                    if (error)
                        return reject(new WError(error, 'Command failed: ' + command));

                    resolve(reply);
                });
                method.apply(this._client, args);
            });
    }

    /**
     * Run a transaction
     * @param {object} [params]
     * @param {string} [params.name]                Transaction name for debugging
     * @param {string[]} [params.watch]             Watched Redis keys
     * @param {RedisTransaction} cb                 The transaction function
     * @return {Promise}                            Resolves to an array of two items: transaction result and queue
     *                                              exec replies array
     */
    transaction() {
        let params = { watch: [] }, cb;
        if (arguments.length >= 2) {
            params.name = arguments[0].name;
            params.watch = arguments[0].watch;
            cb = arguments[1];
        } else if (arguments.length == 1) {
            cb = arguments[0];
        }

        if (++this._transactionLevel != 1) {
            this._transactionLevel--;
            return Promise.reject(new Error(
                'Nested Redis transactions are not supported' +
                (params.name ? ` (called in ${params.name})` : '')
            ));
        }

        let unwatch = () => {
            let promises = [];
            for (let key of params.watch) {
                promises.push(
                    this.query('UNWATCH', [ key ])
                        .then(() => {}, () => {})
                );
            }
            return promises.length ? Promise.all(promises) : Promise.resolve();
        };

        return new Promise((resolve, reject) => {
                let numTries = 0;
                let tryAgain = () => {
                    let queue = new RedisQueue(this.client);
                    let watched = false;

                    let promises = [];
                    for (let key of params.watch)
                        promises.push(this.query('WATCH', [key]));

                    (promises.length ? Promise.all(promises) : Promise.resolve())
                        .then(() => {
                            watched = true;
                            let result = cb(queue);
                            if (result === null || typeof result != 'object' || typeof result.then != 'function') {
                                throw new Error(
                                    'Transaction ' +
                                    (params.name ? params.name + ' ' : '') +
                                    'function must return a Promise'
                                );
                            }
                            return result;
                        })
                        .then(result => {
                            return ((queue.empty && watched) ? unwatch() : Promise.resolve())
                                .then(() => {
                                    watched = false;
                                    if (queue.empty)
                                        return [];

                                    return new Promise((resolve, reject) => {
                                        queue._multi.exec((error, replies) => {
                                            if (error) {
                                                return reject(new WError(
                                                    error,
                                                    'Queue EXEC failed' +
                                                    (params.name ? ` in ${params.name}` : '')
                                                ));
                                            }

                                            resolve(replies);
                                        });
                                    });
                                })
                                .then(replies => {
                                    if (replies === null) { // SERIALIZATION FAILURE
                                        if (++numTries > this.maxTransactionRetries) {
                                            return reject(new Error(
                                                'Maximum transaction retries reached' +
                                                (params.name ? ` in ${params.name}` : '')
                                            ));
                                        }

                                        this._redis._logger.warn(
                                            'Redis transaction serialization failure' +
                                            (params.name ? ` in ${params.name}` : '')
                                        );

                                        let delay = this._redis._util.getRandomInt(
                                            this.minTransactionDelay,
                                            this.maxTransactionDelay
                                        );
                                        return setTimeout(() => { tryAgain(); }, delay);
                                    }

                                    resolve([ result, replies ]);
                                });
                        })
                        .catch(error => {
                            return (watched ? unwatch() : Promise.resolve())
                                .then(() => {
                                    watched = false;
                                    reject(error);
                                });
                        });
                };
                tryAgain();
            })
            .then(
                value => {
                    this._transactionLevel--;
                    return value;
                },
                error => {
                    this._transactionLevel--;
                    throw error;
                }
            );
    }
}

/**
 * Redis service
 */
class Redis {
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
    }

    /**
     * Service name is 'redis'
     * @type {string}
     */
    static get provides() {
        return 'redis';
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
     * Obtain Redis client
     * @param {string} name='main'              Server name in config
     * @return {Promise}                        Resolves to connected RedisClient instance
     */
    connect(name = 'main') {
        return new Promise((resolve, reject) => {
                if (!this._config.redis[name])
                    return reject(new Error(`Undefined Redis server name: ${name}`));

                let options = {};
                if (this._config.redis[name].password)
                    options.auth_pass = this._config.redis[name].password;

                let client = redis.createClient(
                    this._config.redis[name].port,
                    this._config.redis[name].host,
                    options
                );
                client.on('ready', () => { resolve(new RedisClient(this, client)); });
                client.on('error', error => { reject(new WError(error, `Redis: Error connecting to ${name}`)); });
            });
    }
}

module.exports = Redis;
