/**
 * I18N middleware
 * @module arpen/middleware/i18n
 */
const fs = require('fs');
const path = require('path');
const merge = require('merge');

/**
 * Internationalization
 * <br><br>
 * format-message module is required
 */
class I18n {
    /**
     * Create the service
     * @param {object} config           Configuration
     */
    constructor(config) {
        this.locale = null;
        this.translations = {};
        this.formatters = new Map();

        this._config = config;
        this._loaded = false;

        try {
            require('format-message');
        } catch (error) {
            throw new Error('format-message module is required for I18n middleware');
        }
    }

    /**
     * Service name is 'middleware.i18n'
     * @type {string}
     */
    static get provides() {
        return 'middleware.i18n';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'config' ];
    }

    /**
     * Default locale
     * @type {string}
     */
    static get defaultLocale() {
        return 'en';
    }

    /**
     * Register middleware
     * @param {Express} server          The server
     * @return {Promise}
     */
    async register(server) {
        if (this._loaded)
            return;

        this._loaded = true;
        for (let [ moduleName, moduleConfig ] of this._config.modules) {
            for (let dir of moduleConfig.i18n || []) {
                let filename = dir[0] === '/'
                    ? dir
                    : path.join(this._config.base_path, 'modules', moduleName, dir);

                for (let file of fs.readdirSync(filename)) {
                    if (!file.endsWith('.json'))
                        continue;

                    let locale = path.basename(file, '.json');
                    if (!this.translations[locale])
                        this.translations[locale] = {};

                    merge.recursive(this.translations[locale], require(path.join(filename, file)));
                }
            }
        }

        for (let locale of Object.keys(this.translations)) {
            let formatMessage = require('format-message');
            formatMessage.setup({
                locale: locale,
                translations: this.translations,
            });
            this.formatters.set(locale, formatMessage);
        }

        if (Object.keys(this.translations).includes(this.constructor.defaultLocale))
            this.locale = this.constructor.defaultLocale;

        server.express.use((req, res, next) => {
            res.locals.locale = null;
            if (Object.keys(this.translations).length) {
                if (req.cookies)
                    res.locals.locale = Object.keys(this.translations).includes(req.cookies.locale) ? req.cookies.locale : null;
                if (!res.locals.locale)
                    res.locals.locale = req.acceptsLanguages(Object.keys(this.translations));
            }
            if (!res.locals.locale)
                res.locals.locale = this.locale;

            res.locals.i18n = (id, ...args) => {
                let options = {};
                let locale = res.locals.locale;
                if (args.length >= 2) {
                    options = args[0];
                    locale = args[1];
                } else if (args.length === 1) {
                    if (typeof args[0] === 'object')
                        options = args[0];
                    else
                        locale = args[0];
                }
                return this.translate(id, options, locale);
            };

            next();
        });
    }

    /**
     * Translate message
     * @param {string} id
     * @param {object} [options]
     * @param {string} [locale]
     * @return {string}
     */
    translate(id, ...args) {
        let options = {};
        let locale = this.locale;
        if (args.length >= 2) {
            options = args[0];
            locale = args[1];
        } else if (args.length === 1) {
            if (typeof args[0] === 'object')
                options = args[0];
            else
                locale = args[0];
        }

        if (!locale)
            throw new Error(`No locale is set`);

        let formatter = this.formatters.get(locale);
        if (!formatter)
            throw new Error(`Locale ${locale} not found`);

        return formatter(id, options);
    }
}

module.exports = I18n;
