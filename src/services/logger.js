/**
 * Logger service
 * @module arpen/services/logger
 */
const util = require('util');
const RotatingFileStream = require('rotating-file-stream');
const stringify = require('json-stringify-safe');

/**
 * Logger service
 * <br><br>
 * Provides logging services via .info(), .warn(), .error() and .debug().
 * <br><br>
 * First argument might contain util.format() formatting (%[sdj]) as accepted by console.log(). If the last argument is
 * a function it is used as completion callback with the first argument being a flag indicating if the data was actually
 * written to the file.
 * <br><br>
 * Logs are always echoed to stdout/stderr if DEBUG environment variable is defined and are written to the file or
 * emailed if configured
 */
class Logger {
    /**
     * Create the service
     * @param {App} app             The application
     * @param {object} config       Config service
     * @param {Util} util           Util service
     * @param {object} [streams]    Stream container
     */
    constructor(app, config, util, streams) {
        this._app = app;
        this._config = config;
        this._util = util;
        this._streams = streams;
        this._emailer = this._config.get('email.log.enable') ? this._app.get('emailer') : null;

        this._log = null;
        if (!this._streams) {
            this._streams = {
                default: null,
                logs: new Map(),
                console: {},
            };
            this._app.registerInstance(this._streams, 'logger.streams');

            for (let log of Object.keys(config.logs || {})) {
                let info = Object.assign({}, config.logs[log]);

                let filename = info.name;
                delete info.name;

                let level = info.level || 'info';
                delete info.level;

                let isDefault = info.default || false;
                delete info.default;

                for (let key of Object.keys(info)) {
                    let value = info[key];
                    delete info[key];
                    info[this._util.snakeToCamel(key)] = value;
                }

                this.createLogStream(log, filename, level, isDefault, info);
            }
        }

        if (this._streams.default)
            this.setLogStream(this._streams.default);
    }

