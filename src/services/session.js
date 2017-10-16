/**
 * User session service
 * @module arpen/services/session
 */
const moment = require('moment-timezone');
const jwt = require('jsonwebtoken');

/**
 * User sessions registry service
 */
class Session {
    /**
     * Create the service
     * @param {App} app                         The application
     * @param {object} config                   Configuration
     * @param {Logger} logger                   Logger service
     */
    constructor(app, config, logger) {
        this.bridges = new Map();

        this._app = app;
        this._config = config;
        this._logger = logger;
    }

    /**
     * Service name is 'session'
     * @type {string}
     */
    static get provides() {
        return 'session';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [
            'app',
            'config',
            'logger',
        ];
    }

    /**
     * This service is a singleton
     * @type {string}
     */
    static get lifecycle() {
        return 'singleton';
    }

    /**
     * Add new bridge
     * @param {string} name                     Bridge name
     * @param {object} instance                 Bridge instance
     * @return {Promise}
     */
    async addBridge(name, instance) {
        this.bridges.set(
            name,
            {
                instance: instance,
                cache: new Map(),
            }
        );
    }

    /**
     * Destroy a bridge
     * @param {string} name                     Bridge name
     * @return {Promise}
     */
    async removeBridge(name) {
        let bridge = this.bridges.get(name);
        if (!bridge)
            throw new Error(`Bridge not found: ${name}`);

        for (let cache of bridge.cache.values()) {
            if (cache.timer)
                await this._doSave(bridge, cache.session, cache.info);
            if (cache.session)
                this._cacheDel(bridge, cache.session);
        }

        this.bridges.delete(name);
    }

    /**
     * Create new session for a user
     * @param {string} name                     Bridge name
     * @param {UserModel|null} user             User model or null for anonymous session
     * @param {*} [info]                        Extra information for the bridge
     * @return {Promise}                        Resolves to session model
     */
    async create(name, user, info) {
        let bridge = this.bridges.get(name);
        if (!bridge || !bridge.instance.create || !bridge.instance.save)
            throw new Error(`Invalid bridge: ${name}`);

        let session = await bridge.instance.create(user);
        session.payload = {};
        session.createdAt = moment();
        session.updatedAt = session.createdAt;

        this._cacheAdd(bridge, session, info);
        return session;
    }

    /**
     * Load session of a user
     * @param {string} name                     Bridge name
     * @param {*} token                         User token
     * @param {*} [info]                        Extra information for the bridge
     * @return {Promise}                        Resolves to session model
     */
    async load(name, token, info) {
        let bridge = this.bridges.get(name);
        if (!bridge || !bridge.instance.find)
            throw new Error(`Invalid bridge: ${name}`);

        if (bridge.cache.has(token))
            return bridge.cache.get(token).session;

        let session = await bridge.instance.find(token);
        if (session)
            this._cacheAdd(bridge, session, info);

        return session;
    }

    /**
     * Update session of a user
     * @param {string} name                     Bridge name
     * @param {SessionModel} session            Session model
     * @param {*} [info]                        Extra information for the bridge
     * @return {Promise}
     */
    async update(name, session, info) {
        let bridge = this.bridges.get(name);
        if (!bridge || !bridge.instance.save)
            throw new Error(`Invalid bridge: ${name}`);

        let cache = bridge.cache.get(session.token);
        if (!cache)
            return;

        session.updatedAt = moment();
        cache.session = session;
        if (info)
            cache.info = info;

        let schedule = bridge.instance.saveInterval
            ? session.updatedAt.add(bridge.instance.saveInterval, 'seconds').valueOf() - moment().valueOf()
            : 0;

        if (this.isEmpty(session) || !session.id || schedule <= 0) {
            await this._doSave(bridge, cache.session, cache.info);
        } else if (!cache.timer) {
            let token = session.token;
            cache.timer = setTimeout(
                async () => {
                    let cache = bridge.cache.get(token);
                    if (!cache)
                        return;

                    cache.timer = null;
                    return this._doSave(bridge, cache.session, cache.info);
                },
                schedule
            );
        }
    }

