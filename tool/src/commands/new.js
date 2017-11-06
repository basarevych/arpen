/**
 * New command
 * @module commands/new
 */
const path = require('path');
const fs = require('fs');
const argvParser = require('argv');
const Base = require('./base');

/**
 * Command to create skeleton project
 */
class New extends Base {
    /**
     * Create the service
     * @param {App} app                 The application
     * @param {object} config           Configuration
     * @param {Runner} runner           Runner service
     * @param {Help} help               Help command
     */
    constructor(app, config, runner, help) {
        super(app);
        this._config = config;
        this._runner = runner;
        this._help = help;
    }

    /**
     * Service name is 'commands.new'
     * @type {string}
     */
    static get provides() {
        return 'commands.new';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'config', 'runner', 'commands.help' ];
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
            return this._help.helpNew(argv);

        let project = args.targets[1];
        let dir = path.join(process.cwd(), project);

        try {
            try {
                fs.accessSync(dir, fs.constants.F_OK);
                await this._app.error('Directory exists');
                return 1;
            } catch (error) {
                // do nothing
            }

            await this._runner.exec(
                'cp',
                [
                    '-r',
                    path.join(__dirname, '..', '..', '..', 'skeleton'),
                    dir,
                ]
            );

            let globalConf = fs.readFileSync(path.join(dir, 'config', 'global.js'), 'utf8');
            globalConf = globalConf.replace(/PROJECT/g, project.replace(/[^_a-z0-9]+/g, ''));
            fs.writeFileSync(path.join(dir, 'config', 'global.js'), globalConf);

            let local = fs.readFileSync(path.join(dir, 'config', 'local.js.example'), 'utf8');
            let config = local.replace(/INFO/g, 'This config is not saved in the repo');
            let example = local.replace(/INFO/g, 'Installation specific application configuration');
            fs.writeFileSync(path.join(dir, 'config', 'local.js'), config);
            fs.writeFileSync(path.join(dir, 'config', 'local.js.example'), example);

            return 0;
        } catch (error) {
            await this.error(error);
        }
    }
}

module.exports = New;
