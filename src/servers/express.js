/**
 * ExpressJS web server
 * @module arpen/servers/express
 */
let express;
try {
    express = require('express');
} catch (error) {
    // do nothing
}

const http = require('http');
const https = require('https');
const path = require('path');
const NError = require('nerror');

/**
 * Express-based server class
 * <br><br>
 * express module is required and also a module for view templating, i.e. pug
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
        if (!express)
            throw new Error('express modules is required for Express server');

        this.name = null;
        this.express = express();
        this.http = null;
        this.https = null;

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
                    this._logger.debug('express', `${this.name}: Initializing express`);
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
                    reject(new NError(error, 'Express.init()'));
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
            })
            .then(() => {
                this._logger.debug('express', `${this.name}: Loading middleware`);
                let middleware;
                if (this._app.has('middleware')) {
                    middleware = this._app.get('middleware');
                } else {
                    middleware = new Map();
                    this._app.registerInstance(middleware, 'middleware');
                }

                let middlewareConfig = this._config.get(`servers.${name}.middleware`);
                if (!Array.isArray(middlewareConfig))
                    return;

                return middlewareConfig.reduce(
                    (prev, cur) => {
                        return prev.then(() => {
                            let obj;
                            if (middleware.has(cur)) {
                                obj = middleware.get(cur);
                            } else {
                                obj = this._app.get(cur);
                                middleware.set(cur, obj);
                            }

                            this._logger.debug('express', `${this.name}: Registering middleware ${cur}`);
                            return obj.register(this);
                        });
                    },
                    Promise.resolve()
                );
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

        return Promise.resolve()
            .then(() => {
                this._logger.debug('express', `${this.name}: Starting the server`);
                let port = this._normalizePort(this._config.get(`servers.${name}.port`));
                let http = this.http || this.https;

                try {
                    http.listen(port, typeof port === 'string' ? undefined : this._config.get(`servers.${name}.host`));
                } catch (error) {
                    throw new NError(error, 'Express.start()');
                }
            });
    }

    /**
     * Stop the server
     * @param {string} name                     Config section name
     * @return {Promise}
     */
    stop(name) {
        if (name !== this.name)
            return Promise.reject(new Error(`Server ${name} was not properly bootstrapped`));

        let http = this.http || this.https;
        if (http) {
            http.close();
            this.http = null;
            this.https = null;
            return new Promise((resolve, reject) => {
                try {
                    let port = this._normalizePort(this._config.get(`servers.${this.name}.port`));
                    this._logger.info(
                        this.name + ': Server is no longer listening on ' +
                        (typeof port === 'string' ?
                            port :
                            this._config.get(`servers.${this.name}.host`) + ':' + port),
                        () => { resolve(); });
                } catch (error) {
                    reject(error);
                }
            });
        }

        return Promise.resolve();
    }

    /**
     * Error handler
     * @param {object} error            The error
     */
    onError(error) {
        if (error.syscall !== 'listen')
            return this._logger.error(new NError(error, 'Express.onError()'));

        let msg;
        switch (error.code) {
            case 'EACCES':
                msg = `${this.name}: Could not bind to web server port`;
                break;
            case 'EADDRINUSE':
                msg = `${this.name}: Web server port is already in use`;
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
            this.name + ': ' +
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