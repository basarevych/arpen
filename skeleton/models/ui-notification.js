/**
 * Web interface notification model
 * @module models/ui-notification
 */
const Model = require('./base');

/**
 * Notification model class
 */
class UiNotificationModel extends Model {
    /**
     * Create model
     */
    constructor() {
        super();

        this.id = undefined;
        this.text = undefined;
        this.title = undefined;
        this.icon = undefined;
        this.variables = undefined;
        this.userId = undefined;
        this.roleId = undefined;
    }

    /**
     * Service name is 'models.uiNotification'
     * @type {string}
     */
    static get provides() {
        return 'models.uiNotification';
    }

    /**
     * Pubsub channel name
     * @type {string}
     */
    static get pubsubChannel() {
        return 'ui_notification';
    }

    /**
     * ID setter
     * @type {undefined|string}
     */
    set id(id) {
        this._setField('id', id);
    }

    /**
     * ID getter
     * @type {undefined|string}
     */
    get id() {
        return this._getField('id');
    }

    /**
     * Text setter
     * @type {undefined|string}
     */
    set text(text) {
        this._setField('text', text);
    }

    /**
     * Text getter
     * @type {undefined|string}
     */
    get text() {
        return this._getField('text');
    }

    /**
     * Title setter
     * @type {undefined|string|null}
     */
    set title(title) {
        this._setField('title', title);
    }

    /**
     * Title getter
     * @type {undefined|string|null}
     */
    get title() {
        return this._getField('title');
    }

    /**
     * Icon class setter
     * @type {undefined|string|null}
     */
    set icon(icon) {
        this._setField('icon', icon);
    }

    /**
     * Icon class getter
     * @type {undefined|string|null}
     */
    get icon() {
        return this._getField('icon');
    }

    /**
     * Variables param setter
     * @type {undefined|object}
     */
    set variables(variables) {
        this._setField('variables', variables);
    }

    /**
     * Variables param getter
     * @type {undefined|object}
     */
    get variables() {
        return this._getField('variables');
    }

    /**
     * User ID setter
     * @type {undefined|number|null}
     */
    set userId(userId) {
        this._setField('user_id', userId);
    }

    /**
     * User ID getter
     * @type {undefined|number|null}
     */
    get userId() {
        return this._getField('user_id');
    }

    /**
     * Role ID setter
     * @type {undefined|number|null}
     */
    set roleId(roleId) {
        this._setField('role_id', roleId);
    }

    /**
     * Role ID getter
     * @type {undefined|number|null}
     */
    get roleId () {
        return this._getField('role_id');
    }
}

module.exports = UiNotificationModel;
