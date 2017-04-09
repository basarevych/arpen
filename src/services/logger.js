/**
 * Logger service
 * @module arpen/services/logger
 */
const util = require('util');
const WError = require('verror').WError;
const RotatingFileStream = require('rotating-file-stream');

/**
 * Logger service
 */
class Logger {
    /**
     * Create the service
     * @param {App} app             The application
     * @param {object} config       Config service
     * @param {ErrorHelper} error   Error helper service
     * @param {Emailer} [emailer]   Emailer service if available
     */
    constructor(app, config, error, emailer) {
        this._app = app;
        this._config = config;
        this._error = error;
        this._emailer = emailer;

        this._log = null;
        this._container = this._app.get('logger.streamContainer?');
        if (!this._container) {
            this._container = {
                default: null,
                logs: new Map(),
            };
            this._app.registerInstance(this._container, 'logger.streamContainer');
        }
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
        return [ 'app', 'config', 'error', 'emailer?' ];
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
        let dateString = date.getFullYear() + '-' + padZero(date.getMonth()+1) + '-' + padZero(date.getDate());
        dateString += ' ' + padZero(date.getHours()) + ':' + padZero(date.getMinutes()) + ':' + padZero(date.getSeconds());
        dateString += '.' + padZero(date.getTime() % 1000, 3);

        return "[" + dateString + "] " + string;
    }

    /**
     * Set log stream
     * @param {string} name                 Stream name
     * @param {string|function} filename    File name
     * @param {string} level                Log level: debug, warn, info, error
     * @param {boolean} [isDefault=false}   Stream is default
     * @param {object} [options]            Stream options
     */
    setLogStream(name, filename, level, isDefault, options) {
        let log = this._container.logs.get(name);
        if (log) {
            if (log.stream)
                log.stream.close();
            log.stream = null;
            if (options)
                log.options = options;
        } else {
            if (!options)
                return;

            let log = {
                name: name,
                filename: filename,
                level: level,
                stream: null,
                options: options,
                open: false,
                failed: false,
                buffer: [],
            };
            this._container.logs.set(name, log);
        }

        if (isDefault)
            this._container.default = name;
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
        this.log('error', messages, undefined, cb);
    }

    /**
     * Log info
     * @param {...*} messages       Messages
     */
    info(...messages) {
        let cb;
        if (messages.length && typeof messages[messages.length - 1] === 'function')
            cb = messages.pop();
        this.log('info', messages, undefined, cb);
    }

    /**
     * Log warning
     * @param {...*} messages       Messages
     */
    warn(...messages) {
        let cb;
        if (messages.length && typeof messages[messages.length - 1] === 'function')
            cb = messages.pop();
        this.log('warn', messages, undefined, cb);
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
        this.log('debug', messages, issuer, cb);
    }

    /**
     * Actually log the error
     * @param {string} type         Type of the error message
     * @param {Array} messages      Array of messages
     * @param {string} [issuer]     Issuer if used
     * @param {function} [cb]       File write callback: first parameter whether file was actually written
     */
    log(type, messages, issuer, cb) {
        let levels = [ 'debug', 'warn', 'info', 'error' ];
        if (levels.indexOf(type) === -1) {
            if (cb)
                cb(false);
            return;
        }

        let logInfo, logName = this._log || this._container.default;
        if (logName)
            logInfo = this._container.logs.get(logName);

        let logToStdOut = !!process.env.DEBUG, logToFile = false, logToMail = false;
        if (logInfo)
            logToFile =  (levels.indexOf(logInfo.level) !== -1 && levels.indexOf(type) >= levels.indexOf(logInfo.level));
        if (this._config.get('email.log.enable')) {
            let mailLevel = this._config.get('email.log.level');
            logToMail = (levels.indexOf(mailLevel) !== -1 && levels.indexOf(type) >= levels.indexOf(mailLevel));
        }

        if (!logToStdOut && !logToFile && !logToMail) {
            if (cb)
                cb(false);
            return;
        }

        let flat = [];
        for (let msg of messages) {
            if (msg instanceof WError || (msg.constructor && msg.constructor.name === 'WError')) {
                flat.push('Exception data: ' + JSON.stringify(this._error.info(msg), undefined, 4));
                flat = flat.concat(this._error.flatten(msg));
            } else {
                flat.push(msg);
            }
        }

        let formatted = false, lines = [];
        if (flat.length && /%[sdj]/.test(String(flat[0]))) {
            formatted = true;
        } else {
            let first = true;
            for (let msg of flat) {
                let prefix = '';
                if (first)
                    first = false;
                else
                    prefix = '  ';

                if (!(msg instanceof Error)) {
                    lines.push(prefix + (typeof msg === 'object' ? JSON.stringify(msg) : msg));
                    continue;
                }

                if (msg.stack)
                    lines.push(prefix + msg.stack);
                else if (msg.message)
                    lines.push(prefix + msg.message);
                else
                    lines.push(prefix + msg);
            }
        }

        let logString = this.constructor.formatString(
            (issuer ? `<${issuer}> ` : '') +
            (formatted ? util.format(...flat) : lines.join("\n"))
        );

        if (logToStdOut)
            console[type === 'error' ? 'error' : 'log'](logString);

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
                    console.error(this.constructor.formatString(`Could not email log message: ${error}`));
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
                console.error(this.constructor.formatString(`Could not open log (${log.name}): ${error.message}`));
            }
        });
        log.stream.on('open', () => {
            if (log.stream !== stream)
                return;

            if (log.buffer.length) {
                let str = '', callbacks = [];
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
