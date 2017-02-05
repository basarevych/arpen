/**
 * Session model
 * @module models/session
 */
const Model = require('./base');

/**
 * Session model class
 */
class SessionModel extends Model {
    /**
     * Create model
     */
    constructor() {
        super();

        this.id = undefined;
        this.userId = undefined;
        this.payload = undefined;
        this.info = undefined;
        this.createdAt = undefined;
        this.updatedAt = undefined;
    }

    /**
     * Service name is 'models.session'
     * @type {string}
     */
    static get provides() {
        return 'models.session';
    }

    /**
     * ID setter
     * @type {undefined|number}
     */
    set id(id) {
        this._setField('id', id);
    }

    /**
     * ID getter
     * @type {undefined|number}
     */
    get id() {
        return this._getField('id');
    }

    /**
     * User ID setter
     * @type {undefined|number|null}
     */
    set userId(id) {
        this._setField('user_id', id);
    }

    /**
     * User ID getter
     * @type {undefined|number|null}
     */
    get userId() {
        return this._getField('user_id');
    }

    /**
     * Payload setter
     * @type {undefined|object}
     */
    set payload(payload) {
        this._setField('payload', payload);
    }

    /**
     * Payload getter
     * @type {undefined|object}
     */
    get payload() {
        return this._getField('payload');
    }

    /**
     * Info setter
     * @type {undefined|object}
     */
    set info(info) {
        this._setField('info', info);
    }

    /**
     * Info getter
     * @type {undefined|object}
     */
    get info() {
        return this._getField('info');
    }

    /**
     * Creation time setter
     * @type {undefined|object}
     */
    set createdAt(createdAt) {
        this._setField('created_at', createdAt);
    }

    /**
     * Creation time getter
     * @type {undefined|object}
     */
    get createdAt() {
        return this._getField('created_at');
    }

    /**
     * Modification time setter
     * @type {undefined|object}
     */
    set updatedAt(updatedAt) {
        this._setField('updated_at', updatedAt);
    }

    /**
     * Modification time getter
     * @type {undefined|object}
     */
    get updatedAt() {
        return this._getField('updated_at');
    }
}

module.exports = SessionModel;
