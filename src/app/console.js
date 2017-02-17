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

                return this.constructor._require(path.join(config.base_path, 'commands', this.argv['_'][0]))
                    .catch(error => {
                        console.error('No such command');
                        process.exit(1);
                    });
            })
            .then(obj => {
                if (!obj || !obj.provides)
                    throw new Error('Command does not returned a class');

                this._running = true;

                this.registerClass(obj);
                let result = this.get(obj.provides).run(this.argv);
                if (result === null || typeof result != 'object' || typeof result.then != 'function')
                    throw new Error(`Command '${this.argv['_'][0]}' run() did not return a Promise`);
                return result;
            });
    }
}

module.exports = Console;