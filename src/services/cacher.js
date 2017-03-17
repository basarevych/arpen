/**
 * Cache service
 * @module arpen/services/cacher
 */
const debug = require('debug')('arpen:cacher');
const WError = require('verror').WError;

/**
 * Cacher
 */
class Cacher {
    /**
     * Create the service
     * @param {object} config                   Configuration
     * @param {Redis} redis                     Redis service
     * @param {Logger} logger                   Logger service
     * @param {Util} util                       Util service
     */
    constructor(config, redis, logger, util) {
        this._config = config;
        this._redis = redis;
        this._logger = logger;
        this._util = util;

        this._clientPromise = new Promise((resolve, reject) => {
            if (!this._config.get('cache.enable'))
                return reject();

            this._redis.connect(this._config.get('cache.redis'))
                .then(
                    client => {
                        this._logger.info(`Cache activated`);
                        resolve(client);
                    },
                    error => {
                        while (error.cause)
                            error = error.cause();

                        this._logger.error(`Cache disabled: ${error.message}`);
                        resolve(null);
                    }
                );
        });
    }

    /**
     * Service name is 'cacher'
     * @type {string}
     */
    static get provides() {
        return 'cacher';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'config', 'redis', 'logger', 'util' ];
    }

    /**
     * This service is a singleton
     */
    static get lifecycle() {
        return 'singleton';
    }

    /**
     * Set variable to a new value
     * @param {string} name                     The name
     * @param {*} value                         The value
     * @param {number} [ttl]                    Time before expiration is seconds, use 0 to store forever.
     *                                          If undefined then default (random) value will be used
     * @return {Promise}                        Resolves on success
     */
    set(name, value, ttl) {
        value = JSON.stringify(value);
        if (Buffer.byteLength(value) > 512 * 1024 * 1024)
            return Promise.reject(new Error(`Cache overflow for ${name}`));

        if (typeof ttl == 'undefined')
            ttl = this._util.getRandomInt(this._config.get('cache.expire_min'), this._config.get('cache.expire_max'));

        return this._clientPromise
            .then(
                client => {
                    if (!client) {
                        debug(`Cache disabled, couldn't set ${name}`);
                        return undefined;
                    }

                    debug(`Setting ${name}`);
                    return client.query('SET', [ this._getKey(name), value ])
                        .then(() => {
                            if (ttl)
                                return client.query('EXPIRE', [ this._getKey(name), ttl ]);
                        });
                }
            )
            .catch(error => {
                this._logger.error(new WError(error, 'Cacher.set()'));
                return undefined;
            });
    }

    /**
     * Get variable value refreshing its lifetime
     * @param {string} name                     The name
     * @return {Promise}                        Resolves to variable value or undefined
     */
    get(name) {
        return this._clientPromise
                .then(
                    client => {
                        if (!client) {
                            debug(`Cache disabled, couldn't get ${name}`);
                            return undefined;
                        }

                        return client.query('GET', [ this._getKey(name) ])
                            .then(result => {
                                if (result === null) {
                                    debug(`Missed ${name}`);
                                    return undefined;
                                }

                                debug(`Getting ${name}`);
                                return JSON.parse(result);
                            });
                    }
                )
                .catch(error => {
                    this._logger.error(new WError(error, 'Cacher.get()'));
                    return undefined;
                });
    }

    /**
     * Remove variable
     * @param {string} name                     The name
     * @return {Promise}                        Resolves on success
     */
    unset(name) {
        return this._clientPromise
                .then(
                    client => {
                        if (!client) {
                            debug(`Cache disabled, couldn't unset ${name}`);
                            return undefined;
                        }

                        return client.query('EXISTS', [ this._getKey(name) ])
                            .then(result => {
                                if (!result)
                                    return null;

                                debug(`Unsetting ${name}`);
                                return client.query('DEL', [ this._getKey(name) ]);
                            });
                    }
                )
                .catch(error => {
                    this._logger.error(new WError(error, 'Cacher.unset()'));
                    return undefined;
                });
    }

    /**
     * Convert variable name to Redis key
     * @param {string} name                         Cache variable name
     * @return {string}                             Returns corresponding Redis key
     */
    _getKey(name) {
        return `${this._config.project}:${this._config.instance}:cache:${name}`;
    }
}

module.exports = Cacher;
