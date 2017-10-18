/**
 * Redis service
 * @module arpen/services/redis
 */
let redis;
try {
    redis = require('redis');
} catch (error) {
    // do nothing
}

const debug = require('debug')('arpen:redis');
const NError = require('nerror');

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
        if (typeof method !== 'function')
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
        if (!this.client)
            return;

        debug('Disconecting...');
        let res = this.client.quit();
        this.client = null;
        return res;
    }

    /**
     * Run Redis command
     * @param {string} command                      Command
     * @param {Array} [params]                      Command parameters
     * @return {Promise}                            Resolves to command reply
     */
    async query(command, params = []) {
        debug(command.toUpperCase() + ' ' + params);

        if (!this.client)
            throw new Error('Query on terminated client');

        return new Promise((resolve, reject) => {
            try {
                let method = this.client[command.toLowerCase()];
                if (typeof method !== 'function')
                    return reject(new Error('Unknown command: ' + command));

                let args = params.slice();
                args.push((error, reply) => {
                    if (error)
                        return reject(new NError(error, 'Command failed: ' + command));

                    resolve(reply);
                });
                method.apply(this.client, args);
            } catch (error) {
                reject(new NError(error, 'RedisClient.query()'));
            }
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
    async transaction() {
        let params = { watch: [] };
        let cb;
        if (arguments.length >= 2) {
            if (arguments[0].name)
                params.name = arguments[0].name;
            if (arguments[0].watch)
                params.watch = arguments[0].watch;
            cb = arguments[1];
        } else if (arguments.length === 1) {
            cb = arguments[0];
        }

        if (!this.client) {
            throw new Error(
                'Transaction ' +
                (params.name ? params.name + ' ' : '') +
                'on terminated client'
            );
        }

        debug(`Transaction ${params.name}`);

        if (++this._transactionLevel !== 1) {
            this._transactionLevel--;
            throw new Error(
                'Nested Redis transactions are not supported' +
                (params.name ? ` (called in ${params.name})` : '')
            );
        }

        let unwatch = async () => {
            let promises = [];
            for (let key of params.watch) {
                promises.push(
                    this.query('UNWATCH', [ key ]).catch(() => {})
                );
            }
            if (promises.length)
                return Promise.all(promises);
        };

        let value;
        try {
            value = await new Promise(async (resolve, reject) => {
                let numTries = 0;
                let tryAgain = async () => {
                    let watched = false;

                    try {
                        let queue = new RedisQueue(this.client);
                        let promises = [];
                        for (let key of params.watch)
                            promises.push(this.query('WATCH', [key]));

                        if (promises.length) {
                            await Promise.all(promises);
                            watched = true;
                        }

                        let result = cb(queue);
                        if (result === null || typeof result !== 'object' || typeof result.then !== 'function') {
                            throw new Error(
                                'Transaction ' +
                                (params.name ? params.name + ' ' : '') +
                                'function must return a Promise'
                            );
                        }

                        let value = await result;
                        if (queue.empty && watched) {
                            await unwatch();
                            watched = false;
                        }

                        let replies;
                        if (queue.empty) {
                            replies = [];
                        } else {
                            replies = await new Promise((resolve, reject) => {
                                queue._multi.exec((error, replies) => {
                                    if (error) {
                                        return reject(
                                            new NError(
                                                error,
                                                'Queue EXEC failed' +
                                                (params.name ? ` in ${params.name}` : '')
                                            )
                                        );
                                    }

                                    resolve(replies);
                                });
                            });
                        }

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
                            return setTimeout(async () => { await tryAgain(); }, delay);
                        }

                        resolve([value, replies]);
                    } catch (error) {
                        if (watched) {
                            await unwatch();
                            watched = false;
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
 * Redis service
 * <br><br>
 * redis module is required
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

        if (!redis)
            throw new Error('redis module is required for Redis service');
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
    async connect(name = 'main') {
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
            let onError = error => {
                reject(new NError(error, `Redis: Error connecting to ${name}`));
            };

            client.once('error', onError);
            client.once('ready', () => {
                client.removeListener('error', onError);
                resolve(new RedisClient(this, client));
            });
        });
    }
}

module.exports = Redis;
