/**
 * Udp module
 * @module udp/module
 */

/**
 * Module main class
 */
class Udp {
    /**
     * Create the module
     * @param {App} app                                             The application
     */
    constructor(app) {
        this._app = app;
    }

    /**
     * Service name is 'modules.udp'
     * @type {string}
     */
    static get provides() {
        return 'modules.udp';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return ['app'];
    }

    /**
     * Register with the server
     * @param {object} server                                       Server instance
     * @return {Promise}
     */
    async register(server) {
        if (server.constructor.provides !== 'servers.udp')
            return;

        this.events = this._app.get(/^udp\.events\..+$/);
        for (let event of this.events.values())
            server.on(event.name, event.handle.bind(event));
    }
}

module.exports = Udp;
