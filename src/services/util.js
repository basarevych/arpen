/**
 * Miscellaneous stuff
 * @module arpen/services/util
 */
const bcrypt = require('bcrypt');
const merge = require('merge');
const validator = require('validator');

/**
 * Util helper
 */
class Util {
    /**
     * Create the service
     */
    constructor() {
    }

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
     * @return {boolean}
     */
    isUuid(value) {
        return /[a-f0-9]{8}-?[a-f0-9]{4}-?[1-5][a-f0-9]{3}-?[89ab][a-f0-9]{3}-?[a-f0-9]{12}/i.test(value);
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
                return validator.trim(value);
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
     * @param {boolean} params.lower=true       Include lower latin letters
     * @param {boolean} params.upper=true       Include upper latin letters
     * @param {boolean} params.digits=true      Include digits
     * @param {boolean} params.special=false    Include some special characters
     * @return {string}                         Returns the string
     */
    getRandomString(length, { lower = true, upper = true, digits = true, special = false } = {}) {
        let chars = '';
        if (lower)
            chars += 'abcdefghijklmnopqrstuvwxyz';
        if (upper)
            chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (digits)
            chars += '0123456789';
        if (special)
            chars += '~!@#$%^&*()_+-=/|?';

        let string = "";
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
     * Create hash of a password
     * @param {string} password                 The password
     * @return {string}                         Returns the hash
     */
    encryptPassword(password) {
        let salt = bcrypt.genSaltSync(10);
        return bcrypt.hashSync(password, salt);
    }

    /**
     * Check if password matches the hash
     * @param {string} password                 Password to check
     * @param {string} hash                     Hash of the password
     * @return {boolean}
     */
    checkPassword(password, hash) {
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
        let result = '', foundDash = false;
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
}

module.exports = Util;
