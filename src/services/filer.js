/**
 * File operations service
 * @module arpen/services/filer
 */
const fs = require('fs-ext');
const path = require('path');
const rimraf = require('rimraf');

/**
 * Buffer updater callback
 * @callback BufferFileUpdater
 * @param {Buffer} buffer       Previous file contents (Buffer)
 * @return {Promise}            Returns promise resolving to new file contents (Buffer)
 */

/**
 * String updater callback
 * @callback StringFileUpdater
 * @param {string} contents     Previous file contents (string)
 * @return {Promise}            Returns promise resolving to new file contents (string)
 */

/**
 * Callback for processing a file
 * @callback ProcessFileCallback
 * @param {string} filename     Path of the file
 * @return {Promise}            Should return a Promise
 */

/**
 * File operations service
 */
class Filer {
    /**
     * Create the service
     */
    constructor() {
    }

    /**
     * Service name is 'filer'
     * @type {string}
     */
    static get provides() {
        return 'filer';
    }

    /**
     * Dependencies as constructor arguments
     * @type {string[]}
     */
    static get requires() {
        return [];
    }

    /**
     * Read file descriptor
     * @param {number} fd       File descriptor
     * @return {Promise}        Resolves to file contents as Buffer
     */
    read(fd) {
        return new Promise((resolve, reject) => {
                fs.fstat(fd, (err, stats) => {
                    if (err)
                        return reject(err);

                    if (stats.size === 0)
                        return resolve(Buffer.from(''));

                    let buffer = Buffer.allocUnsafe(stats.size);
                    fs.read(
                        fd,
                        buffer,
                        0,
                        buffer.length,
                        null,
                        (err, bytesRead, buffer) => {
                            if (err)
                                return reject(err);
                            if (bytesRead != stats.size)
                                return reject(new Error(`Only ${bytesRead} out of ${stats.size} has been read on fd ${fd}`));

                            resolve(buffer);
                        }
                    );
                });
            });
    }

    /**
     * Write to file descriptor
     * @param {number} fd           File descriptor
     * @param {Buffer} buffer       New contents of the file
     * @return {Promise}            Resolves to true on success
     */
    write(fd, buffer) {
        return new Promise((resolve, reject) => {
                fs.write(
                    fd,
                    buffer,
                    0,
                    buffer.length,
                    null,
                    err => {
                        if (err)
                            return reject(err);

                        resolve(true);
                    }
                );
            });
    }

    /**
     * Lock a file (shared) and read it returning as a Buffer. Maximum file size is Buffer.kMaxLength bytes.
     * @param {string} filename     File path and name
     * @return {Promise}            Resolves to Buffer of file contents
     */
    lockReadBuffer(filename) {
        return new Promise((resolve, reject) => {
                let fd;
                try {
                    fd = fs.openSync(filename, 'r');
                } catch (err) {
                    return reject(err);
                }

                fs.flock(fd, 'sh', err => {
                    if (err)
                        return reject(err);

                    this.read(fd)
                        .then(data => {
                            fs.flock(fd, 'un', err => {
                                if (fd) {
                                    fs.closeSync(fd);
                                    fd = null;
                                }

                                if (err)
                                     return reject(err);

                                resolve(data);
                            });
                        })
                        .catch(err => {
                            if (fd) {
                                fs.closeSync(fd);
                                fd = null;
                            }

                            reject(err);
                        });
                });
            });
    }

    /**
     * Do .lockReadBuffer() and return it as UTF8 string
     * @param {string} filename             File path and name
     * @return {Promise}                    Resolves to file contents
     */
    lockRead(filename) {
        return this.lockReadBuffer(filename)
            .then(buffer => {
                return buffer.toString();
            });
    }

