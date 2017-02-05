/**
 * Error hepler service
 * @module arpen/services/error
 */
const VError = require('verror');
const WError = VError.WError;

/**
 * Error helper
 */
class ErrorHelper {
    /**
     * Create the service
     */
    constructor() {
    }

    /**
     * Service name is 'error'
     * @type {string}
     */
    static get provides() {
        return 'error';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [];
    }

    /**
     * Error info object
     * @param {Error} error         Error instance
     * @return {object}             Returns info object
     */
    info(error) {
        return VError.info(error);
    }

    /**
     * Flatten WError instance
     * @param {object} error        WError with possible previous errors set
     * @return {object[]}           Returns array of all the errors
     */
    flatten(error) {
        let result = [];
        if (error)
            result.push(error);
        else
            return result;

        if (typeof error.cause != 'function')
            return result;

        return result.concat(this.flatten(error.cause()));
    }

    /**
     * Instantiate HTTP 400 error
     * @param {string} [message]    Error message
     * @return {WError}             Returns prepared WError instance
     */
    newBadRequest(message = '400: Bad Request') {
        return new WError({ info: { httpStatus: 400 } }, message);
    }

    /**
     * Instantiate HTTP 401 error
     * @param {string} [message]    Error message
     * @return {WError}             Returns prepared WError instance
     */
    newUnauthorized(message = '401: Unauthorized') {
        return new WError({ info: { httpStatus: 401 } }, message);
    }

    /**
     * Instantiate HTTP 403 error
     * @param {string} [message]    Error message
     * @return {WError}             Returns prepared WError instance
     */
    newForbidden(message = '403: Forbidden') {
        return new WError({ info: { httpStatus: 403 } }, message);
    }

    /**
     * Instantiate HTTP 404 error
     * @param {string} [message]    Error message
     * @return {WError}             Returns prepared WError instance
     */
    newNotFound(message = '404: Not Found') {
        return new WError({ info: { httpStatus: 404 } }, message);
    }
}

module.exports = ErrorHelper;