/**
 * Help command
 * @module commands/help
 */
const argvParser = require('argv');
const Base = require('./base');

/**
 * Command to print usage
 */
class Help extends Base {
    /**
     * Create the service
     * @param {App} app                 The application
     * @param {Util} util               Utility service
     */
    constructor(app, util) {
        super(app);
        this._util = util;
    }

    /**
     * Service name is 'commands.help'
     * @type {string}
     */
    static get provides() {
        return 'commands.help';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'util' ];
    }

    /**
     * Run the command
     * @param {string[]} argv           Arguments
     * @return {Promise}
     */
    async run(argv) {
        let args = argvParser
            .option({
                name: 'help',
                short: 'h',
                type: 'boolean',
            })
            .run(argv);

        if (args.targets.length < 2)
            return this.usage();

        let method = this[`help${this._util.dashedToCamel(args.targets[1], true)}`];
        if (typeof method !== 'function') {
            await this._app.error('Unknown command');
            process.exit(1);
        }

        return method.call(this, argv);
    }

    /**
     * General help
     * @return {Promise}
     */
    async usage() {
        await this._app.info(
            'Usage:\tcmd <command> [<parameters]\n\n' +
            'Commands:\n' +
            '\thelp\t\tPrint help about any other command\n' +
            '\tcreate-cert\tCreate self-signed SSL certificate\n'

        );
        process.exit(0);
    }

    /**
     * Help command
     * @return {Promise}
     */
    async helpHelp(argv) {
        await this._app.info(
            'Usage:\tcmd help <command>\n\n' +
            '\tPrint help for the given command\n'
        );
        process.exit(0);
    }

    /**
     * Cert command
     * @return {Promise}
     */
    async helpCreateCert(argv) {
        await this._app.info(
            'Usage:\tcmd create-cert <address>\n\n' +
            '\tThis command will create self-signed certificates in the certs/ subdirectory\n' +
            '\t<address> is either hostname or IP address to use in the certificate\n'
        );
        process.exit(0);
    }
}

module.exports = Help;
