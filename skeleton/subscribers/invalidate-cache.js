/**
 * Invalidate cache subscriber
 * @module subscribers/invalidate-cache
 */

class InvalidateCache {
    /**
     * Create the service
     * @param {PubSub} pubsub                   PubSub service
     * @param {Cacher} cacher                   Cacher service
     * @param {Logger} logger                   Logger service
     */
    constructor(pubsub, cacher, logger) {
        this._pubsub = pubsub;
        this._cacher = cacher;
        this._logger = logger;
    }

    /**
     * Service name is 'subscribers.invalidateCache'
     * @type {string}
     */
    static get provides() {
        return 'subscribers.invalidateCache';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'pubsub', 'cacher', 'logger' ];
    }

    /**
     * Initialize the subscriber
     * @return {Promise}
     */
    register() {
        return this._pubsub.connect('InvalidateCache', 'postgres.main')
            .then(client => {
                return client.subscribe("invalidate_cache", this.onMessage.bind(this));
            });
    }

    /**
     * PUBSUB message handler
     * @param {*} message                       Body of the message
     */
    onMessage(message) {
        if (typeof message != 'object' || typeof message.key != 'string')
            this._logger.error('Received invalid cache invalidation message', message);

        this._cacher.unset('sql:' + message.key)
            .catch(error => {
                this._logger.error('Invalidation of the cache failed', error);
            });
    }
}

module.exports = InvalidateCache;
