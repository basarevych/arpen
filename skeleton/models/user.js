/**
 * User model
 * @module models/user
 */
const bcrypt = require('bcrypt');
const Model = require('./base');

/**
 * User model class
 */
class UserModel extends Model {
    /**
     * Create model
     */
    constructor() {
        super();

        this.id = undefined;
        this.name = undefined;
        this.email = undefined;
        this.password = undefined;
        this.createdAt = undefined;
        this.blockedAt = undefined;
    }

    /**
     * Service name is 'models.user'
     * @type {string}
     */
    static get provides() {
        return 'models.user';
    }

    /**
     * Minimum password length
     */
    static get minPasswordLength() {
        return 6;
    }

    /**
     * Create hash of a password
     * @param {string} password     The password
     * @return {string}             Returns the hash
     */
    static encryptPassword(password) {
        let salt = bcrypt.genSaltSync(10);
        return bcrypt.hashSync(password, salt);
    }

    /**
     * Check if password matches current user
     * @param {string} password     Password to check
     * @return {boolean}
     */
    checkPassword(password) {
        return bcrypt.compareSync(password, this.password);
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
     * Name setter
     * @type {undefined|string|null}
     */
    set name(name) {
        this._setField('name', name);
    }

    /**
     * Name getter
     * @type {undefined|string|null}
     */
    get name() {
        return this._getField('name');
    }

    /**
     * Email setter
     * @type {undefined|string}
     */
    set email(email) {
        this._setField('email', email);
    }

    /**
     * Email getter
     * @type {undefined|string}
     */
    get email() {
        return this._getField('email');
    }

    /**
     * Password setter
     * @type {undefined|string}
     */
    set password(password) {
        this._setField('password', password);
    }

    /**
     * Password getter
     * @type {undefined|string}
     */
    get password() {
        return this._getField('password');
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
     * Block time setter
     * @type {undefined|object|null}
     */
    set blockedAt(blockedAt) {
        this._setField('blocked_at', blockedAt);
    }

    /**
     * Block time getter
     * @type {undefined|object|null}
     */
    get blockedAt() {
        return this._getField('blocked_at');
    }
}

module.exports = UserModel;
