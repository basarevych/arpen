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
     * @return {Promise}
     */
    start() {
        return super.start()
            .then(() => {
                let config = this.get('config');
                if (!this.argv['_'].length) {
                    console.error('Command name required');
                    process.exit(1);
                }

                let command, util = this.get('util');
                try {
                    command = this.get(`commands.${util.dashedToCamel(this.argv['_'][0])}`);
                } catch (error) {
                    console.error('Unknown command');
                    process.exit(1);
                }

                this._running = true;

                let result = command.run(this.argv);
                if (result === null || typeof result != 'object' || typeof result.then != 'function')
                    throw new Error(`Command '${this.argv['_'][0]}' run() did not return a Promise`);
                return result;
            });
    }
}

module.exports = Console;