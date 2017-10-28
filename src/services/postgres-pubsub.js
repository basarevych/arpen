/**
 * Postgres PUBSUB service. Requires 'pg' and 'pg-format' modules.
 * @module arpen/services/postgres-pubsub
 */
let pgFormat;
try {
    pgFormat = require('pg-format');
} catch (error) {
    // do nothing
}

const debug = require('debug')('arpen:pubsub');
const NError = require('nerror');
const Pubsub = require('./pubsub');

/**
 * Postgres PubSub service
 * <br><br>
 * pg and pg-format modules are required
 */
class PostgresPubSub extends Pubsub.client {
    /**
     * Create the service
     * @param {object} config               Config service
     * @param {Postgres} postgres           Postgres service
     * @param {Logger} logger               Logger service
     * @param {string} serverName           Name of the instance
     * @param {string} [subscriberName]     Name of this pubsub
     */
    constructor(config, postgres, logger, serverName, subscriberName) {
        super();

        this._config = config;
        this._postgres = postgres;
        this._logger = logger;
        this._serverName = serverName;
        this._subscriberName = subscriberName;
        this._started = false;
        this._ended = false;

        if (!pgFormat)
            throw new Error('pg-format module is required for PostgresPubSub service');
    }

    /**
     * Service name is 'postgresPubSub'
     * @type {string}
     */
    static get provides() {
        return 'postgresPubSub';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'config', 'postgres', 'logger' ];
    }

    /**
     * Client termination
     */
    done() {
        this._ended = true;
        for (let channel of this.channels.keys()) {
            if (this._sub) {
                this._sub.query(`UNLISTEN "${channel}"`)
                    .catch(error => {
                        this._logger.error(new NError(error, 'PostgresPubsub.done()'));
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
                throw new Error(`Channel already subscribed: ${channel}`);

            handlers.add(handler);

            if (needSubscribe)
                await this._getSub(channel);
        } catch (error) {
            throw new NError(error, `Subscribe attempt failed (${channel})`);
        }
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
                    await this._sub.query(`UNLISTEN "${channel}"`);
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
            await pub.query(`NOTIFY "${channel}", ${pgFormat.literal(JSON.stringify(message))}`);
            pub.done();
        } catch (error) {
            if (pub)
                pub.done();
            throw new NError(error, `Publish attempt failed (${channel})`);
        }
    }

    /**
     * Message event handler
     * @param {string} channel                      Channel name
     * @param {string} message                      Message
     */
    onMessage(channel, message) {
        debug(`Received ${channel} (Postgres)`);

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
        return this._postgres.connect(this._serverName);
    }

    /**
     * Get SUB client
     * @param {string} [subsrcribe]                 Subscribe to this if sub is already created
     * @return {Promise}
     */
    async _getSub(subscribe) {
        if (this._started) {
            if (subscribe)
                await this._sub.query(`LISTEN "${subscribe}"`);
            return this._sub;
        }

        this._stared = true;
        let connect = async () => {
            try {
                this._sub = await this._postgres.connect(this._serverName);
                this._sub.client.on('end', () => {
                    this._sub = null;

                    if (this._subscriberName)
                        this._logger.info(`[${this._subscriberName}] Connection lost.${this._ended ? '' : ' Reconnecting...'}`);

                    if (!this._ended)
                        connect();
                });
                this._sub.client.on('notification', notification => {
                    this.onMessage(notification.channel, notification.payload);
                });
                for (let channel of this.channels.keys())
                    await this._sub.query(`LISTEN "${channel}"`);
                this._logger.info(`[${this._subscriberName}] Subscribed successfully`);
            } catch (error) {
                this._logger.error(new NError(error, 'PostgresPubsub._getSub()'));
            }
        };

        await connect();
        return this._sub;
    }
}

module.exports = PostgresPubSub;
