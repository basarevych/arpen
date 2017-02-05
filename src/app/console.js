/**
 * Console application
 * @module arpen/app/console
 */
const debug = require('debug')('arpen:app');
const App = require('./base');

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
                debug('Initializing console');
                this._running = true;
            });
    }
}

module.exports = Console;