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

        this._stream = null;
        this._streams = this._app.get('logger.streams?');
        if (!this._streams) {
            this._streams = new Map();
            this._app.registerInstance(this._streams, 'logger.streams');
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
     * Format a log string
     * @param {string} string       String to log
     * @return {string}             Returns the string with date
     */
    static formatString(string) {
        function padZero(number) {
            let output = String(number);
            if (output.length == 1)
                output = '0' + output;
            return output;
        }

        let date = new Date();
        let dateString = date.getFullYear() + '-' + padZero(date.getMonth()+1) + '-' + padZero(date.getDate());
        dateString += ' ' + padZero(date.getHours()) + ':' + padZero(date.getMinutes()) + ':' + padZero(date.getSeconds());

        return "[" + dateString + "] " + string;
    }

    /**
     * Set log stream
     * @param {string} name         File name
     * @param {object} [options]    Stream options
     */
    setLogStream(name, options) {
        let stream = this._streams.get(name);
        if (stream)
            stream = stream.stream;

        if (options) {
            let isDefault = options.default;
            delete options.default;
            if (stream)
                stream.close();
            try {
                stream = RotatingFileStream(name, options);
                this._streams.set(name, {default: isDefault, stream: stream});
            } catch (error) {
                this.error(`Could not open log (${name}): ${error.message}`);
            }
        }

        if (stream)
            this._stream = stream;
    }

    /**
     * Log error
     * @param {...*} messages       Messages
     */
    error(...messages) {
        this.log('error', messages);
    }

    /**
     * Log info
     * @param {...*} messages       Messages
     */
    info(...messages) {
        this.log('info', messages);
    }

    /**
     * Log warning
     * @param {...*} messages       Messages
     */
    warn(...messages) {
        this.log('warn', messages);
    }

    /**
     * Actually log the error
     * @param {string} type         Type of the error message
     * @param {Array} messages      Array of messages
     */
    log(type, messages) {
        let flat = [];
        for (let msg of messages) {
            if (msg instanceof WError || (msg.constructor && msg.constructor.name == 'WError')) {
                flat.push('Exception data:\n' + JSON.stringify(this._error.info(msg), undefined, 4));
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
                    lines.push(prefix + (typeof msg == 'object' ? JSON.stringify(msg) : msg));
                    continue;
                }

                if (msg.stack)
                    lines.push(prefix + msg.stack);
                else
                    lines.push(prefix + msg.message);
            }
        }

        let logFunc, emailLog;
        switch (type) {
            case 'info':
                logFunc = 'log';
                emailLog = this._config.get('email.logger.info_enable');
                break;
            case 'warn':
                logFunc = 'log';
                emailLog = this._config.get('email.logger.warn_enable');
                break;
            case 'error':
                logFunc = 'error';
                emailLog = this._config.get('email.logger.error_enable');
                break;
            default:
                throw new Error(`Invalid type: ${type}`);
        }

        let logString = this.constructor.formatString(formatted ? util.format(...flat) : lines.join("\n"));
        console[logFunc](logString);

        if (!this._stream) {
            for (let [ name, params ] of this._streams) {
                if (params.default) {
                    this._stream = params.stream;
                    break;
                }
            }
        }
        if (this._stream)
            this._stream.write(logString + '\n');

        if (!emailLog || !this._emailer)
            return;

        this._emailer.send({
                to: this._config.get('email.logger.to'),
                from: this._config.get('email.from'),
                subject: '[' + this._config.project + '] Message logged (' + type + ')',
                text: logString,
            })
            .catch(error => {
                console.error(this.constructor.formatString(`Could not email log message: ${error}`));
            });
    }
}

module.exports = Logger;
