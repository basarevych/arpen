/**
 * Redis PUBSUB service. Requires 'redis'.
 * @module arpen/services/redis-pubsub
 */
const debug = require('debug')('arpen:pubsub');
const NError = require('nerror');
const Pubsub = require('./pubsub');

/**
 * Redis PUBSUB client
 * @property {object} pubConnector                  PUB client connector (RedisClient)
 * @property {object} subClient                     SUB client (RedisClient)
 * @property {Map} channels                         Registered channels (name → Set of handlers)
 */
class RedisPubSubClient extends Pubsub.client {
    /**
     * Create the client
     * @param {object} pubConnector                 PUB client connector
     * @param {object} subClient                    SUB client
     */
    constructor(pubConnector, subClient) {
        super(pubConnector, subClient);

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
    async subscribe(channel, handler) {
        return new Promise(async (resolve, reject) => {
            try {
                let needSubscribe;
                let handlers = new Set();
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
                await this.subClient.client.subscribe(channel);
            } catch (error) {
                reject(new NError(error, `Subscribe attempt failed (${channel})`));
            }
        });
    }

    /**
     * Unsubscribe from a channel
     * @param {string} channel                      Channel name
     * @param {Subscriber} handler                  Handler function
     * @return {Promise}                            Resolves on success
     */
    async unsubscribe(channel, handler) {
        try {
            let handlers = this.channels.get(channel);
            if (!handlers)
                throw new Error(`No such channel: ${channel}`);
            if (!handlers.has(handler))
                throw new Error(`No such handler in the channel: ${channel}`);

            handlers.delete(handler);
            if (!handlers.size) {
                await this.subClient.client.unsubscribe(channel);
                this.channels.delete(channel);
            }
        } catch (error) {
            throw new NError(error, `Unsubscribe attempt failed (${channel})`);
        }
    }

    /**
     * Publish a message after passing it through JSON.stringify()
     * @param {string} channel                      Channel name
     * @param {*} message                           Message
     * @return {Promise}                            Resolves on success
     */
    async publish(channel, message) {
        let pub;
        try {
            pub = await this.pubConnector();
            await pub.query('PUBLISH', [ channel, JSON.stringify(message) ]);
            pub.done();
        } catch (error) {
            if (pub)
                pub.done();
            throw error;
        }
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
            if (thisChannel === channel) {
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
class RedisPubSub extends Pubsub {
    /**
     * Create the service
     * @param {object} config       Config service
     * @param {Redis} redis         Redis service
     * @param {Logger} logger       Logger service
     */
    constructor(config, redis, logger) {
        super();
        this._config = config;
        this._redis = redis;
        this._logger = logger;
    }

    /**
     * Service name is 'redisPubSub'
     * @type {string}
     */
    static get provides() {
        return 'redisPubSub';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'config', 'redis', 'logger' ];
    }

    /**
     * This service is a singleton
     * @type {string}
     */
    static get lifecycle() {
        return 'singleton';
    }

    /**
     * PUBSUB client class
     * @return {RedisPubSubClient}
     */
    static get client() {
        return RedisPubSubClient;
    }

    /**
     * Create actual PUBSUB client
     * @param {string} serverName                   Server name as in config
     * @param {string} [subscriberName]             Client name
     * @return {Promise}
     */
    async _createClient(serverName, subscriberName) {
        let fullName = `redis.${serverName}`;
        try {
            let config = this._config.get(fullName);
            if (!config)
                throw new Error(`Undefined server name: ${fullName}`);

            let sub = await this._redis.connect(serverName);
            if (subscriberName) {
                sub.client.on('reconnecting', () => {
                    this._logger.info(`[${subscriberName}] Connection lost. Reconnecting...`);
                });
                sub.client.on('subscribe', () => {
                    this._logger.info(`[${subscriberName}] Subscribed successfully`);
                });
            }
            return new RedisPubSubClient(async () => { return this._redis.connect(serverName); }, sub);
        } catch (error) {
            throw new NError(error, `Error creating pubsub instance to ${fullName}`);
        }
    }
}

module.exports = RedisPubSub;
