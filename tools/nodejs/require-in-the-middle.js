/**
 * @file require-in-the-middle depends on Browserify for self-resolution of module,
 *       to identify the main module. This does not work with better_rules_javascript
 *       (either nodejs_binary or nodejs_binary_package), so override it.
 */

const Module = require("node:module");
const { basename, dirname } = require("node:path");

const cache = new Map();
const resolve = {
  sync(_, { basedir }) {
    if (cache.has(basedir)) {
      return cache.get(basedir)();
    }
    const module = new Module("_");
    module.path = "internal"; // bypass better_rules_javascript module-linker
    module.paths = [dirname(basedir)];
    let result;
    try {
      const filename = Module._resolveFilename(basename(basedir), module);
      result = () => filename;
    } catch (e) {
      result = () => {
        throw e;
      };
    }
    cache.set(basedir, result);
    return result();
  },
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (path) {
  if (path === "resolve") {
    return resolve;
  }
  return originalRequire.apply(this, arguments);
};
