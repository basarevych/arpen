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
     * @param {Postgres|MySQL|Mongo} db     Database service
     * @param {Util} util                   Util service
     */
    constructor(db, util) {
        this._dirty = false;
        this._fields = new Map();
        this._db = db;
        this._util = util;

        this.id = undefined;
    }

    /**
     * Service name is 'models.base'
     * @type {string}
     */
    static get provides() {
        return 'models.base';
    }

    /**
     * ID setter
     * @type {undefined|number}
     */
    set id(id) {
        return this._setField('id', id);
    }

    /**
     * ID getter
     * @type {undefined|number}
     */
    get id() {
        return this._getField('id');
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
     * @param {string[]} [fields]                       Fields to save
     * @param {object} [options]                        Options
     * @param {string|null} [options.timeZone='UTC']    DB time zone
     * @return {object}                                 Returns serialized object
     */
    _serialize(fields, options = {}) {
        if (fields && !Array.isArray(fields)) {
            options = fields;
            fields = undefined;
        }
        if (!fields)
            fields = Array.from(this._fields.keys());
        let { timeZone = 'UTC' } = options;

        let data = {};
        for (let field of fields) {
            let desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), this._util.snakeToCamel(field));
            let value = (desc && desc.get) ? desc.get.call(this) : this._getField(field);
            if (value && moment.isMoment(value)) {
                if (timeZone)
                    value = value.tz(timeZone);
                value = value.format(this._db.constructor.datetimeFormat);
            }
            data[field] = value;
        }
        return data;
    }

    /**
     * Load data. Dates are expected to be in UTC and are converted into local timezone
     * @param {object} data                             Raw DB data object
     * @param {object} [options]                        Options
     * @param {string|null} [options.timeZone='UTC']    DB time zone
     */
    _unserialize(data, options = {}) {
        let { timeZone = 'UTC' } = options;

        for (let field of this._fields.keys()) {
            this._fields.set(field, undefined);

            if (typeof data[field] === 'undefined')
                continue;

            let desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), this._util.snakeToCamel(field));
            let value = (desc && desc.set) ? desc.set.call(this, data[field]) : this._setField(field, data[field]);
            if (value && moment.isMoment(value) && timeZone) {
                value = moment.tz(value.format(this._db.constructor.datetimeFormat), timeZone).local();
                value = moment(value.format(this._db.constructor.datetimeFormat));
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
