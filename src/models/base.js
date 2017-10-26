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
        this._fieldToProp = new Map();
        this._propToField = new Map();
        this._db = db;
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
     * Add a field
     * @param {string} field            DB field name
     * @param {string} property         Model property name
     */
    _addField(field, property) {
        this._fields.set(field, undefined);
        this._fieldToProp.set(field, property);
        this._propToField.set(property, field);
    }

    /**
     * Remove a field
     * @param {string} field            DB field name
     * @param {string} property         Model property name
     */
    _removeField(field, property) {
        this._fields.delete(field);
        this._fieldToProp.delete(field);
        this._propToField.delete(property);
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
            let prop = this._fieldToProp.get(field);
            if (!prop)
                prop = this._util.snakeToCamel(field);
            let desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), prop);
            let value = (desc && desc.get) ? desc.get.call(this) : this._getField(field);
            if (value && moment.isMoment(value)) {
                if (timeZone)
                    value = value.tz(timeZone);
                if (this._db.constructor.datetimeFormat)
                    value = value.format(this._db.constructor.datetimeFormat);
                else
                    value = value.toDate();
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

            let prop = this._fieldToProp.get(field);
            if (!prop)
                prop = this._util.snakeToCamel(field);
            let desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), prop);
            let value = (desc && desc.set) ? desc.set.call(this, data[field]) : this._setField(field, data[field]);
            if (value && moment.isMoment(value) && timeZone) {
                value = moment.tz(value.format('YYYY-MM-DD HH:mm:ss.SSS'), timeZone).local();
                value = moment(value.format('YYYY-MM-DD HH:mm:ss.SSS'));
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
