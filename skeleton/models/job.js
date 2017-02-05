/**
 * Job model
 * @module models/job
 */
const Model = require('./base');

/**
 * Job model class
 */
class JobModel extends Model {
    /**
     * Create model
     */
    constructor() {
        super();

        this.id = undefined;
        this.status = undefined;
        this.queue = undefined;
        this.script = undefined;
        this.input = undefined;
        this.output = undefined;
        this.target = undefined;
        this.scheduleStart = undefined;
        this.scheduleEnd = undefined;
        this.createdAt = undefined;
        this.createdBy = undefined;
        this.startedAt = undefined;
        this.startedBy = undefined;
        this.finishedAt = undefined;
    }

    /**
     * Service name is 'models.job'
     * @type {string}
     */
    static get provides() {
        return 'models.job';
    }

    /**
     * Job statuses
     * @type {string[]}
     */
    static get statuses() {
        return [ 'pending', 'running', 'success', 'failure', 'expired' ];
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
     * Status setter
     * @type {undefined|string}
     */
    set status(status) {
        this._setField('status', status);
    }

    /**
     * Status getter
     * @type {undefined|string}
     */
    get status() {
        return this._getField('status');
    }

    /**
     * Queue setter
     * @type {undefined|string|null}
     */
    set queue(queue) {
        this._setField('queue', queue);
    }

    /**
     * Queue getter
     * @type {undefined|string|null}
     */
    get queue() {
        return this._getField('queue');
    }

    /**
     * Script setter
     * @type {undefined|string}
     */
    set script(script) {
        this._setField('script', script);
    }

    /**
     * Script getter
     * @type {undefined|string}
     */
    get script() {
        return this._getField('script');
    }

    /**
     * Input setter
     * @type {undefined|object}
     */
    set input(input) {
        this._setField('input', input);
    }

    /**
     * Input getter
     * @type {undefined|object}
     */
    get input() {
        return this._getField('input');
    }

    /**
     * Output setter
     * @type {undefined|object}
     */
    set output(output) {
        this._setField('output', output);
    }

    /**
     * Output getter
     * @type {undefined|object}
     */
    get output() {
        return this._getField('output');
    }

    /**
     * Target setter
     * @type {undefined|string|null}
     */
    set target(target) {
        this._setField('target', target);
    }

    /**
     * Target getter
     * @type {undefined|string|null}
     */
    get target() {
        return this._getField('target');
    }

    /**
     * Schedule start time setter
     * @type {undefined|object|null}
     */
    set scheduleStart(scheduleStart) {
        this._setField('schedule_start', scheduleStart);
    }

    /**
     * Schedule start time getter
     * @type {undefined|object|null}
     */
    get scheduleStart() {
        return this._getField('schedule_start');
    }

    /**
     * Schedule end time setter
     * @type {undefined|object|null}
     */
    set scheduleEnd(scheduleEnd) {
        this._setField('schedule_end', scheduleEnd);
    }

    /**
     * Schedule end time getter
     * @type {undefined|object|null}
     */
    get scheduleEnd() {
        return this._getField('schedule_end');
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
     * Creator setter
     * @type {undefined|string}
     */
    set createdBy(createdBy) {
        this._setField('created_by', createdBy);
    }

    /**
     * Creator getter
     * @type {undefined|string}
     */
    get createdBy() {
        return this._getField('created_by');
    }

    /**
     * Real starting time setter
     * @type {undefined|object|null}
     */
    set startedAt(startedAt) {
        this._setField('started_at', startedAt);
    }

    /**
     * Real starting time getter
     * @type {undefined|object|null}
     */
    get startedAt() {
        return this._getField('started_at');
    }

    /**
     * Job doer setter
     * @type {undefined|string|null}
     */
    set startedBy(startedBy) {
        this._setField('started_by', startedBy);
    }

    /**
     * Job doer getter
     * @type {undefined|string|null}
     */
    get startedBy() {
        return this._getField('started_by');
    }

    /**
     * Real finishing time setter
     * @type {undefined|object|null}
     */
    set finishedAt(finishedAt) {
        this._setField('finished_at', finishedAt);
    }

    /**
     * Real finishing time getter
     * @type {undefined|object|null}
     */
    get finishedAt() {
        return this._getField('finished_at');
    }
}

module.exports = JobModel;
