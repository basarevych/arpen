/**
 * PUBSUB service
 * @module arpen/services/pubsub
 */
const debug = require('debug')('arpen:pubsub');
const PGPubSub = require('pg-pubsub');
const WError = require('verror').WError;

/**
 * Channel message callback
 * @callback Subscriber
 * @param {*} message                               The message after passing it through JSON.parse(). If it fails then
 *                                                  the raw message is used as this argument
 */

/**
 * Postgres PUBSUB client
 * @property {object} pubConnector                  PUB client connector (PostgresClient)
 * @property {object} subClient                     SUB client (PGPubSub)
 * @property {Map} channels                         Registered channels (name → Set of handlers)
 */
class PostgresPubSub {
    /**
     * Create the client
     * @param {object} pubConnector                 PUB client connector (PostgresClient)
     * @param {object} subClient                    SUB client (PGPubSub)
     */
    constructor(pubConnector, subClient) {
        this.pubConnector = pubConnector;
        this.subClient = subClient;
        this.channels = new Map();
    }

    /**
     * Client termination
     */
    done() {
        for (let channel of this.channels.keys()) {
            this.subClient.removeChannel(channel);
            this.channels.delete(channel);
        }
        this.subClient.close();
    }

    /**
     * Subscribe to a channel
     * @param {string} channel                      Channel name
     * @param {Subscriber} handler                  Handler function
     * @return {Promise}                            Resolves on success
     */
    subscribe(channel, handler) {
        return new Promise((resolve, reject) => {
                try {
                    let handlers = new Set();
                    if (this.channels.has(channel))
                        handlers = this.channels.get(channel);
                    else
                        this.channels.set(channel, handlers);

                    if (handlers.has(handler))
                        return reject(new Error(`Channel already subscribed: ${channel}`));

                    this.subClient.addChannel(
                        channel,
                        message => {
                            debug(`Received ${channel} (Postgres)`);
                            handler(message);
                        }
                    );
                    handlers.add(handler);

                    resolve();
                } catch (error) {
                    reject(new WError(error, `Subscribe attempt failed (${channel})`));
                }
            });
    }

    /**
     * Unsubscribe from a channel
     * @param {string} channel                      Channel name
     * @param {Subscriber} handler                  Handler function
     * @return {Promise}                            Resolves on success
     */
    unsubscribe(channel, handler) {
        return new Promise((resolve, reject) => {
                try {
                    let handlers = this.channels.get(channel);
                    if (!handlers)
                        return reject(new Error(`No such channel: ${channel}`));
                    if (!handlers.has(handler))
                        return reject(new Error(`No such handler in the channel: ${channel}`));

                    this.subClient.removeChannel(channel, handler);

                    handlers.delete(handler);
                    if (!handlers.size)
                        this.channels.delete(channel);

                    resolve();
                } catch (error) {
                    reject(new WError(error, `Unsubscribe attempt failed (${channel})`));
                }
            });
    }

    /**
     * Publish a message after passing it through JSON.stringify()
     * @param {string} channel                      Channel name
     * @param {*} message                           Message
     * @return {Promise}                            Resolves on success
     */
    publish(channel, message) {
        return this.pubConnector()
            .then(pub => {
                return pub.query('NOTIFY $1, $2', [ channel, JSON.stringify(message) ])
                    .then(
                        value => {
                            pub.done();
                            return value;
                        },
                        error => {
                            pub.done();
                            throw error;
                        }
                    );
            });
    }
}

/**
 * Redis PUBSUB client
 * @property {object} pubConnector                  PUB client connector (RedisClient)
 * @property {object} subClient                     SUB client (RedisClient)
 * @property {Map} channels                         Registered channels (name → Set of handlers)
 */
class RedisPubSub {
    /**
     * Create the client
     * @param {object} pubConnector                 PUB client connector (RedisClient)
     * @param {object} subClient                    SUB client (RedisClient)
     */
    constructor(pubConnector, subClient) {
        this.pubConnector = pubConnector;
        this.subClient = subClient;
        this.channels = new Map();

        this._subscriptions = new Map();
        this.subClient.client.on('subscribe', this.onSubscribe.bind(this));
        this.subClient.client.on('message', this.onMessage.bind(this));
    }

    /**
     * Client termination
     */
    done() {
        for (let channel of this.channels.keys()) {
            this.subClient.client.unsubscribe(channel);
            this.channels.delete(channel);
        }
        this.subClient.done();
    }

    /**
     * Subscribe to a channel
     * @param {string} channel                      Channel name
     * @param {Subscriber} handler                  Handler function
     * @return {Promise}                            Resolves on success
     */
    subscribe(channel, handler) {
        return new Promise((resolve, reject) => {
                try {
                    let needSubscribe, handlers = new Set();
                    if (this.channels.has(channel)) {
                        needSubscribe = false;
                        handlers = this.channels.get(channel);
                    } else {
                        needSubscribe = true;
                        this.channels.set(channel, handlers);
                    }

                    if (handlers.has(handler))
                        return reject(new Error(`Channel already subscribed: ${channel}`));

                    handlers.add(handler);

                    if (!needSubscribe)
                        return resolve();

                    this._subscriptions.set(channel, resolve);
                    this.subClient.client.subscribe(channel);
                } catch (error) {
                    reject(new WError(error, `Subscribe attempt failed (${channel})`));
                }
            });
    }

