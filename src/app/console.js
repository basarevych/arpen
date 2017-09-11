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

        if (!this.argv.length)
            return this.exit(this.constructor.fatalExitCode, 'Command name required');

        let util = this.get('util');
        let name = `commands.${util.dashedToCamel(this.argv[0])}`;
        if (!this.has(name))
            return this.exit(this.constructor.fatalExitCode, 'Unknown command');

        let result = this.get(name).run(this.argv);
        if (result === null || typeof result !== 'object' || typeof result.then !== 'function')
            throw new Error(`Command '${this.argv[0]}' run() did not return a Promise`);

        return this.exit((await result) || 0);
    }
}

module.exports = Console;