    /**
     * Lock a file (exclusively) and write to it
     * @param {string} filename             File path and name
     * @param {Buffer} buffer               New file contents
     * @param {object} [params]             File parameters (not changed if omitted)
     * @param {number} [params.mode=null]   Mode
     * @param {number} [params.uid=null]    UID
     * @param {number} [params.gid=null]    GID
     * @return {Promise}                    Resolves to true on success
     */
    lockWriteBuffer(filename, buffer, { mode = null, uid = null, gid = null } = {}) {
        return new Promise((resolve, reject) => {
                let fd;
                try {
                    fd = fs.openSync(filename, 'w');
                } catch (err) {
                    return reject(err);
                }

                fs.flock(fd, 'ex', err => {
                    if (err)
                        return reject(err);

                    this.write(fd, buffer)
                        .then(() => {
                            if (mode !== null)
                                fs.chmodSync(filename, mode);
                            if (uid !== null && gid !== null)
                                fs.chownSync(filename, uid, gid);
                            fs.flock(fd, 'un', err => {
                                if (fd) {
                                    fs.closeSync(fd);
                                    fd = null;
                                }

                                if (err)
                                    return reject(err);

                                resolve(true);
                            });
                        })
                        .catch(err => {
                            if (fd) {
                                fs.closeSync(fd);
                                fd = null;
                            }

                            reject(err);
                        });
                });
            });
    }

    /**
     * Convert string to a Buffer and do a .lockWriteBuffer()
     * @param {string} filename             File path and name
     * @param {string} contents             New file contents
     * @param {object} [params]             File parameters (not changed if omitted)
     * @param {number} [params.mode=null]   Mode
     * @param {number} [params.uid=null]    UID
     * @param {number} [params.gid=null]    GID
     * @return {Promise}                    Resolves to true on success
     */
    lockWrite(filename, contents, { mode = null, uid = null, gid = null } = {}) {
        let buffer = Buffer.from(contents);
        return this.lockWriteBuffer(filename, buffer, { mode, uid, gid });
    }

    /**
     * Lock a file (exclusively) and update it using Buffer
     * @param {string} filename             File path and name
     * @param {BufferFileUpdater} cb        Buffer updater callback
     * @param {object} [params]             File parameters (not changed if omitted)
     * @param {number} [params.mode=null]   Mode
     * @param {number} [params.uid=null]    UID
     * @param {number} [params.gid=null]    GID
     * @return {Promise}                    Resolves to true on success
     */
    lockUpdateBuffer(filename, cb, { mode = null, uid = null, gid = null } = {}) {
        return new Promise((resolve, reject) => {
                let fd;
                try {
                    fd = fs.openSync(filename, 'a+');
                } catch (err) {
                    return reject(err);
                }

                fs.flock(fd, 'ex', err => {
                    if (err)
                        return reject(err);

                    this.read(fd)
                        .then(buffer => {
                            let result = cb(buffer);
                            if (typeof result != 'object' || result === null || typeof result.then != 'function')
                                throw new Error(`The callback did not return a Promise`);
                            return result;
                        })
                        .then(newBuffer => {
                            fs.ftruncateSync(fd, 0);
                            return this.write(fd, newBuffer);
                        })
                        .then(() => {
                            if (mode !== null)
                                fs.chmodSync(filename, mode);
                            if (uid !== null && gid !== null)
                                fs.chownSync(filename, uid, gid);
                            fs.flock(fd, 'un', err => {
                                if (fd) {
                                    fs.closeSync(fd);
                                    fd = null;
                                }

                                if (err)
                                    return reject(err);

                                resolve(true);
                            });
                        })
                        .catch(err => {
                            if (fd) {
                                fs.closeSync(fd);
                                fd = null;
                            }

                            reject(err);
                        });
                });
            });
    }

    /**
     * Lock a file (exclusively) and update it using string
     * @param {string} filename             File path and name
     * @param {StringFileUpdater} cb        String updater callback
     * @param {object} [params]             File parameters (not changed if omitted)
     * @param {number} [params.mode=null]   Mode
     * @param {number} [params.uid=null]    UID
     * @param {number} [params.gid=null]    GID
     * @return {Promise}                    Resolves to true on success
     */
    lockUpdate(filename, cb, { mode = null, uid = null, gid = null } = {}) {
        let stringCb = buffer => {
            let result = cb(buffer.toString());
            if (typeof result != 'object' || result === null || typeof result.then != 'function')
                return Promise.reject(new Error(`The callback did not return a Promise`));

            return result
                .then(str => {
                    return Buffer.from(str);
                });
        };
        return this.lockUpdateBuffer(filename, stringCb, { mode, uid, gid });
    }

