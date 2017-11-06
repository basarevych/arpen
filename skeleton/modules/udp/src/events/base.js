/**
 * Base event class
 * @module udp/events/base
 */

/**
 * Base event class
 */
class BaseEvent {
    /**
     * Create service
     * @param {App} app                                 The application
     */
    constructor(app) {
        this._app = app;
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return ['app'];
    }

    /**
     * Retrieve server
     * @return {Udp}
     */
    get udp() {
        if (this._udp)
            return this._udp;
        this._udp = this._app.get('servers').get('udp');
        return this._udp;
    }
}

module.exports = BaseEvent;
