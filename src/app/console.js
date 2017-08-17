/**
 * Console application
 * @module arpen/app/console
 */
const App = require('./base');

/**
 * @extends module:arpen/app/base~App
 *
 * Console application class
 * <br><br>
 * This implementation will get command name from argv[0], convert dashed to camel case, resolve
 * 'commands.<command-name>' as the command class and invoke .run() on it
 */
class Console extends App {
    /**
     * Start the app
     * @param {...*} args                               Parent arguments
     * @return {Promise}
     */
    async start(...args) {
        await super.start(...args);

        if (!this.argv.length) {
            await this.error('Command name required');
            process.exit(1);
        }

        let util = this.get('util');
        let name = `commands.${util.dashedToCamel(this.argv[0])}`;
        if (!this.has(name)) {
            await this.error('Unknown command');
            process.exit(1);
        }

        this._running = true;

        let result = this.get(name).run(this.argv);
        if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
            throw new Error(`Command '${this.argv[0]}' run() did not return a Promise`);
        return result;
    }
}

module.exports = Console;
