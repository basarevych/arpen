/**
 * Repo-saved application configuration
 */
module.exports = {
    // Project name (alphanumeric)
    project: 'arpen',

    // Load base classes and services, path names
    autoload: [
        '../src',
        'src',
    ],

    // Server instance name (alphanumeric)
    instance: 'tool',

    // Environment
    env: process.env.NODE_ENV || (!!process.env.DEBUG ? 'development' : 'production'),
};
