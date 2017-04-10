/**
 * ExpressJS web server
 * @module arpen/servers/express
 */
const debug = require('debug')('arpen:server');
const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const WError = require('verror').WError;

/**
 * Server class
 */
class Express {
    /**
     * Create the service
     * @param {App} app                     Application
     * @param {object} config               Configuration
     * @param {Filer} filer                 Filer service
     * @param {Logger} logger               Logger service
     */
    constructor(app, config, filer, logger) {
        this.name = null;
        this.express = express();
        this.http = null;
        this.https = null;
        this.middleware = new Map();

        this._app = app;
        this._config = config;
        this._filer = filer;
        this._logger = logger;
    }

    /**
     * Service name is 'servers.express'
     * @type {string}
     */
    static get provides() {
        return 'servers.express';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'config', 'filer', 'logger' ];
    }

    /**
     * Initialize the server
     * @param {string} name                     Config section name
     * @return {Promise}
     */
    init(name) {
        this.name = name;

        return new Promise((resolve, reject) => {
                try {
                    debug('Initializing express');
                    this.express.set('env', this._config.get('env'));
                    let options = this._config.get(`servers.${name}.express`);
                    for (let option of Object.keys(options)) {
                        let name = option.replace('_', ' ');
                        let value = options[option];
                        this.express.set(name, value);
                    }

                    let views = [];
                    for (let [ moduleName, moduleConfig ] of this._config.modules) {
                        for (let view of moduleConfig.views || []) {
                            let filename = (view[0] === '/' ? view : path.join(this._config.base_path, 'modules', moduleName, view));
                            views.push(filename);
                        }
                    }
                    this.express.set('views', views);
                    resolve();
                } catch (error) {
                    reject(new WError(error, 'Express.init()'));
                }
            })
            .then(() => {
                if (!this._config.get(`servers.${name}.ssl.enable`)) {
                    this.http = http.createServer(this.express);
                    return this.http;
                }

                let key = this._config.get(`servers.${name}.ssl.key`);
                if (key && key[0] !== '/')
                    key = path.join(this._config.base_path, key);
                let cert = this._config.get(`servers.${name}.ssl.cert`);
                if (cert && cert[0] !== '/')
                    cert = path.join(this._config.base_path, cert);
                let ca = this._config.get(`server.${name}.ssl.ca`);
                if (ca && ca[0] !== '/')
                    ca = path.join(this._config.base_path, ca);

                let promises = [
                    this._filer.lockReadBuffer(key),
                    this._filer.lockReadBuffer(cert),
                ];
                if (ca)
                    promises.push(this._filer.lockReadBuffer(ca));

                return Promise.all(promises)
                    .then(([ key, cert, ca ]) => {
                        let options = {
                            key: key,
                            cert: cert,
                        };
                        if (ca)
                            options.ca = ca;

                        this.https = https.createServer(options, this.express);
                        return this.https;
                    });
            })
            .then(server => {
                server.on('error', this.onError.bind(this));
                server.on('listening', this.onListening.bind(this));
            });
    }

    /**
     * Start the server
     * @param {string} name                     Config section name
     * @return {Promise}
     */
    start(name) {
        if (name !== this.name)
            return Promise.reject(new Error(`Server ${name} was not properly bootstrapped`));

        return Array.from(this._app.get('modules')).reduce(
                (prev, [ curName, curModule ]) => {
                    return prev.then(() => {
                        if (!curModule.register)
                            return;

                        let result = curModule.register(name);
                        if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                            throw new Error(`Module '${curName}' register() did not return a Promise`);
                        return result;
                    });
                },
                Promise.resolve()
            )
            .then(() => {
                debug('Loading middleware');
                let middlewareConfig = this._config.get(`servers.${name}.middleware`);
                if (!Array.isArray(middlewareConfig))
                    return;

                return middlewareConfig.reduce(
                    (prev, cur) => {
                        return prev.then(() => {
                            let middleware = this._app.get(cur);
                            this.middleware.set(cur, middleware);

                            debug(`Registering middleware ${cur}`);
                            return middleware.register(this);
                        });
                    },
                    Promise.resolve()
                );
            })
            .then(() => {
                debug('Starting the server');
                let port = this._normalizePort(this._config.get(`servers.${name}.port`));
                let http = this.http || this.https;

                try {
                    http.listen(port, typeof port === 'string' ? undefined : this._config.get(`servers.${name}.host`));
                } catch (error) {
                    throw new WError(error, 'Express.start()');
                }
            });
    }

    /**
     * Error handler
     * @param {object} error            The error
     */
    onError(error) {
        if (error.syscall !== 'listen')
            return this._logger.error(new WError(error, 'Express.onError()'));

        let msg;
        switch (error.code) {
            case 'EACCES':
                msg = 'Could not bind to web server port';
                break;
            case 'EADDRINUSE':
                msg = 'Web server port is already in use';
                break;
            default:
                msg = error;
        }
        this._logger.error(msg, () => { process.exit(1); });
    }

    /**
     * Listening event handler
     */
    onListening() {
        let port = this._normalizePort(this._config.get(`servers.${this.name}.port`));
        this._logger.info(
            (this._config.get(`servers.${this.name}.ssl.enable`) ? 'HTTPS' : 'HTTP') +
            ' server listening on ' +
            (typeof port === 'string' ?
                port :
            this._config.get(`servers.${this.name}.host`) + ':' + port)
        );
    }

    /**
     * Normalize port parameter
     * @param {string|number} val           Port value
     * @return {*}
     */
    _normalizePort(val) {
        let port = parseInt(val, 10);
        if (isNaN(port))
            return val;
        if (port >= 0)
            return port;
        return false;
    }
}

module.exports = Express;