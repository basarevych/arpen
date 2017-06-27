/**
 * PUBSUB base service
 * @module arpen/services/pubsub
 */
const debug = require('debug')('arpen:pubsub');
const NError = require('nerror');

/**
 * Channel message callback
 * @callback Subscriber
 * @param {*} message                               The message after passing it through JSON.parse(). If it fails then
 *                                                  the raw message is used as this argument
 */

/**
 * PUBSUB client
 * @property {object} pubConnector                  PUB client connector (RedisClient)
 * @property {object} subClient                     SUB client (RedisClient)
 * @property {Map} channels                         Registered channels (name → Set of handlers)
 */
class PubSubClient {
    /**
     * Create the client
     * @param {object} pubConnector                 PUB client connector
     * @param {object} subClient                    SUB client
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
        throw new Error('Not implemented');
    }

    /**
     * Subscribe to a channel
     * @param {string} channel                      Channel name
     * @param {Subscriber} handler                  Handler function
     * @return {Promise}                            Resolves on success
     */
    subscribe(channel, handler) {
        return Promise.reject(new Error('Not implemented'));
    }

    /**
     * Unsubscribe from a channel
     * @param {string} channel                      Channel name
     * @param {Subscriber} handler                  Handler function
     * @return {Promise}                            Resolves on success
     */
    unsubscribe(channel, handler) {
        return Promise.reject(new Error('Not implemented'));
    }

    /**
     * Publish a message after passing it through JSON.stringify()
     * @param {string} channel                      Channel name
     * @param {*} message                           Message
     * @return {Promise}                            Resolves on success
     */
    publish(channel, message) {
        return Promise.reject(new Error('Not implemented'));
    }
}

/**
 * PubSub service
 */
class PubSub {
    /**
     * Create the service
     */
    constructor() {
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
        return [];
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
     * @return {PubSubClient}
     */
    static get client() {
        return PubSubClient;
    }

    /**
     * Get pubsub client
     * @param {string} [serverName='main']          Server name as in config, default is 'main'
     * @param {string|null} [subscriberName]        This subscriber name
     * @param {string|null} [cacheName=null]        Store and later reuse this pubsub client under this name
     * @return {Promise}                            Resolves to pubsub client instance
     */
    connect(serverName = 'main', subscriberName = null, cacheName = null) {
        return Promise.resolve()
            .then(() => {
                if (cacheName && this._cache.has(cacheName))
                    return this._cache.get(cacheName);

                return this._createClient(serverName, subscriberName)
                    .then(pubsub => {
                        if (cacheName)
                            this._cache.set(cacheName, pubsub);
                        return pubsub;
                    });
            });
    }

    /**
     * Create actual PUBSUB client
     * @param {string} serverName                   Server name as in config
     * @param {string} [subscriberName]             Client name
     * @return {Promise}
     */
    _createClient(serverName, subscriberName) {
        return Promise.reject(new Error('Should be overriden'));
    }
}

module.exports = PubSub;