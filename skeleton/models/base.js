/**
 * Base class for models
 * @module models/base
 */

/**
 * Base class for models
 * @property {boolean} _dirty           Model has been changed flag
 */
class Model {
    /**
     * Create model
     */
    constructor() {
        this._dirty = false;
        this._fields = new Map();
    }

    /**
     * Set a field to a value
     * @param {string} field            DB field name
     * @param {*} value                 New value
     */
    _setField(field, value) {
        this._fields.set(field, value);
        this._dirty = true;
    }

    /**
     * Get field
     * @param {string} field            DB field name
     * @return {*}                      Returns current value
     */
    _getField(field) {
        return this._fields.get(field);
    }
}

module.exports = Model;
