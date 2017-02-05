/**
 * Email sending service
 * @module arpen/services/emailer
 */
const emailjs = require('emailjs/email');
const WError = require('verror').WError;

/**
 * Emailer
 */
class Emailer {
    /**
     * Create the service
     * @param {object} config                   Configuration
     */
    constructor(config) {
        this._config = config;
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
    send({ server, from, to, cc, subject, text, html, attachments = [] }) {
        let options = {
            from: from,
            to: to,
            subject: subject,
            text: text ? text : '',
        };

        if (cc)
            options.cc = cc;

        if (html)
            attachments.push({ data: html, alternative: true });
        if (attachments.length)
            options.attachment = attachments;

        return new Promise((resolve, reject) => {
                this.connect(server)
                    .send(options, (err, message) => {
                        if (err)
                            reject(new WError(err, 'Emailer.send()'));
                        else
                            resolve(message);
                    });
            });
    }

    /**
     * Create connection instance
     * @param {string} [server]     SMTP server name
     * @return {object}             Returns emailjs instance
     */
    connect(server = 'main') {
        let options = {
            host: this._config.smtp[server].host,
            port: this._config.smtp[server].port,
            ssl: this._config.smtp[server].ssl,
        };
        if (this._config.smtp[server].user)
            options.user = this._config.smtp[server].user;
        if (this._config.smtp[server].password)
            options.password = this._config.smtp[server].password;

        return emailjs.server.connect(options);
    }
}

module.exports = Emailer;
