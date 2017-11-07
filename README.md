# work in progress

# Arpen

Arpen is a Node.js micro-framework with class autoloading and dependency
injection. It is purpose is to aid in creation of non-Express.js
applications.

## Dependency injection

Arpen application consists of services. Here is how service looks like:

```javascript
class MyService {
    constructor(otherService, anotherService) {
        this._otherService = otherService;
        this._anotherService = anotherService;
    }
    
    static get provides() { return 'myService'; }
    static get requires() { return ['otherService', 'anotherService?']; }
    
    doStuff() {
        // do something with this._otherService
        // and this._anotherService
    }
}

module.exports = MyService;
```

This is a service which is registered in the system by key 'myService'
(*provides* static property). It requires two other services known as
'otherService' and 'anotherService' (*requires* static property). The
second one is marked by '?' sign which means that this dependency is
optional: if Arpen won't be able to instantiate it (i.e. it is not
registered) then null will be passed to the constructor instead (for
non-optional dependencies error will be thrown).

Arpen will first instantiate dependencies of the service and pass the
instances to your constructor in the same order as specified by *requires*
property. You can use this service as a dependency of another service or just
instantiate it with **app.get('myService')**.

### Life cycle

The third (optional) static property you can define on a service is
*lifecycle*. Consider the following example: we have a service A that
depends on B and C, both B and C depend on fourth service - D.

When *lifecycle* of D is 'perRequest' or not specified then both B and C
dependencies of A will receive the same instance of D when A is
instantiated. So D is instantiated only once *per request* of instantiating
A.

But if you run **app.get('A')** another time it will be new *request*
and B and C of A will receive different instance of D when instantiating
new A (but, again, both B and C will receive the same D just like in
previous **app.get('A')**).

Another possible value of *lifecycle* is 'unique': B and C will always
receive brand new D. And another one is 'singleton': D will be instantiated
only once during the whole life of the app.

### Additional parameters

If you change the constructor in the example above to this, you can pass
additional parameters to your service.

```javascript
    constructor(otherService, anotherService, value1, value2) {
        // ...
    }
```

Now you can run **app.get('A', 'abc', 123)** and **value1** will be 'abc'
and **value2** will be 123.

Services instantiated as dependencies (via *requires* property) and not
via **app.get()** cannot have additional parameters (they will be
**undefined**).

### Manual registration and instantiation

Usually you let Arpen find, load and register your services. But you
can also do this by hand. Add a dependency on 'app' service which is
instance of the application. Now your service can call **app.get()** to
instantiate a known service or **app.registerClass(classFunc)**
and **app.registerInstance(obj, name)** to register services.

.get() accepts a string or a regular expression of the service(s) to
instantiate. In RegExp case a Map of services is returned. 

.registerClass() is what is called on your class-exportig files.
.registerInstance() will register any JavaScript variable as a service.
For example:

```javascript
// In one service
let map = new Map();
map.add('key', 'value');
app.registerInstance(map, 'myMapService');

// In another service
let map = app.get('myMapService');
console.log(map.get('key'));
```

Basically instance services behave just like singleton classes.

## Class autoloading

At the top level of your application 'config' directory should exit.
It must contain at least 'global.js' file and optionally 'local.js' file.

When application is started global and local files are merged to create
configuration object of the application (both files should *export*
plain JS object with the configuration parameters). Usually global file
is submitted into the repository and the local one is excluded from the
repo so passwords can be stored in it.

One possible configuration is to put 'autoload' parameter to global file.
This is an array of paths relative to project root that will be searched
for services. If path starts with '~' symbol then it is loaded from
'node_modules' directory and not from the project root. Paths starting
with '!' symbol define what will be excluded when autoloading.

```
autoload: [
    '~arpen/src',               // load Arpen services
    'src',                      // app services are in 'src' subdir
    '!src/not-this-one',        // skip 'not-this-one' dir in 'src'
],
```

Another important configuration parameter is 'modules' (you can put it
into local configuration file, for example). This is a list of modules of
your application.

Modules defined in your configuration are searched for in 'modules'
subdirectory relative to project root. Each module is a directory with
the same 'config' subdirectory just like the main project. It should
contain at least 'global.js' with 'autoload' parameter.

Usually you put project-wide files in 'src' directory of project root
and module-specific code in 'src' relative to a module directory (don't
forget to autoload it!)

Your module should define one service with service name like
'modules.someModule' - replace 'someModule' with a unique name (no dots).

During initialization of the app this service will be instantiated and its
.bootstrap() method will be called (if it exists) which should return a
Promise.

## See it in action!

```
$ sudo npm install arpen -g --unsafe-perm
```

--unsafe-perm is needed for some C++ dependencies to compile.

```
$ arpen new my-project
$ cd my-project
$ npm install
$ ./bin/run udp
```

This is how to create and run a skeleton project. It includes one simple server
Udp which listens for UDP commands. Test it:

```
$ nc -u localhost 3000
uppercase hello world
HELLO WORLD
^C
```

To keep it simple it understands just one command: uppercase. 

This sample project has just one module 'udp' which defines one server (Udp)
which listens for one event (Uppercase).

Have a look at **modules/udp/src/servers/udp.js** file - it is the server.
Directory **modules/udp/src/events** contains the events of the server.

## Servers

Server is a service which has these methods:

.init(name) — called when app is instantiated

.start(name) — called when the app is started

.stop(name) — called when the app is stopped

**name** is the name of the server in the configuration. If you look at the
skeleton project **local.js** config you will find the following section:

```
    // Servers
    servers: {
        udp: {
            class: 'servers.udp',
            host: "0.0.0.0",
            port: 3000,
        },
    },

```

This is how you define your servers, each entry should have at least *class*
key, which is the service name of the server. The rest of keys are all up to
you: they depend on what your server expects.

You can retrieve this configuration by adding dependency on 'config' service:

```
let name = 'udp';
let port = config.get(`servers.${name}.port`);
```
