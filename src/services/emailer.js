/**
 * Email sending service. Requires 'emailjs' module.
 * @module arpen/services/emailer
 */
let emailjs;
try {
    emailjs = require('emailjs/email');
} catch (error) {
    // do nothing
}

const NError = require('nerror');

/**
 * Emailer
 * <br><br>
 * emailjs module is required
 * <br><br>
 * Add to your config:
 * <pre>
 * // SMTP servers
 * smtp: {
 *   main: {
 *     host: 'localhost',
 *     port: 25,
 *     ssl: false,
 *     //user: 'username',
 *     //password: 'password',
 *   },
 * },
 * </pre>
 */
class Emailer {
    /**
     * Create the service
     * @param {object} config                   Configuration
     */
    constructor(config) {
        this._config = config;

        if (!emailjs)
            throw new Error('emailjs module is required for Emailer service');
    }

    /**
     * Service name is 'emailer'
     * @type {string}
     */
    static get provides() {
        return 'emailer';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'config' ];
    }

    /**
     * Send email
     * @param {object} params                   Parameters
     * @param {string} [params.server]          SMTP server name (as in config)
     * @param {string} params.from              From address
     * @param {string} params.to                To address
     * @param {string} [params.cc]              CC address
     * @param {string} params.subject           The subject
     * @param {string} [params.text]            Plain text variant of the message
     * @param {string} [params.html]            Html variant of the message
     * @param {object[]} [params.attachments]   Array of objects (see emailjs help)
     * @return {Promise}                        Resolves to the sent message details
     */
    async send(params = {}) {
        let { server, from, to, cc, subject, text, html, attachments = [] } = params;

        let options = {
            from: from,
            to: to,
            subject: subject,
            text: text || '',
        };

        if (cc)
            options.cc = cc;

        if (html)
            attachments.push({ data: html, alternative: true });
        if (attachments.length)
            options.attachment = attachments;

        return new Promise((resolve, reject) => {
                this._connect(server)
                    .send(options, (error, message) => {
                        if (error)
                            reject(new NError(error, { server, from, to, subject }, 'Emailer.send()'));
                        else
                            resolve(message);
                    });
            });
    }

    /**
     * Create connection instance
     * @param {string} server='main'    SMTP server name
     * @return {object}                 Returns emailjs instance
     */
    _connect(server = 'main') {
        let options = {
            host: this._config.get(`smtp.${server}.host`),
            port: this._config.get(`smtp.${server}.port`),
            ssl: this._config.get(`smtp.${server}.ssl`),
        };

        let user = this._config.get(`smtp.${server}.user`);
        if (user)
            options.user = user;

        let password = this._config.get(`smtp.${server}.password`);
        if (password)
            options.password = password;

        return emailjs.server.connect(options);
    }
}

module.exports = Emailer;
