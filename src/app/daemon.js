/**
 * UNIX Daemon
 * @module arpen/app/daemon
 */
const fs = require('fs-ext');
const path = require('path');
const merge = require('merge');
const stripAnsi = require('strip-ansi');
const App = require('../app/base');
const Runner = require('../services/runner');
const Emailer = require('../services/emailer');

/**
 * Runs the servers
 */
class Daemon {
    /**
     * Create daemon
     * @param {string} basepath                         Base directory of the project
     * @param {string} pidFile                          PID file absolute path and name
     * @param {object} [options]                        Options
     * @param {number} [options.restartPause=1000]      Pause between restarting crashed app, ms
     * @param {number} [options.maxBufferLength=10000]  Lines of buffer of crashed app output
     */
    constructor(basepath, pidFile, options = {}) {
        this._basepath = basepath;
        this._pidFile = pidFile;
        this._pidFd = null;
        this._config = {};
        this._log = null;
        this._runner = null;
        this._emailer = null;
        this._restartPause = options.restartPause || 1000;
        this._maxBufferLength = options.maxBufferLength || 10000;

        try {
            let globalConf = require(path.join(basepath, 'config', 'global.js'));
            let localConf = {};
            try {
                localConf = require(path.join('basepath', 'config', 'local.js'));
            } catch (error) {
                // do nothing
            }
            this._config = merge.recursive(true, globalConf, localConf);

            for (let logName of Object.keys(this._config.logs || {})) {
                let logInfo = this._config.logs[logName];
                if (!logInfo.default || !logInfo.path || !logInfo.name)
                    continue;
                this._log = path.join(logInfo.path, logInfo.name);
                break;
            }

            try {
                fs.accessSync(pidFile, fs.constants.F_OK);
                try {
                    fs.accessSync(pidFile, fs.constants.R_OK | fs.constants.W_OK);
                } catch (error) {
                    console.error(`No read-write access to ${pidFile}`);
                    process.exit(1);
                }
            } catch (error) {
                try {
                    fs.closeSync(fs.openSync(pidFile, 'w'));
                } catch (error) {
                    console.error(`Could not create ${pidFile}`);
                    process.exit(1);
                }
            }
        } catch (error) {
            console.error(error.message);
            process.exit(1);
        }
    }

    /**
     * Runner service getter
     * @type {Runner}
     */
    get runner() {
        if (!this._runner)
            this._runner = new Runner();
        return this._runner;
    }

    /**
     * Emailer service getter
     * @type {Emailer}
     */
    get emailer() {
        if (!this._emailer)
            this._emailer = new Emailer(this._config);
        return this._emailer;
    }

    /**
     * Full name of the application
     * @type {string}
     */
    get name() {
        return `${this._config.project}/${this._config.instance}`;
    }

    /**
     * Lookup configuration key
     * @param {string} key                                  Key separated by dots
     * @return {*}
     */
    getConfig(key) {
        return key.split('.').reduce((prev, cur) => {
            if (!prev)
                return prev;
            return prev[cur];
        }, this._config);
    }

    /**
     * Run the app
     * @param {string[]} servers                            Server names
     * @return {Promise}
     */
    async run(servers) {
        try {
            this._pidFd = fs.openSync(this._pidFile, 'r+');
        } catch (error) {
            console.error(error.message);
            process.exit(1);
        }

        try {
            fs.flockSync(this._pidFd, 'exnb');
        } catch (error) {
            process.exit(0);
        }

        process.on('SIGTERM', this._exit.bind(this));

        let pidBuffer = Buffer.from(process.pid.toString() + '\n');
        fs.ftruncateSync(this._pidFd);
        fs.writeSync(this._pidFd, pidBuffer, 0, pidBuffer.length, null);

        return this._restart(servers);
    }

    /**
     * Restart the app
     * @param {string[]} servers                            Server names
     * @return {Promise}
     */
    async _restart(servers) {
        let run = path.join(this._basepath, 'bin', 'run');
        try {
            fs.accessSync(run, fs.constants.X_OK);
        } catch (error) {
            run = path.join(__dirname, '..', '..', 'bin', 'run');
        }

        let proc = this.runner.spawn('node', [ run, ...servers ]);

        let buffer = '';
        proc.cmd.on('data', data => {
            process.stdout.write(data);
            buffer += data.toString();
            if (buffer.length > this._maxBufferLength)
                buffer = buffer.slice(buffer.length - this._maxBufferLength);
        });

        try {
            let result = await proc.promise;
            if (result.code === 0)
                return this._exit(0);

            if (this._log) {
                try {
                    if (buffer.length) {
                        fs.appendFileSync(
                            this._log,
                            '============================== EXIT  REPORT ==============================\n' +
                            stripAnsi(buffer) +
                            '==========================================================================\n'
                        );
                    } else {
                        fs.appendFileSync(
                            this._log,
                            '=========================== PROGRAM TERMINATED ===========================\n'
                        );
                    }
                } catch (error) {
                    // do nothing
                }
            }

            if (result.code === App.fatalExitCode)
                return this._exit(App.fatalExitCode);

            if (this.getConfig('email.crash.enable')) {
                await this.emailer.send({
                    from: this.getConfig('email.from'),
                    to: this.getConfig('email.crash.to'),
                    subject: `Exit code ${result.code} of ${this.name}`,
                    text: stripAnsi(buffer),
                });
            }

            setTimeout(this._restart.bind(this), this._restartPause);
        } catch (error) {
            if (this._log) {
                try {
                    fs.appendFileSync(
                        this._log,
                        '============================= LAUNCH FAILURE =============================\n' +
                        (error.fullStack || error.stack || error.message || error) + '\n' +
                        '==========================================================================\n'
                    );
                } catch (error) {
                    // do nothing
                }
            }

            if (this.getConfig('email.crash.enable')) {
                await this.emailer.send({
                    from: this.getConfig('email.from'),
                    to: this.getConfig('email.crash.to'),
                    subject: `Failed to start ${this.name}`,
                    text: error.stack || error.message || error,
                });
            }

            this._exit(1);
        }
    }

    /**
     * Terminate the process
     * @param {number} [rc]                                 Exit code
     */
    _exit(rc) {
        try {
            if (this._pidFd) {
                fs.closeSync(this._pidFd);
                this._pidFd = null;
            }

            if (this._pidFile)
                fs.unlinkSync(this._pidFile);
        } catch (error) {
            // do nothing
        }

        process.exit(rc);
    }
}

module.exports = Daemon;
