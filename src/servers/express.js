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
    bootstrap(name) {
        this.name = name;
        let exp = express();

        return new Promise((resolve, reject) => {
                this._app.registerInstance(exp, 'express');

                debug('Initializing express');
                exp.set('env', this._config.get('env'));
                let options = this._config.get(`servers.${name}.express`);
                for (let option of Object.keys(options)) {
                    let name = option.replace('_', ' ');
                    let value = options[option];
                    exp.set(name, value);
                }

                let views = [];
                for (let _module of this._config.modules) {
                    for (let view of _module.views) {
                        let filename = (view[0] == '/' ? view : path.join(this._config.base_path, 'modules', _module.name, view));
                        views.push(filename);
                    }
                }
                exp.set('views', views);

                debug('Loading middleware');
                let middlewareConfig = this._config.get(`servers.${name}.middleware`);
                if (!Array.isArray(middlewareConfig))
                    return resolve();

                let loadedMiddleware = new Map();
                this._app.registerInstance(loadedMiddleware, 'middleware');

                middlewareConfig.reduce(
                        (prev, cur) => {
                            return prev.then(() => {
                                let middleware = this._app.get(cur);
                                loadedMiddleware.set(cur, middleware);

                                debug(`Registering middleware ${cur}`);
                                return middleware.register();
                            });
                        },
                        Promise.resolve()
                    )
                    .then(
                        () => {
                            resolve();
                        },
                        error => {
                            reject(error);
                        }
                    );
            })
            .then(() => {
                if (!this._config.get(`servers.${name}.ssl.enable`))
                    return http.createServer(exp);

                let promises = [
                    this._filer.lockReadBuffer(this._config.get(`servers.${name}.ssl.key`)),
                    this._filer.lockReadBuffer(this._config.get(`servers.${name}.ssl.cert`)),
                ];
                if (this._config.get(`server.${name}.ssl.ca`))
                    promises.push(this._filer.lockReadBuffer(this._config.get(`servers.${name}.ssl.ca`)));

                return Promise.all(promises)
                    .then(([key, cert, ca]) => {
                        let options = {
                            key: key,
                            cert: cert,
                        };
                        if (ca)
                            options.ca = ca;

                        return https.createServer(options, exp);
                    });
            })
            .then(server => {
                this._app.registerInstance(server, 'http');
            });
    }

    /**
     * Start the server
     * @return {Promise}
     */
    start() {
        return new Promise((resolve, reject) => {
            debug('Starting the server');
            let port = this._normalizePort(this._config.get(`servers.${this.name}.port`));
            let http = this._app.get('http');

            try {
                http.listen(port, typeof port == 'string' ? undefined : this._config.get(`servers.${this.name}.host`));
                http.on('error', this.onError.bind(this));
                http.on('listening', this.onListening.bind(this));
                resolve();
            } catch (error) {
                reject(new WError(error, 'Express.start()'));
            }
        });
    }

    /**
     * Error handler
     * @param {object} error            The error
     */
    onError(error) {
        if (error.syscall !== 'listen')
            return this._logger.error(new WError(error, 'WebServer.onError()'));

        switch (error.code) {
            case 'EACCES':
                this._logger.error('Port requires elevated privileges');
                break;
            case 'EADDRINUSE':
                this._logger.error('Port is already in use');
                break;
            default:
                this._logger.error(error);
        }
        process.exit(1);
    }

    /**
     * Listening event handler
     */
    onListening() {
        let port = this._normalizePort(this._config.get(`servers.${this.name}.port`));
        this._logger.info(
            (this._config.get(`servers.${this.name}.ssl.enable`) ? 'HTTPS' : 'HTTP') +
            ' server listening on ' +
            (typeof port == 'string' ?
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