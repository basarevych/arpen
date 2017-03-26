/**
 * Console application
 * @module arpen/app/console
 */
const debug = require('debug')('arpen:app');
const path = require('path');
const App = require('./base');
const WError = require('verror').WError;

/**
 * Console application class
 * @extends module:arpen/app/base~App
 */
class Console extends App {
    /**
     * Start the app
     * @param {...*} args                               Parent arguments
     * @return {Promise}
     */
    start(...args) {
        return super.start(...args)
            .then(() => {
                let config = this.get('config');
                if (!this.argv.length) {
                    return this.error('Command name required\n')
                        .then(() => {
                            process.exit(1);
                        });
                }

                let command, util = this.get('util');
                try {
                    command = this.get(`commands.${util.dashedToCamel(this.argv[0])}`);
                } catch (error) {
                    return this.error('Unknown command\n')
                        .then(() => {
                            process.exit(1);
                        });
                }

                this._running = true;

                let result = command.run(this.argv);
                if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
                    throw new Error(`Command '${this.argv[0]}' run() did not return a Promise`);
                return result;
            });
    }
}

module.exports = Console;