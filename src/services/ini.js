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
            throw new Error('ini modules is required for Ini service');
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
     * @param {boolean} [params.escaped=false]      Symbols .;# in section names are escaped
     * @return {object}
     */
    parse(contents, params = {}) {
        let { escaped = false } = params;

        if (escaped)
            return ini.parse(contents);

        let prepared = [];
        for (let line of contents.split('\n')) {
            if (/^\s*\[.+\]\s*$/.test(line))
                line = line.replace(/\./g, '\\.').replace(/#/g, '\\#').replace(/;/g, '\\;');
            prepared.push(line);
        }

        return ini.parse(prepared.join('\n'));
    }

    /**
     * Stringify INI object
     * @param {object} obj                          INI as object
     * @param {object} [params]
     * @param {boolean} [params.escaped=false]      Symbols .;# in section names are escaped
     * @return {string}
     */
    stringify(obj, params = {}) {
        let { escaped = false } = params;

        let contents = ini.stringify(obj);
        if (escaped)
            return contents;

        let prepared = [];
        for (let line of contents.split('\n')) {
            if (/^\s*\[.+\]\s*$/.test(line))
                line = line.replace(/\\\./g, '.').replace(/\\#/g, '#').replace(/\\;/g, ';');
            prepared.push(line);
        }

        return prepared.join('\n');
    }
}

module.exports = Ini;

