/**
 * File operations service
 * @module arpen/services/filer
 */
const fs = require('fs-ext');
const path = require('path');
const rimraf = require('rimraf');
const NError = require('nerror');

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
 * Callback for processing a directory
 * @callback ProcessDirCallback
 * @param {string} filename     Path of the file
 * @return {Promise}            Should return a Promise resolving to true if directory
 *                              needs processing
 */

/**
 * File operations service
 */
class Filer {
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
     * Check if filename exists
     * @param {string} filename                     File path
     * @param {boolean} [followSymlinks=true]       Check the file symlink points to
     * @return {Promise}                            Resolves to boolean
     */
    async exists(filename, followSymlinks = true) {
        return new Promise(resolve => {
            let query = followSymlinks ? fs.stat : fs.lstat;
            query(filename, error => { resolve(!error); });
        });
    }

    /**
     * Read file descriptor
     * @param {number} fd       File descriptor
     * @return {Promise}        Resolves to file contents as Buffer
     */
    async read(fd) {
        return new Promise((resolve, reject) => {
            fs.fstat(fd, (error, stats) => {
                if (error)
                    return reject(error);

                let buffer = Buffer.allocUnsafe(stats.size);
                if (!stats.size)
                    return resolve(buffer);

                fs.read(
                    fd,
                    buffer,
                    0,
                    buffer.length,
                    null,
                    (error, bytesRead, buffer) => {
                        if (error)
                            return reject(error);
                        if (bytesRead !== stats.size)
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
    async write(fd, buffer) {
        return new Promise((resolve, reject) => {
            fs.ftruncate(fd, 0, error => {
                if (error)
                    return reject(error);

                if (!buffer.length)
                    return resolve(true);

                fs.write(
                    fd,
                    buffer,
                    0,
                    buffer.length,
                    null,
                    error => {
                        if (error)
                            return reject(error);

                        resolve(true);
                    }
                );
            });
        });
    }

    /**
     * Lock a file (shared) and read it returning as a Buffer. Maximum file size is Buffer.kMaxLength bytes.
     * File must exist.
     * @param {string} filename     File path and name
     * @return {Promise}            Resolves to Buffer of file contents
     */
    async lockReadBuffer(filename) {
        let fd, locked, buffer, lastError;

        try {
            fd = await new Promise((resolve, reject) => {
                fs.open(filename, 'r', (error, fd) => {
                    if (error)
                        return reject(error);

                    resolve(fd);
                });
            });
            locked = await new Promise((resolve, reject) => {
                fs.flock(fd, 'sh', async error => {
                    if (error)
                        return reject(error);

                    resolve(true);
                });
            });
            buffer = await this.read(fd);
        } catch (error) {
            lastError = error;
        }

        await new Promise(resolve => {
            if (!fd || !locked)
                return resolve();

            fs.flock(fd, 'un', error => {
                if (error && !lastError)
                    lastError = error;

                resolve();
            });
        });
        await new Promise(resolve => {
            if (!fd)
                return resolve();

            fs.close(fd, error => {
                if (error && !lastError)
                    lastError = error;

                resolve();
            });
        });

        if (lastError)
            throw new NError(lastError, { filename }, 'Filer.lockReadBuffer()');

        return buffer;
    }

    /**
     * Do .lockReadBuffer() and return it as UTF8 string
     * @param {string} filename             File path and name
     * @return {Promise}                    Resolves to file contents
     */
    async lockRead(filename) {
        let buffer = await this.lockReadBuffer(filename);
        return buffer.toString();
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
    async lockWriteBuffer(filename, buffer, params = {}) {
        let { mode = null, uid = null, gid = null } = params;
        let fd, locked, stats, lastError;

        try {
            fd = await new Promise((resolve, reject) => {
                fs.open(filename, 'w', (error, fd) => {
                    if (error)
                        return reject(error);

                    resolve(fd);
                });
            });
            locked = await new Promise((resolve, reject) => {
                fs.flock(fd, 'ex', async error => {
                    if (error)
                        return reject(error);

                    resolve(true);
                });
            });

            await this.write(fd, buffer);

            stats = await new Promise((resolve, reject) => {
                fs.fstat(fd, (error, stats) => {
                    if (error)
                        return reject(error);

                    resolve(stats);
                });
            });

            await new Promise((resolve, reject) => {
                if (mode === null || stats.mode === mode)
                    return resolve();

                fs.chmod(filename, mode, error => {
                    if (error)
                        return reject(error);

                    resolve();
                });
            });
            await new Promise((resolve, reject) => {
                if (uid === null || gid === null || (stats.uid === uid && stats.gid === gid))
                    return resolve();

                fs.chown(filename, uid, gid, error => {
                    if (error)
                        return reject(error);

                    resolve();
                });
            });
        } catch (error) {
            lastError = error;
        }

        await new Promise(resolve => {
            if (!fd || !locked)
                return resolve();

            fs.flock(fd, 'un', error => {
                if (error && !lastError)
                    lastError = error;

                resolve();
            });
        });
        await new Promise(resolve => {
            if (!fd)
                return resolve();

            fs.close(fd, error => {
                if (error && !lastError)
                    lastError = error;

                resolve();
            });
        });

        if (lastError)
            throw new NError(lastError, { filename }, 'Filer.lockWriteBuffer()');

        return true;
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
    async lockWrite(filename, contents, params = {}) {
        let { mode = null, uid = null, gid = null } = params;
        return this.lockWriteBuffer(filename, Buffer.from(contents), { mode, uid, gid });
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
    async lockUpdateBuffer(filename, cb, params = {}) {
        let { mode = null, uid = null, gid = null } = params;
        let fd, locked, stats, lastError;

        try {
            fd = await new Promise((resolve, reject) => {
                fs.open(filename, 'w', (error, fd) => {
                    if (error)
                        return reject(error);

                    resolve(fd);
                });
            });
            locked = await new Promise((resolve, reject) => {
                fs.flock(fd, 'ex', async error => {
                    if (error)
                        return reject(error);

                    resolve(true);
                });
            });

            let oldBuffer = await this.read(fd);
            let newBuffer = await cb(oldBuffer);
            if (!oldBuffer.equals(newBuffer)) {
                await this.write(fd, newBuffer);

                stats = await new Promise((resolve, reject) => {
                    fs.fstat(fd, (error, stats) => {
                        if (error)
                            return reject(error);

                        resolve(stats);
                    });
                });

                await new Promise((resolve, reject) => {
                    if (mode === null || stats.mode === mode)
                        return resolve();

                    fs.chmod(filename, mode, error => {
                        if (error)
                            return reject(error);

                        resolve();
                    });
                });
                await new Promise((resolve, reject) => {
                    if (uid === null || gid === null || (stats.uid === uid && stats.gid === gid))
                        return resolve();

                    fs.chown(filename, uid, gid, error => {
                        if (error)
                            return reject(error);

                        resolve();
                    });
                });
            }
        } catch (error) {
            lastError = error;
        }

        await new Promise(resolve => {
            if (!fd || !locked)
                return resolve();

            fs.flock(fd, 'un', error => {
                if (error && !lastError)
                    lastError = error;

                resolve();
            });
        });
        await new Promise(resolve => {
            if (!fd)
                return resolve();

            fs.close(fd, error => {
                if (error && !lastError)
                    lastError = error;

                resolve();
            });
        });

        if (lastError)
            throw new NError(lastError, { filename }, 'Filer.lockUpdateBuffer()');

        return true;
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
    async lockUpdate(filename, cb, params = {}) {
        let { mode = null, uid = null, gid = null } = params;

        let stringCb = async buffer => {
            let result = await cb(buffer.toString());
            return Buffer.from(result);
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
    async createDirectory(filename, params = {}) {
        let { mode = null, uid = null, gid = null } = params;

        if (filename.length < 2 || filename[0] !== '/')
            throw new Error(`Invalid path: ${filename}`);

        let parts = filename.split('/');
        parts.shift();

        let dirs = [];
        for (let i = 0; i < parts.length; i++) {
            let dir = '';
            for (let j = 0; j <= i; j++)
                dir += '/' + parts[j];
            dirs.push(dir);
        }

        try {
            await dirs.reduce(
                async (prev, cur) => {
                    await prev;

                    let stats = await new Promise(resolve => {
                        fs.stat(cur, (error, stats) => {
                            resolve(error ? null : stats);
                        });
                    });

                    if (stats) {
                        if (!stats.isDirectory())
                            throw new Error(`Path exists and not a directory: ${cur}`);
                    } else {
                        await new Promise((resolve, reject) => {
                            fs.mkdir(cur, error => {
                                if (error)
                                    return reject(error);

                                resolve();
                            });
                        });
                        stats = await new Promise((resolve, reject) => {
                            fs.stat(cur, (error, stats) => {
                                if (error)
                                    return reject(error);

                                resolve(stats);
                            });
                        });
                        await new Promise((resolve, reject) => {
                            if (mode === null || stats.mode === mode)
                                return resolve();

                            fs.chmod(cur, mode, error => {
                                if (error)
                                    return reject(error);

                                resolve();
                            });
                        });
                        await new Promise((resolve, reject) => {
                            if (uid === null || gid === null || (stats.uid === uid && stats.gid === gid))
                                return resolve();

                            fs.chown(cur, uid, gid, error => {
                                if (error)
                                    return reject(error);

                                resolve();
                            });
                        });
                    }
                },
                Promise.resolve()
            );
        } catch (error) {
            throw new NError(error, { filename, params }, 'Filer.createDirectory()');
        }

        return true;
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
    async createFile(filename, params = {}) {
        let { mode = null, uid = null, gid = null } = params;

        if (filename.length < 2 || filename[0] !== '/')
            throw new Error(`Invalid path: ${filename}`);

        try {
            let exists = await new Promise((resolve, reject) => {
                if (filename.length < 2 || filename[0] !== '/')
                    return reject(new Error(`Invalid path: ${filename}`));

                fs.stat(filename, (error, stats) => {
                    if (error)
                        return resolve(false);

                    if (!stats.isFile())
                        return reject(new Error(`Path exists and not a file: ${filename}`));

                    resolve(true);
                });
            });

            if (exists)
                return true;

            let fd = await new Promise((resolve, reject) => {
                fs.open(filename, 'a', (error, fd) => {
                    if (error)
                        return reject(error);

                    resolve(fd);
                });
            });
            await new Promise((resolve, reject) => {
                fs.close(fd, error => {
                    if (error)
                        return reject(error);

                    resolve();
                });
            });
            let stats = await new Promise((resolve, reject) => {
                fs.fstat(fd, (error, stats) => {
                    if (error)
                        return reject(error);

                    resolve(stats);
                });
            });
            await new Promise((resolve, reject) => {
                if (mode === null || stats.mode === mode)
                    return resolve();

                fs.chmod(filename, mode, error => {
                    if (error)
                        return reject(error);

                    resolve();
                });
            });
            await new Promise((resolve, reject) => {
                if (uid === null || gid === null || (stats.uid === uid && stats.gid === gid))
                    return resolve();

                fs.chown(filename, uid, gid, error => {
                    if (error)
                        return reject(error);

                    resolve();
                });
            });
        } catch (error) {
            throw new NError(error, { filename, params }, 'Filer.createFile()');
        }

        return true;
    }

    /**
     * Remove a file or directory recursively
     * @param {string} filename     Absolute path of a file or directory
     * @return {Promise}            Resolves to true on success
     */
    async remove(filename) {
        if (filename.length < 2 || filename[0] !== '/')
            throw new Error(`Invalid path: ${filename}`);

        try {
            if (!await this.exists(filename, false))
                return true;

            await new Promise((resolve, reject) => {
                rimraf(filename, { disableGlob: true }, error => {
                    if (error)
                        return reject(error);

                    resolve();
                });
            });
        } catch (error) {
            throw new NError(error, { filename }, 'Filer.remove()');
        }

        return true;
    }

    /**
     * Execute a callback for the filename if it is a file. If it is a directory then execute it for every file in that
     * directory recursively.<br>
     * Execution is chained, if any of the callback invocations rejects then the entire process is rejected.
     * @param {string} filename                 Absolute path to the file or directory
     * @param {ProcessFileCallback} [cbFile]    The file callback
     * @param {ProcessDirCallback} [cbDir]      The directory callback. Should resolve to true if this subdirectory
     *                                          needs processing
     * @return {Promise}                        Resolves to true on success if filename exists or to false if it does not
     */
    async process(filename, cbFile, cbDir) {
        if (filename.length < 2 || filename[0] !== '/')
            throw new Error(`Invalid path: ${filename}`);

        try {
            let isFile;
            let exists = await new Promise(resolve => {
                fs.stat(filename, (error, stats) => {
                    if (error)
                        return resolve(false);

                    isFile = stats.isFile();
                    resolve(true);
                });
            });

            if (!exists)
                return false;

            if (isFile) {
                if (cbFile)
                    await cbFile(filename);

                return true;
            }

            let names = await new Promise((resolve, reject) => {
                fs.readdir(filename, (error, files) => {
                    if (error)
                        return reject(error);

                    resolve(files);
                });
            });

            names.sort();
            await names.reduce(
                async (prev, cur) => {
                    await prev;

                    let name = path.join(filename, cur);
                    let isDir = await new Promise((resolve, reject) => {
                        fs.stat(name, (error, stats) => {
                            if (error)
                                return reject(error);

                            resolve(stats.isDirectory());
                        });
                    });

                    if (isDir) {
                        if (cbDir ? await cbDir(name) : true)
                            return this.process(name, cbFile, cbDir);
                    } else if (cbFile) {
                        return cbFile(name);
                    }
                },
                Promise.resolve()
            );
        } catch (error) {
            throw new NError(error, { filename }, 'Filer.process()');
        }

        return true;
    }
}

module.exports = Filer;