    /**
     * Create a directory (recursively)
     * @param {string} filename             Absolute path of the directory
     * @param {object} [params]             File parameters (not changed if omitted)
     * @param {number} [params.mode=null]   Mode
     * @param {number} [params.uid=null]    UID
     * @param {number} [params.gid=null]    GID
     * @return {Promise}                    Resolves to true on success
     */
    createDirectory(filename, { mode = null, uid = null, gid = null } = {}) {
        return new Promise((resolve, reject) => {
                if (filename.length < 2 || filename[0] != '/')
                    return reject(`Invalid path: ${filename}`);

                let parts = filename.split('/');
                parts.shift();

                let dirs = [];
                for (let i = 0; i < parts.length; i++) {
                    let dir = '';
                    for (let j = 0; j <= i; j++)
                        dir += '/' + parts[j];
                    dirs.push(dir);
                }

                dirs.reduce(
                        (prev, cur) => {
                            return prev.then(() => {
                                let stats;
                                try {
                                    stats = fs.statSync(cur);
                                } catch (err) {
                                    // do nothing
                                }

                                if (stats) {
                                    if (!stats.isDirectory())
                                        throw new Error(`Path exists and not a directory: ${cur}`);
                                } else {
                                    fs.mkdirSync(cur, mode === null ? undefined : mode);
                                    if (uid !== null && gid !== null)
                                        fs.chownSync(cur, uid, gid);
                                }
                            });
                        },
                        Promise.resolve()
                    )
                    .then(() => {
                        resolve(true);
                    })
                    .catch(err => {
                        reject(err);
                    });
            });
    }

    /**
     * Create a file (its base dir must exist)
     * @param {string} filename             Absolute path of the file
     * @param {object} [params]             File parameters (not changed if omitted)
     * @param {number} [params.mode=null]   Mode
     * @param {number} [params.uid=null]    UID
     * @param {number} [params.gid=null]    GID
     * @return {Promise}                    Resolves to true on success
     */
    createFile(filename, { mode = null, uid = null, gid = null } = {}) {
        return new Promise((resolve, reject) => {
                if (filename.length < 2 || filename[0] != '/')
                    return reject(`Invalid path: ${filename}`);

                try {
                    if (!fs.statSync(filename).isFile())
                        return reject(new Error(`Path exists and not a file: ${filename}`));

                    return resolve(true);
                } catch (err) {
                    // do nothing
                }

                try {
                    let fd = fs.openSync(filename, 'a', mode === null ? undefined : mode);
                    fs.closeSync(fd);

                    if (uid !== null && gid !== null)
                        fs.chownSync(filename, uid, gid);

                    resolve(true);
                } catch (err) {
                    reject(err);
                }
            });
    }

    /**
     * Remove a file or directory recursively
     * @param {string} filename     Path of a file or directory
     * @return {object}             Resolves to true on success
     */
    remove(filename) {
        return new Promise((resolve, reject) => {
                if (filename.length < 2 || filename[0] != '/')
                    return reject(`Invalid path: ${filename}`);

                try {
                    fs.lstatSync(filename);
                } catch (err) {
                    return reject(err);
                }

                rimraf(filename, { disableGlob: true }, err => {
                    if (err)
                        return reject(err);

                    resolve(true);
                });
            });
    }

    /**
     * Execute a callback for the filename if it is a file. If it is a directory then execute it for every file in that
     * directory recursively.<br>
     * Execution is chained, if any of the callback invocations rejects then the entire process is rejected.
     * @param {string} filename             Path to the file or directory
     * @param {ProcessFileCallback} cb      The callback
     * @return {Promise}                    Resolves to true on success
     */
    process(filename, cb) {
        try {
            if (!fs.statSync(filename).isDirectory()) {
                let result = cb(filename);
                if (typeof result != 'object' || result === null || typeof result.then != 'function')
                    return Promise.reject(new Error(`The callback did not return a Promise for "${name}"`));
                return result;
            }
        } catch (err) {
            return Promise.resolve();
        }

        let names;
        try {
            names = fs.readdirSync(filename);
        } catch (err) {
            return Promise.resolve();
        }

        names.sort();
        return names.reduce((prev, cur) => {
            let name = path.join(filename, cur);
            try {
                if (fs.statSync(name).isDirectory()) {
                    return prev.then(() => { return this.process(name, cb); });
                }
            } catch (err) {
                return prev;
            }

            return prev.then(() => {
                let result = cb(name);
                if (typeof result != 'object' || result === null || typeof result.then != 'function')
                    throw new Error(`The callback did not return a Promise for "${name}"`);
                return result;
            });
        }, Promise.resolve());
    }
}

module.exports = Filer;