    /**
     * Destroy session of a user
     * @param {string} name                     Bridge name
     * @param {SessionModel} session            Session model
     * @return {Promise}
     */
    async destroy(name, session) {
        let bridge = this.bridges.get(name);
        if (!bridge || !bridge.instance.destroy)
            throw new Error(`Invalid bridge: ${name}`);

        try {
            if (this.isValid(name, session) && session.id)
                await bridge.instance.destroy(session);
        } catch (error) {
            // do nothing
        }
        this._cacheDel(bridge, session);
    }

    /**
     * Is session valid?
     * @param {string} name                     Bridge name
     * @param {SessionModel} session            Session model
     * @return {boolean}
     */
    isValid(name, session) {
        let bridge = this.bridges.get(name);
        if (!bridge)
            throw new Error(`Invalid bridge: ${name}`);

        return bridge.cache.has(session.token);
    }

    /**
     * Is session empty
     * @param {SessionModel} session            Session model
     * @return {boolean}
     */
    isEmpty(session) {
        return !session.user && !Object.keys(session.payload).length;
    }

    /**
     * Encode JWT
     * @param {string} name                     Bridge name
     * @param {SessionModel} session            Session model
     * @param {object} [payload]                Token payload
     * @return {Promise}                        Resolves to JWT string
     */
    async encodeJwt(name, session, payload) {
        let bridge = this.bridges.get(name);
        if (!bridge || !bridge.instance.secret)
            throw new Error(`Invalid bridge: ${name}`);

        if (!payload)
            payload = {};
        payload._token = session.token;

        return jwt.sign(payload, bridge.instance.secret);
    }

    /**
     * Decode JWT
     * @param {string} name                     Bridge name
     * @param {string} token                    JWT string
     * @return {Promise}                        Resolves to [session, payload]
     */
    async decodeJwt(name, token) {
        let bridge = this.bridges.get(name);
        if (!bridge || !bridge.instance.secret)
            throw new Error(`Invalid bridge: ${name}`);

        if (typeof token !== 'string' || !token.length)
            return null;

        let payload = await new Promise(resolve => {
            jwt.verify(token, bridge.instance.secret, (error, payload) => {
                if (error)
                    this._logger.debug('session', error.message);

                if (error || !payload || !payload._token)
                    return resolve(null);

                resolve(payload);
            });
        });

        return [payload && await this.load(name, payload._token), payload];
    }

    /**
     * Add session to the cache
     * @param {object} bridge                   Bridge object
     * @param {SessionModel} session            Session model
     * @param {*} [info]                        Extra information for the bridge
     */
    _cacheAdd(bridge, session, info) {
        if (bridge.cache.has(session.token))
            return;

        bridge.cache.set(
            session.token,
            {
                timer: null,
                session: session,
                info: info,
            }
        );
    }

    /**
     * Remove session from the cache
     * @param {object} bridge                   Bridge object
     * @param {SessionModel} session            Session model
     */
    _cacheDel(bridge, session) {
        let cache = bridge.cache.get(session.token);
        if (!cache)
            return;

        if (cache.timer) {
            clearTimeout(cache.timer);
            cache.timer = null;
        }

        bridge.cache.delete(session.token);
    }

    /**
     * Actual saving attempt
     * @param {object} bridge                   Bridge object
     * @param {SessionModel} session            Session model
     * @param {*} [info]                        Extra information for the bridge
     * @return {Promise}
     */
    async _doSave(bridge, session, info) {
        try {
            if (this.isEmpty(session)) {
                if (session.id)
                    await bridge.instance.destroy(session);
                this._cacheDel(bridge, session);
            } else {
                await bridge.instance.save(session, info);
            }
        } catch (error) {
            this._cacheDel(bridge, session);
        }
    }
}

module.exports = Session;