    /**
     * Service name is 'logger'
     * @type {string}
     */
    static get provides() {
        return 'logger';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'app', 'config', 'util', 'logger.streams?' ];
    }

    /**
     * Max lines of log waiting to written to the file
     */
    static get maxFileBufferLines() {
        return 10000;
    }

    /**
     * Format a log string
     * @param {string} string       String to log
     * @return {string}             Returns the string with date
     */
    static formatString(string) {
        function padZero(number, length = 2) {
            let output = String(number);
            while (output.length < length)
                output = '0' + output;
            return output;
        }

        let date = new Date();
        let dateString = date.getFullYear() + '-' + padZero(date.getMonth() + 1) + '-' + padZero(date.getDate());
        dateString += ' ' + padZero(date.getHours()) + ':' + padZero(date.getMinutes()) + ':' + padZero(date.getSeconds());
        dateString += '.' + padZero(date.getTime() % 1000, 3);

        return '[' + dateString + '] ' + string;
    }

    /**
     * Create log stream
     * @param {string} name                 Stream name
     * @param {string|function} filename    File name
     * @param {string} level                Log level: debug, warn, info, error
     * @param {boolean} isDefault           This stream is the default one
     * @param {object} options              Stream options
     */
    createLogStream(name, filename, level, isDefault, options) {
        let log = this._streams.logs.get(name);
        if (log) {
            if (options) {
                log.options = options;
                if (log.stream)
                    log.stream.close();
                log.stream = null;
            }
        } else {
            log = {
                name: name,
                filename: filename,
                level: level,
                stream: null,
                options: options,
                open: false,
                failed: false,
                buffer: [],
            };
            this._streams.logs.set(name, log);
        }

        if (isDefault) {
            this._streams.default = name;
            if (this._app.options.interceptConsole) {
                if (!this._streams.log)
                    this._streams.log = console.log;
                if (!this._streams.warn)
                    this._streams.warn = console.warn;
                if (!this._streams.error)
                    this._streams.error = console.error;

                let logger = this._streams.console.logger = new this.constructor(this._app, this._config, this._util, this._streams);
                console.log = (...args) => { logger.info(...args); };
                console.warn = (...args) => { logger.warn(...args); };
                console.error = (...args) => { logger.error(...args); };
            }
        }

        this._startLog(log);
    }

    /**
     * Switch log stream
     * @param {string} name                 Stream name
     */
    setLogStream(name) {
        if (this._streams.logs.has(name))
            this._log = name;
    }

    /**
     * Log error
     * @param {...*} messages       Messages
     */
    error(...messages) {
        let cb;
        if (messages.length && typeof messages[messages.length - 1] === 'function')
            cb = messages.pop();
        if (messages.length)
            this.log('error', messages, undefined, true, cb);
    }

    /**
     * Log info
     * @param {...*} messages       Messages
     */
    info(...messages) {
        let cb;
        if (messages.length && typeof messages[messages.length - 1] === 'function')
            cb = messages.pop();
        if (messages.length)
            this.log('info', messages, undefined, true, cb);
    }

    /**
     * Log warning
     * @param {...*} messages       Messages
     */
    warn(...messages) {
        let cb;
        if (messages.length && typeof messages[messages.length - 1] === 'function')
            cb = messages.pop();
        if (messages.length)
            this.log('warn', messages, undefined, true, cb);
    }

    /**
     * Log debug
     * @param {string} issuer       Issuer
     * @param {...*} messages       Messages
     */
    debug(issuer, ...messages) {
        let cb;
        if (messages.length && typeof messages[messages.length - 1] === 'function')
            cb = messages.pop();
        if (messages.length)
            this.log('debug', messages, issuer, true, cb);
    }

    /**
     * Log messages without prepending the date (equivalent of .info())
     * @param {...*} messages       Messages
     */
    dump(...messages) {
        let cb;
        if (messages.length && typeof messages[messages.length - 1] === 'function')
            cb = messages.pop();
        if (messages.length)
            this.log('info', messages, undefined, false, cb);
    }

    /**
     * Actually log the error
     * @param {string} type                 Type of the error message
     * @param {Array} messages              Array of messages
     * @param {string|undefined} issuer     Issuer if used
     * @param {boolean} logDate             Prepend current date
     * @param {function|undefined} [cb]     File write callback: first parameter whether file was actually written
     */
    log(type, messages, issuer, logDate, cb) {
        let levels = [ 'debug', 'warn', 'info', 'error' ];
        if (levels.indexOf(type) === -1) {
            if (cb)
                cb(false);
            return;
        }

        let logInfo;
        let logName = this._log || this._streams.default;
        if (logName)
            logInfo = this._streams.logs.get(logName);

        let logToStdOut = !!process.env.DEBUG;
        let logToFile = false;
        let logToMail = false;
        if (logInfo)
            logToFile = (levels.indexOf(logInfo.level) !== -1 && levels.indexOf(type) >= levels.indexOf(logInfo.level));
        if (this._emailer) {
            let mailLevel = this._config.get('email.log.level');
            logToMail = (levels.indexOf(mailLevel) !== -1 && levels.indexOf(type) >= levels.indexOf(mailLevel));
        }

        if (!logToStdOut && !logToFile && !logToMail) {
            if (cb)
                cb(false);
            return;
        }

        let parsed = [];
        for (let msg of messages) {
            if (msg === null || typeof msg === 'undefined')
                parsed.push(msg);
            else if (msg.info && msg.fullStack)
                parsed.push('Exception: ' + stringify(msg.info, undefined, 4) + '\n' + msg.fullStack);
            else if (msg.stack)
                parsed.push(msg.stack);
            else if (typeof msg === 'object')
                parsed.push(stringify(msg, undefined, 4));
            else
                parsed.push(msg);
        }

        let logString =
            (parsed.length && /%[sdj]/.test(String(parsed[0])))
                ? util.format(...parsed)
                : parsed.join('\n');

        if (issuer)
            logString = `<${issuer}> ` + logString;

        if (logDate)
            logString = this.constructor.formatString(logString);

        if (logToStdOut) {
            if (type === 'error')
                process.stderr.write(logString + '\n');
            else
                process.stdout.write(logString + '\n');
        }

        if (logToFile) {
            if (logInfo.open) {
                logInfo.stream.write(logString + '\n', () => {
                    if (cb)
                        cb(true);
                });
            } else {
                logInfo.buffer.push({ log: logString, cb: cb });
                while (logInfo.buffer.length > this.constructor.maxFileBufferLines) {
                    let buf = logInfo.buffer.shift();
                    if (buf.cb)
                        buf.cb(false);
                }
                this._startLog(logInfo);
            }
        } else {
            if (cb)
                cb(false);
        }

        if (logToMail) {
            this._emailer.send({
                    to: this._config.get('email.logger.to'),
                    from: this._config.get('email.from'),
                    subject: `[${this._config.project}/${this._config.instance}] Message logged (${type})`,
                    text: logString,
                })
                .catch(error => {
                    process.stderr.write(this.constructor.formatString(`Could not email log message: ${error.messages || error.message}\n`));
                });
        }
    }

    /**
     * Start log stream
     * @param {object} log
     */
    _startLog(log) {
        if (log.stream)
            return;

        let stream = RotatingFileStream(log.filename, log.options);
        log.stream = stream;
        log.stream.on('error', error => {
            if (log.stream !== stream)
                return;

            log.stream = null;
            log.open = false;
            if (!log.failed) {
                log.failed = true;
                process.stderr.write(this.constructor.formatString(`Log error (${log.name}): ${error.message}\n`));
            }
        });
        log.stream.on('open', () => {
            if (log.stream !== stream)
                return;

            if (log.buffer.length) {
                let str = '';
                let callbacks = [];
                for (let buf of log.buffer) {
                    str += buf.log + '\n';
                    if (buf.cb)
                        callbacks.push(buf.cb);
                }
                log.stream.write(str, () => {
                    for (let cb of callbacks) {
                        if (cb)
                            cb(true);
                    }
                });
                log.buffer = [];
            }
            log.open = true;
            log.failed = false;
        });
        log.stream.on('close', () => {
            if (log.stream !== stream)
                return;

            log.stream = null;
            log.open = false;
        });
    }
}

module.exports = Logger;
