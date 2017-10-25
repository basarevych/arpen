/**
 * Redis PUBSUB service. Requires 'redis'.
 * @module arpen/services/redis-pubsub
 */
const debug = require('debug')('arpen:pubsub');
const NError = require('nerror');
const Pubsub = require('./pubsub');

/**
 * PubSub service
 * <br><br>
 * redis module is required
 */
class RedisPubSub extends Pubsub.client {
    /**
     * Create the service
     * @param {object} config               Config service
     * @param {Redis} redis                 Redis service
     * @param {Logger} logger               Logger service
     * @param {string} serverName           Name of the instance
     * @param {string} [subscriberName]     Name of this pubsub
     */
    constructor(config, redis, logger, serverName, subscriberName) {
        super();

        this._config = config;
        this._redis = redis;
        this._logger = logger;
        this._serverName = serverName;
        this._subscriberName = subscriberName;

        this._subscriptions = new Map();
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
     * Client termination
     */
    done() {
        for (let channel of this.channels.keys()) {
            if (this._sub) {
                this._sub.client.unsubscribe(channel)
                    .catch(error => {
                        this._logger.error(new NError(error, 'RedisPubsub.done()'));
                    });
            }
            this.channels.delete(channel);
        }
        if (this._sub)
            this._sub.done();
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
                let sub = await this._getSub();
                await sub.client.subscribe(channel);
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
                if (this._sub)
                    await this._sub.client.unsubscribe(channel);
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
            pub = await this._getPub();
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

        for (let handler of this.channels.get(channel) || [])
            handler(message);
    }

    /**
     * Get PUB client
     * @return {Promise}
     */
    async _getPub() {
        return this._redis.connect(this._serverName);
    }

    /**
     * Get SUB client
     * @return {Promise}
     */
    async _getSub() {
        if (this._sub)
            return this._sub;

        this._sub = await this._redis.connect(this._serverName);
        if (this._subscriberName) {
            this._sub.client.on('reconnecting', () => {
                this._logger.info(`[${this._subscriberName}] Connection lost. Reconnecting...`);
            });
            this._sub.client.on('subscribe', () => {
                this._logger.info(`[${this._subscriberName}] Subscribed successfully`);
            });
        }
        this._sub.client.on('subscribe', this.onSubscribe.bind(this));
        this._sub.client.on('message', this.onMessage.bind(this));
        return this._sub;
    }
}

module.exports = RedisPubSub;
