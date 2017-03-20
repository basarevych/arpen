/**
 * Run command service
 * @module arpen/services/runner
 */
'use strict';

const fs = require('fs-ext');
const execFile = require('child_process').execFile;
const pty = require('pty.js');
const merge = require('merge');
const WError = require('verror').WError;

/**
 * Spawned subprocess
 */
class Subprocess {
    /**
     * Create subprocess
     * @param {object} cmd          pty.spawn object
     * @param {object} expect       Expect-send strings object { 'wait for regexp string': 'send this' }
     */
    constructor(cmd, expect) {
        this._cmd = cmd;
        this._pending = true;
        this._promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
        this.promise.then(() => { this._pending = false; }, () => { this._pending = false; });

        this._result = {
            code: null,
            signal: null,
        };

        if (typeof expect === 'object' && expect !== null) {
            let sendKey = send => {
                setTimeout(function () {
                    cmd.write(send + '\r');
                }, 250);
            };

            cmd.on('data', data => {
                data.toString().split('\n').forEach(line => {
                    for (let key of Object.keys(expect)) {
                        let re = new RegExp(key, 'i');
                        if (re.test(line))
                            sendKey(expect[key]);
                    }
                });
            });
        }

        cmd.on('exit', (code, signal) => {
            this._result.code = code;
            this._result.signal = signal;
            this._resolve(this._result);
            this._cmd = null;
        });
        cmd.on('error', error => {
            if (error.errno === 'EIO' && error.syscall === 'read')    // TODO: check the status of this bug
                return;                                             // Do nothing here as this is a Debian-specific bug

            this._reject(error);
        });
    }

    /**
     * Is process still running?
     * @return {boolean}
     */
    get isRunning() {
        return this._pending;
    }

    /**
     * Get pty.js object
     * @return {object}
     */
    get cmd() {
        return this._cmd;
    }


    /**
     * Get result promise
     * @return {Promise}
     */
    get promise() {
        return this._promise;
    }

    /**
     * Get process exit code
     * @return {null|number}
     */
    get code() {
        return this._result.code;
    }

    /**
     * Get process exit signal
     * @return {null|string}
     */
    get signal() {
        return this._result.signal;
    }

    /**
     * Send data to process'es stdin
     * @return {boolean}
     */
    write(data) {
        if (!this.isRunning)
            return false;

        this.cmd.write(data);
        return true;
    }

    /**
     * Resize terminal
     * @param {number} cols         Number of columns
     * @param {number} rows         Number of rows
     * @return {boolean}
     */
    resize(cols, rows) {
        if (!this.isRunning)
            return false;

        this.cmd.resize(cols, rows);
        return true;
    }

    /**
     * Terminate process
     * @return {boolean}
     */
    kill(sig) {
        if (!this.isRunning)
            return false;

        this.cmd.kill(sig ? sig : 'SIGKILL');
        return true;
    }
}


/**
 * Run a command
 */
class Runner {
    /**
     * Create the service
     */
    constructor() {
    }

    /**
     * Service name is 'runner'
     * @type {string}
     */
    static get provides() {
        return 'runner';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ ];
    }

    /**
     * Command execution time limit
     */
    static get execTimeout() {
        return 0; // ms
    }

    /**
     * Execute a command
     * @param {string} command              Command name
     * @param {string[]} [params]           Command arguments
     * @param {object} [options]            execFile() options
     * @return {object}
     * <code>
     * {
     *   code: 0,
     *   signal: null,
     *   stdout: '',
     *   stderr: '',
     * }
     * </code>
     */
    exec(command, params = [], options = {}) {
        let {
            env = {
                "LANGUAGE": "C.UTF-8",
                "LANG": "C.UTF-8",
                "LC_ALL": "C.UTF-8",
                "PATH": "/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin",
            },
            timeout = this.constructor.execTimeout,
            killSignal = 'SIGKILL',
        } = options;

        return new Promise((resolve, reject) => {
            execFile(command, params, {env, timeout, killSignal}, (error, stdout, stderr) => {
                if (error) {
                    if (typeof error.code === 'number' || error.signal) {
                        return resolve({
                            code: error.code,
                            signal: error.signal,
                            stdout: stdout,
                            stderr: stderr,
                        });
                    }
                    return reject(new WError(error, 'Runner.exec()'));
                }

                resolve({
                    code: 0,
                    signal: null,
                    stdout: stdout,
                    stderr: stderr,
                });
            });
        });
    };

    /**
     * Spawn a command
     * @param {string} command      Command name
     * @param {string[]} [params]   Command arguments
     * @param {object} [options]    Pty.js options
     * @param {object} [expect]     Expect-send strings object { 'wait for regexp string': 'send this' }
     * @return {Subprocess}
     */
    spawn(command, params = [], options = {}, expect = {}) {
        let {
            env = {
                "LANGUAGE": "C.UTF-8",
                "LANG": "C.UTF-8",
                "LC_ALL": "C.UTF-8",
                "PATH": "/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin",
            },
            timeout = this.constructor.execTimeout,
            killSignal = 'SIGKILL',
        } = options;

        return new Subprocess(pty.spawn(command, params, { env, timeout, killSignal }), expect);
    }
}

module.exports = Runner;
