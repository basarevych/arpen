/**
 * Base class for models
 * @module arpen/models/base
 */
const moment = require('moment-timezone');

/**
 * Base class for models
 * @property {boolean} _dirty           Model has been changed flag
 */
class BaseModel {
    /**
     * Create model
     * @param {Postgres} postgres       Postgres service
     * @param {Util} util               Util service
     */
    constructor(postgres, util) {
        this._dirty = false;
        this._fields = new Map();
        this._postgres = postgres;
        this._util = util;
    }

    /**
     * Service name is 'models.base'
     * @type {string}
     */
    static get provides() {
        return 'models.base';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [ 'postgres', 'util' ];
    }

    /**
     * Set a field to a value
     * @param {string} field            DB field name
     * @param {*} value                 New value
     */
    _setField(field, value) {
        this._fields.set(field, value);
        this._dirty = true;
        return value;
    }

    /**
     * Get field
     * @param {string} field            DB field name
     * @return {*}                      Returns current value
     */
    _getField(field) {
        return this._fields.get(field);
    }

    /**
     * Convert to object. Dates are converted to strings in UTC timezone
     * @param {string[]} [fields]       Fields to save
     * @return {object}                 Returns serialized object
     */
    _serialize(fields) {
        if (!fields)
            fields = Array.from(this._fields.keys());

        let data = {};
        for (let field of fields) {
            let desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), this._util.snakeToCamel(field));
            let value = (desc && desc.get) ? desc.get.call(this) : this._getField(field);
            if (moment.isMoment(value))
                value = value.tz('UTC').format(this._postgres.constructor.datetimeFormat);
            data[field] = value;
        }
        return data;
    }

    /**
     * Load data. Dates are expected to be in UTC and are converted into local timezone
     * @param {object} data             Raw DB data object
     */
    _unserialize(data) {
        for (let field of this._fields.keys()) {
            if (typeof data[field] === 'undefined')
                continue;

            let desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), this._util.snakeToCamel(field));
            let value = (desc && desc.set) ? desc.set.call(this, data[field]) : this._setField(field, data[field]);
            if (moment.isMoment(value)) {
                value = moment.tz(value.format(this._postgres.constructor.datetimeFormat), 'UTC').local();
                if (desc && desc.set)
                    desc.set.call(this, value);
                else
                    this._setField(field, value);
            }
        }
        this._dirty = false;
    }
}

module.exports = BaseModel;
