/**
 * Miscellaneous stuff
 * @module arpen/services/util
 */
let bcrypt;
try {
    bcrypt = require('bcrypt');
} catch (error) {
    // do nothing
}

/**
 * Util helper
 * <br><br>
 * bcrypt module is required for password methods
 */
class Util {
    /**
     * Service name is 'util'
     * @type {string}
     */
    static get provides() {
        return 'util';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [];
    }

    /**
     * Check if given string is UUID
     * @param {string} value        The string to check
     * @return {boolean|null}       Returns null for all zeroes otherwise boolean
     */
    isUuid(value) {
        if (/[a-f0-9]{8}-?[a-f0-9]{4}-?[1-5][a-f0-9]{3}-?[89ab][a-f0-9]{3}-?[a-f0-9]{12}/i.test(value))
            return true;
        if (/[0]{8}-?[0]{4}-?[0]{4}-?[0]{4}-?[0]{12}/.test(value))
            return null;

        return false;
    }

    /**
     * Convert value to a trimmed string<br>
     * Accepts string or number and returns empty string for anything else
     * @param {*} value             The value
     * @return {string}             Returns trimmed string
     */
    trim(value) {
        switch (typeof value) {
            case 'string':
                return value.trim();
            case 'number':
                return String(value);
        }
        return '';
    }

    /**
     * Returns a random integer between min (inclusive) and max (inclusive)
     * @param {number} min          Minimum
     * @param {number} max          Maximum
     * @return {number}             Returns random in range
     */
    getRandomInt(min, max) {
        if (typeof min !== 'number')
            throw new Error('Minimum is not a Number');
        if (typeof max !== 'number')
            throw new Error('Maximum is not a Number');

        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Get random string
     * @param {number} length                   The length of a password
     * @param {object} [params]                 Parameters object
     * @param {boolean} [params.lower=true]     Include lower latin letters
     * @param {boolean} [params.upper=true]     Include upper latin letters
     * @param {boolean} [params.digits=true]    Include digits
     * @param {boolean} [params.special=false]  Include some special characters
     * @return {string}                         Returns the string
     */
    getRandomString(length, params = {}) {
        let { lower = true, upper = true, digits = true, special = false } = params;

        let chars = '';
        if (lower)
            chars += 'abcdefghijklmnopqrstuvwxyz';
        if (upper)
            chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (digits)
            chars += '0123456789';
        if (special)
            chars += '~!@#$%^&*()_+-=/|?';

        let string = '';
        for (let i = 0; i < length; i++)
            string += chars.charAt(Math.floor(Math.random() * chars.length));

        return string;
    }

    /**
     * Generate a password
     * @return {string}                         Returns the password
     */
    generatePassword() {
        return this.getRandomString(8, { lower: true, upper: true, digits: true });
    }

    /**
     * Create hash of a password. Requires 'bcrypt' module.
     * @param {string} password                 The password
     * @return {string}                         Returns the hash
     */
    encryptPassword(password) {
        if (!bcrypt)
            throw new Error('bcrypt module is required for password methods of Util service');

        let salt = bcrypt.genSaltSync(10);
        return bcrypt.hashSync(password, salt);
    }

    /**
     * Check if password matches the hash. Requires 'bcrypt' module.
     * @param {string} password                 Password to check
     * @param {string} hash                     Hash of the password
     * @return {boolean}
     */
    checkPassword(password, hash) {
        if (!bcrypt)
            throw new Error('bcrypt module is required for password methods of Util service');

        return bcrypt.compareSync(password, hash);
    }

    /**
     * Convert dashed name to camel case<br>
     * example-name → exampleName
     * @param {string} value                    Dashed name
     * @param {boolean} [upperFirst=false]      First letter is upper case
     * @return {string}                         Returns camel case variant
     */
    dashedToCamel(value, upperFirst = false) {
        let result = '';
        let foundDash = false;
        for (let char of value) {
            if (char === '-') {
                foundDash = true;
            } else {
                if (foundDash) {
                    foundDash = false;
                    result += char.toUpperCase();
                } else {
                    result += char;
                }
            }
        }
        if (!upperFirst || !result.length)
            return result;

        return result[0].toUpperCase() + result.slice(1);
    }

    /**
     * Convert camel case name to dashed<br>
     * exampleName → example-name
     * @param {string} value                    Camel case name
     * @return {string}                         Returns dashed variant
     */
    camelToDashed(value) {
        let result = '';
        for (let i = 0; i < value.length; i++) {
            if (i && /[A-Z]/.test(value[i]))
                result += '-';
            result += value[i].toLowerCase();
        }
        return result;
    }

    /**
     * Convert snake case name to camel case<br>
     * example_name → exampleName
     * @param {string} value                    Snake case name
     * @param {boolean} [upperFirst=false]      First letter is upper case
     * @return {string}                         Returns camel case variant
     */
    snakeToCamel(value, upperFirst = false) {
        let result = '';
        let foundUnderscore = false;
        for (let char of value) {
            if (char === '_') {
                foundUnderscore = true;
            } else {
                if (foundUnderscore) {
                    foundUnderscore = false;
                    result += char.toUpperCase();
                } else {
                    result += char;
                }
            }
        }
        if (!upperFirst || !result.length)
            return result;

        return result[0].toUpperCase() + result.slice(1);
    }

    /**
     * Convert camel case name to snake case<br>
     * exampleName → example_name
     * @param {string} value                    Camel case name
     * @return {string}                         Returns snake case variant
     */
    camelToSnake(value) {
        let result = '';
        for (let i = 0; i < value.length; i++) {
            if (i && /[A-Z]/.test(value[i]))
                result += '_';
            result += value[i].toLowerCase();
        }
        return result;
    }
}

module.exports = Util;
