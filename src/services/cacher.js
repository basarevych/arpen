/**
 * Cache service
 * @module arpen/services/cacher
 */
const debug = require('debug')('arpen:cacher');
const NError = require('nerror');

/**
 * Cacher
 * <br><br>
 * Will temporarily cache object in Redis if cache is enabled or instantly return undefined if it isn't
 * <br><br>
 * redis module is required
 * <br><br>
 * Add to your config:
 * <pre>
 * // Redis servers
 * redis: {
 *   cache: {
 *     host: 'localhost',
 *     port: 6379,
 *     database: 0,
 *     //password: 'password',
 *   },
 * },
 * cache: {
 *   enable: true,
 *     subscribe: [
 *       { postgres: 'main' },           // Invalidate cache pubsub provider
 *     ],
 *   redis: 'cache',                     // Name of Redis configuration to use
 *   expire_min: 3 * 60,                 // seconds, minimum time to cache values for (random)
 *   expire_max: 5 * 60,                 // seconds, maximum time to cache values for (random)
 * },
 * </pre>
 */
class Cacher {
    /**
     * Create the service
     * @param {App} app                         The application
     * @param {object} config                   Configuration
     * @param {Redis} redis                     Redis service
     * @param {Logger} logger                   Logger service
     * @param {Util} util                       Util service
     */
    constructor(app, config, redis, logger, util) {
        this._app = app;
        this._config = config;
        this._redis = redis;
        this._logger = logger;
        this._util = util;

        this._clientPromise = new Promise(async (resolve, reject) => {
            if (!this._config.get('cache.enable')) {
                this._logger.info(`[Cache] Cache disabled`);
                return resolve(null);
            }

            let subscribe = this._config.get('cache.subscribe');
            if (subscribe) {
                this._pubsub = this._app.get('pubsub');
                for (let item of subscribe) {
                    if (item.postgres) {
                        let client = await this._pubsub.connect(`postgres.${item.postgres}`, 'InvalidateCache');
                        await client.subscribe('invalidate_cache', this.onInvalidateMessage.bind(this));
                    }
                }
            }

            this._redis.connect(this._config.get('cache.redis'))
                .then(
                    client => {
                        this._logger.info(`[Cache] Cache activated`);
                        resolve(client);
                    },
                    error => {
                        this._logger.error(`[Cache] Cache could not be activated: ${error.messages || error.message}`);
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
        return [ 'app', 'config', 'redis', 'logger', 'util' ];
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
    async set(name, value, ttl) {
        try {
            value = JSON.stringify(value);
            if (Buffer.byteLength(value) > 512 * 1024 * 1024)
                throw new Error(`Cache overflow for ${name}`);

            if (typeof ttl === 'undefined')
                ttl = this._util.getRandomInt(this._config.get('cache.expire_min'), this._config.get('cache.expire_max'));

            let client = await this._clientPromise;
            if (!client) {
                debug(`Cache disabled, couldn't set ${name}`);
                return;
            }

            debug(`Setting ${name}`);
            await client.query('SET', [this._getKey(name), value]);
            if (ttl)
                await client.query('EXPIRE', [this._getKey(name), ttl]);
        } catch (error) {
            this._logger.error(new NError(error, { name }, 'Cacher.set()'));
        }
    }

    /**
     * Get variable value refreshing its lifetime
     * @param {string} name                     The name
     * @return {Promise}                        Resolves to variable value or undefined
     */
    async get(name) {
        try {
            let client = await this._clientPromise;
            if (!client) {
                debug(`Cache disabled, couldn't get ${name}`);
                return;
            }

            let result = await client.query('GET', [this._getKey(name)]);
            if (result === null) {
                debug(`Missed ${name}`);
                return;
            }

            debug(`Getting ${name}`);
            return JSON.parse(result);
        } catch (error) {
            this._logger.error(new NError(error, { name }, 'Cacher.get()'));
        }
    }

    /**
     * Remove variable
     * @param {string} name                     The name
     * @return {Promise}                        Resolves on success
     */
    async unset(name) {
        try {
            let client = await this._clientPromise;
            if (!client) {
                debug(`Cache disabled, couldn't unset ${name}`);
                return;
            }

            let result = await client.query('EXISTS', [ this._getKey(name) ]);
            if (!result)
                return;

            debug(`Unsetting ${name}`);
            await client.query('DEL', [ this._getKey(name) ]);
        } catch (error) {
            this._logger.error(new NError(error, { name }, 'Cacher.get()'));
        }
    }

    /**
     * PUBSUB message handler
     * @param {*} message                       Body of the message
     * @return {Promise}
     */
    async onInvalidateMessage(message) {
        if (typeof message !== 'object' || typeof message.key !== 'string')
            this._logger.error('Received invalid cache invalidation message', message);

        try {
            await this.unset(message.key);
        } catch (error) {
            this._logger.error(new NError(error, 'Invalidation of the cache failed'));
        }
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
