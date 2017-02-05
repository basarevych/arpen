/**
 * Miscellaneous stuff
 * @module arpen/services/util
 */
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
        if (typeof min != 'number')
            throw new Error('Minimum is not a Number');
        if (typeof max != 'number')
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
     * Convert dashed name to camel case<br>
     * example-name → exampleName
     * @param {string} value    Dashed name
     * @return {string}         Returns camel case variant
     */
    dashedToCamel(value) {
        let result = '', foundDash = false;
        for (let char of value) {
            if (char == '-') {
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
        return result;
    }
}

module.exports = Util;
