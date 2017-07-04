/**
 * Postgres PUBSUB service. Requires 'pg-pubsub' module.
 * @module arpen/services/postgres-pubsub
 */
let PGPubSub;
try {
    PGPubSub = require('pg-pubsub');
} catch (error) {
    // do nothing
}

const debug = require('debug')('arpen:pubsub');
const NError = require('nerror');
const Pubsub = require('./pubsub');

/**
 * Postgres PUBSUB client
 * @property {object} pubConnector                  PUB client connector (PostgresClient)
 * @property {object} subClient                     SUB client (PGPubSub)
 * @property {Map} channels                         Registered channels (name → Set of handlers)
 */
class PostgresPubSubClient extends Pubsub.client {
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
                    reject(new NError(error, `Unsubscribe attempt failed (${channel})`));
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
 * Postgres PubSub service
 * <br><br>
 * pg-pubsub module is required
 */
class PostgresPubSub extends Pubsub {
    /**
     * Create the service
     * @param {object} config       Config service
     * @param {Postgres} postgres   Postgres service
     * @param {Logger} logger       Logger service
     */
    constructor(config, postgres, logger) {
        super();
        this._config = config;
        this._postgres = postgres;
        this._logger = logger;

        if (!PGPubSub)
            throw new Error('pg-pubsub module is required for PostgresPubSub service');
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
     * This service is a singleton
     * @type {string}
     */
    static get lifecycle() {
        return 'singleton';
    }

    /**
     * PUBSUB client class
     * @return {PostgresPubSubClient}
     */
    static get client() {
        return PostgresPubSubClient;
    }

    /**
     * Create actual PUBSUB client
     * @param {string} serverName                   Server name as in config
     * @param {string} [subscriberName]             Client name
     * @return {Promise}
     */
    _createClient(serverName, subscriberName) {
        let fullName = `postgres.${serverName}`;
        return new Promise((resolve, reject) => {
                let config = this._config.get(fullName);
                if (!config)
                    return reject(new Error(`Undefined server name: ${fullName}`));

                try {
                    let connString = `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.db_name}`;
                    let sub = new PGPubSub(connString, {
                        log: (...args) => {
                            if (args.length && subscriberName)
                                args[0] = `[${subscriberName}] ${args[0]}`;
                            this._logger.info(...args);
                        }
                    });
                    resolve(new PostgresPubSubClient(() => { return this._postgres.connect(name); }, sub));
                } catch (error) {
                    reject(new NError(error, `Error creating pubsub instance to ${fullName}`));
                }
            });
    }
}

module.exports = PostgresPubSub;