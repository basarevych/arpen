/**
 * Permission model
 * @module models/permission
 */
const Model = require('./base');

/**
 * Permission model class
 */
class PermissionModel extends Model {
    /**
     * Create model
     */
    constructor() {
        super();

        this.id = undefined;
        this.roleId = undefined;
        this.resource = undefined;
        this.action = undefined;
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
     * Role ID setter
     * @type {undefined|number}
     */
    set roleId(id) {
        this._setField('role_id', id);
    }

    /**
     * Role ID getter
     * @type {undefined|number}
     */
    get roleId() {
        return this._getField('role_id');
    }

    /**
     * Resource setter
     * @type {undefined|string|null}
     */
    set resource(resource) {
        this._setField('resource', resource);
    }

    /**
     * Resource getter
     * @type {undefined|string|null}
     */
    get resource() {
        return this._getField('resource');
    }

    /**
     * Action setter
     * @type {undefined|string|null}
     */
    set action(action) {
        this._setField('action', action);
    }

    /**
     * Action getter
     * @type {undefined|string|null}
     */
    get action() {
        return this._getField('action');
    }
}

module.exports = PermissionModel;
