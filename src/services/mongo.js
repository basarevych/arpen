/**
 * MongoDB service. Requires 'mongodb' module.
 * @module arpen/services/mongo
 */
let mongo;
try {
    mongo = require('mongodb');
} catch (error) {
    // do nothing
}

const debug = require('debug')('arpen:mongo');
const NError = require('nerror');

/**
 * Mongo client
 * @property {object} client                        Mongo client
 */
class MongoClient {
    /**
     * Create Mongo client
     * @param {Mongo} service                       Mongo service instance
     * @param {object} client                       Mongo client instance
     */
    constructor(service, client) {
        this.client = client;

        this._mongo = service;
    }

    /**
     * Client termination
     */
    done() {
        if (!this.client)
            return;

        debug('Disconecting...');
        let res = this.client.close();
        this.client = null;
        return res;
    }

    /**
     * Get Mongo collection
     * @param {string} name                         Collection name
     * @return {object}
     */
    collection(name) {
        debug(`collection ${name}`);

        if (!this.client)
            throw new Error('Collection on terminated client');

        let coll = this.client.collection(name);
        if (!coll)
            return coll;

        function loggingMethod(log, func, ...args) {
            debug(log);
            return func.apply(this, args);
        }

        for (let key in coll) {
            if (typeof coll[key] === 'function')
                coll[key] = loggingMethod.bind(coll, `Query: ${name}.${key}`, coll[key]);
        }

        return coll;
    }
}

/**
 * Mongo service
 * <br><br>
 * mongodb module is required
 * <br><br>
 * Add to your config:
 * <pre>
 * // MongoDB servers
 * mongo: {
 * main: {
 *   host: 'localhost',
 *   port: 27017,
 *   user: 'username',
 *   password: 'password',
 *   database: 'dbname',
 *   pool_size: 100,
 *   },
 * },
 * </pre>
 */
class Mongo {
    /**
     * Create the service
     * @param {object} config       Config service
     * @param {Logger} logger       Logger service
     * @param {Util} util           Util service
     */
    constructor(config, logger, util) {
        this._config = config;
        this._logger = logger;
        this._util = util;

        if (!mongo)
            throw new Error('mongodb module is required for Mongo service');
    }

    /**
     * Service name is 'mongo'
     * @type {string}
     */
    static get provides() {
        return 'mongo';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'config', 'logger', 'util' ];
    }

    /**
     * This service is a singleton
     * @type {string}
     */
    static get lifecycle() {
        return 'singleton';
    }

    /**
     * Format of date/time string
     * @type {string}
     */
    static get datetimeFormat() {
        return null; // return JS Date object
    }

    /**
     * Obtain Mongo client
     * @param {string} name='main'              Server name in config
     * @return {Promise}                        Resolves to connected MongoClient instance
     */
    async connect(name = 'main') {
        return new Promise((resolve, reject) => {
            let options = this._config.get(`mongo.${name}`);
            if (!options)
                return reject(new Error(`Undefined Mongo server name: ${name}`));

            let user = '';
            if (options.user) {
                user += options.user;
                if (options.password)
                    user += ':' + options.password;
                user += '@';
            }

            let opts = Object.assign({}, options);
            delete opts.host;
            delete opts.port;
            delete opts.user;
            delete opts.password;
            delete opts.database;

            let pairs = [];
            for (let key of Object.keys(opts))
                pairs.push(`${this._util.snakeToCamel(key)}=${opts[key]}`);

            let optString = pairs.length ? '?' + pairs.join('&') : '';
            const connString = `mongodb://${user}${options.host}:${options.port}/${options.database}${optString}`;

            debug('Connecting...');
            mongo.MongoClient.connect(connString, (error, client) => {
                if (error) {
                    if (client)
                        client.close();
                    return reject(new NError(error, 'Mongo.connect()'));
                }

                resolve(new MongoClient(this, client));
            });
        });
    }
}

module.exports = Mongo;