    /**
     * Unsubscribe from a channel
     * @param {string} channel                      Channel name
     * @param {Subscriber} handler                  Handler function
     * @return {Promise}                            Resolves on success
     */
    unsubscribe(channel, handler) {
        return new Promise((resolve, reject) => {
                try {
                    let handlers = this.channels.get(channel);
                    if (!handlers)
                        return reject(new Error(`No such channel: ${channel}`));
                    if (!handlers.has(handler))
                        return reject(new Error(`No such handler in the channel: ${channel}`));

                    handlers.delete(handler);
                    if (!handlers.size) {
                        this.subClient.client.unsubscribe(channel);
                        this.channels.delete(channel);
                    }

                    resolve();
                } catch (error) {
                    reject(new WError(error, `Unsubscribe attempt failed (${channel})`));
                }
            });
    }

    /**
     * Publish a message after passing it through JSON.stringify()
     * @param {string} channel                      Channel name
     * @param {*} message                           Message
     * @return {Promise}                            Resolves on success
     */
    publish(channel, message) {
        return this.pubConnector()
            .then(pub => {
                return pub.query('PUBLISH', [ channel, JSON.stringify(message) ])
                    .then(
                        value => {
                            pub.done();
                            return value;
                        },
                        error => {
                            pub.done();
                            throw error;
                        }
                    );
            });
    }

    /**
     * Subscribe event handler
     * @param {string} channel                      Channel name
     */
    onSubscribe(channel) {
        if (this._subscriptions.has(channel)) {
            this._subscriptions.get(channel)();
            this._subscriptions.delete(channel);
        }
    }

    /**
     * Message event handler
     * @param {string} channel                      Channel name
     * @param {string} message                      Message
     */
    onMessage(channel, message) {
        debug(`Received ${channel} (Redis)`);

        try {
            message = JSON.parse(message);
        } catch (error) {
            // do nothing
        }

        for (let thisChannel of this.channels.keys()) {
            if (thisChannel == channel) {
                for (let handler of this.channels.get(thisChannel))
                    handler(message);
                break;
            }
        }
    }
}

/**
 * PubSub service
 */
class PubSub {
    /**
     * Create the service
     * @param {object} config       Config service
     * @param {Postgres} postgres   Postgres service
     * @param {Redis} redis         Redis service
     * @param {Logger} logger       Logger service
     */
    constructor(config, postgres, redis, logger) {
        this._config = config;
        this._postgres = postgres;
        this._redis = redis;
        this._logger = logger;
        this._cache = new Map();
    }

    /**
     * Service name is 'pubsub'
     * @type {string}
     */
    static get provides() {
        return 'pubsub';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'config', 'postgres', 'redis', 'logger' ];
    }

    /**
     * This service is a singleton
     * @type {string}
     */
    static get lifecycle() {
        return 'singleton';
    }

    /**
     * Get pubsub client
     * @param {string} [subscriberName]             This subscriber name
     * @param {string} [serverName='redis.main']    Server name like 'redis.main' or 'postgres.main'
     * @param {string|null} [cacheName=null]        Store and later reuse this pubsub client under this name
     * @return {Promise}                            Resolves to corresponding pubsub client instance
     */
    connect(subscriberName, serverName = 'redis.main', cacheName = null) {
        return new Promise((resolve, reject) => {
                if (cacheName && this._cache.has(cacheName))
                    return resolve(this._cache.get(cacheName));

                let config = this._config.get(serverName);
                if (!config)
                    return reject(new Error(`Undefined server name: ${serverName}`));

                let [ server, name ] = serverName.split('.');
                let pubsub;
                switch (server) {
                    case 'postgres':
                        try {
                            let connString = `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.db_name}`;
                            let sub = new PGPubSub(connString, {
                                log: (...args) => {
                                    if (args.length)
                                        args[0] = `[${subscriberName}] ${args[0]}`;
                                    this._logger.info(...args);
                                }
                            });
                            resolve(new PostgresPubSub(() => { return this._postgres.connect(name); }, sub));
                        } catch (error) {
                            reject(new WError(error, `Error creating pubsub instance ${serverName}`));
                        }
                        break;
                    case 'redis':
                        this._redis.connect(name)
                            .then(sub => {
                                sub.client.on('reconnecting', () => { this._logger.info(`[${subscriberName}] Connection lost. Reconnecting...`); });
                                sub.client.on('subscribe', () => { this._logger.info(`[${subscriberName}] Subscribed successfully`); });
                                resolve(new RedisPubSub(() => { return this._redis.connect(name); }, sub));
                            })
                            .catch(error => {
                                reject(new WError(error, `Error creating pubsub instance ${serverName}`));
                            });
                        break;
                    default:
                        reject(new Error(`Unsupported server: ${server}`));
                        break;
                }
            })
            .then(pubsub => {
                if (cacheName)
                    this._cache.set(cacheName, pubsub);
                return pubsub;
            });
    }
}

module.exports = PubSub;