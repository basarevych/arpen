/**
 * INI file parser
 * @module arpen/services/ini
 */
let ini;
try {
    ini = require('ini');
} catch (error) {
    // do nothing
}

/**
 * INI file parser
 * <br><br>
 * ini module is required
 */
class Ini {
    /**
     * Create the service
     */
    constructor() {
        if (!ini)
            throw new Error('ini module is required for Ini service');
    }

    /**
     * Service name is 'ini'
     * @type {string}
     */
    static get provides() {
        return 'ini';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [];
    }

    /**
     * Parse INI file
     * @param {string} contents                     INI file as string
     * @param {object} [params]
     * @param {boolean} [params.simple=true]        Dots in section names have no special meaning (see ini module)
     * @return {object}
     */
    parse(contents, params = {}) {
        let { simple = true } = params;

        let prepared = [];
        for (let line of contents.split('\n')) {
            if (/^\s*\[.+\]\s*$/.test(line)) {
                line = line.replace(/#/g, '\\#').replace(/;/g, '\\;');
                if (simple)
                    line = line.replace(/\./g, '\\.');
            }
            prepared.push(line);
        }

        return ini.parse(prepared.join('\n'));
    }

    /**
     * Stringify INI object
     * @param {object} obj                          INI as object
     * @param {object} [params]
     * @param {boolean} [params.simple=true]        Dots in section names have no special meaning (see ini module)
     * @return {string}
     */
    stringify(obj, params = {}) {
        let { simple = true } = params;

        let prepared = [];
        for (let line of ini.stringify(obj).split('\n')) {
            if (/^\s*\[.+\]\s*$/.test(line)) {
                line = line.replace(/\\#/g, '#').replace(/\\;/g, ';');
                if (simple)
                    line = line.replace(/\\\./g, '.');
            }
            prepared.push(line);
        }

        return prepared.join('\n');
    }
}

module.exports = Ini;
