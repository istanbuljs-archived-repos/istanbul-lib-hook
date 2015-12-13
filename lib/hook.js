/*
 Copyright 2012-2015, Yahoo Inc.
 Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
 */
var vm = require('vm'),
    path = require('path'),
    pirates = require('pirates'),
    reverts = [],
    originalCreateScript = vm.createScript,
    originalRunInThisContext = vm.runInThisContext;

function shouldHook(matcher, filename) {
    return typeof filename === 'string' && matcher(path.resolve(filename));
}

function transformFn(transformer, verbose) {

    return function (code, filename) {
        var transformed,
            changed = false;

        if (verbose) {
            console.error('Module load hook: transform [' + filename + ']');
        }
        try {
            transformed = transformer(code, filename);
            changed = true;
        } catch (ex) {
            console.error('Transformation error for', filename, '; return original code');
            console.error(ex.message || String(ex));
            console.error(ex.stack);
            transformed = code;
        }
        return { code: transformed, changed: changed };
    };
}

function unloadRequireCache(matcher) {
    /* istanbul ignore else: impossible to test */
    if (matcher && typeof require !== 'undefined' && require && require.cache) {
        Object.keys(require.cache).forEach(function (filename) {
            if (matcher(filename)) {
                delete require.cache[filename];
            }
        });
    }
}
/**
 * hooks `require` to return transformed code to the node module loader.
 * Exceptions in the transform result in the original code being used instead.
 * @method hookRequire
 * @static
 * @param matcher {Function(filePath)} a function that is called with the absolute path to the file being
 *  `require`-d. Should return a truthy value when transformations need to be applied to the code, a falsy value otherwise
 * @param transformer {Function(code, filePath)} a function called with the original code and the associated path of the file
 *  from where the code was loaded. Should return the transformed code.
 * @param options {Object} options Optional.
 * @param {Boolean} [options.verbose] write a line to standard error every time the transformer is called
 * @param {Function} [options.postLoadHook] a function that is called with the name of the file being
 *  required. This is called after the require is processed irrespective of whether it was transformed.
 */
function hookRequire(matcher, transformer, options) {
    options = options || {};
    var extensions,
        fn = transformFn(transformer, options.verbose),
        postLoadHook = options.postLoadHook &&
            typeof options.postLoadHook === 'function' ? options.postLoadHook : null;

    extensions = options.extensions || ['.js'];

    var revert = pirates.addHook(function(code, filename) {
        var ret = fn(code, filename);
        if (postLoadHook) {
            postLoadHook(filename);
        }
        return ret.code;
    }, { exts: extensions, matcher: matcher });

    reverts.push(revert);
}
/**
 * unhook `require` to restore it to its original state.
 * @method unhookRequire
 * @static
 */
function unhookRequire() {
    reverts.forEach(function(revert) {
        revert();
    });
    reverts = [];
}
/**
 * hooks `vm.createScript` to return transformed code out of which a `Script` object will be created.
 * Exceptions in the transform result in the original code being used instead.
 * @method hookCreateScript
 * @static
 * @param matcher {Function(filePath)} a function that is called with the filename passed to `vm.createScript`
 *  Should return a truthy value when transformations need to be applied to the code, a falsy value otherwise
 * @param transformer {Function(code, filePath)} a function called with the original code and the filename passed to
 *  `vm.createScript`. Should return the transformed code.
 * @param options {Object} options Optional.
 * @param {Boolean} [options.verbose] write a line to standard error every time the transformer is called
 */
function hookCreateScript(matcher, transformer, opts) {
    opts = opts || {};
    var fn = transformFn(transformer, opts.verbose);
    vm.createScript = function (code, file) {
        if (!shouldHook(matcher, file)) {
            return originalCreateScript(code, file);
        }
        var ret = fn(code, file);
        return originalCreateScript(ret.code, file);
    };
}

/**
 * unhooks vm.createScript, restoring it to its original state.
 * @method unhookCreateScript
 * @static
 */
function unhookCreateScript() {
    vm.createScript = originalCreateScript;
}


/**
 * hooks `vm.runInThisContext` to return transformed code.
 * @method hookRunInThisContext
 * @static
 * @param matcher {Function(filePath)} a function that is called with the filename passed to `vm.createScript`
 *  Should return a truthy value when transformations need to be applied to the code, a falsy value otherwise
 * @param transformer {Function(code, filePath)} a function called with the original code and the filename passed to
 *  `vm.createScript`. Should return the transformed code.
 * @param options {Object} options Optional.
 * @param {Boolean} [options.verbose] write a line to standard error every time the transformer is called
 */
function hookRunInThisContext(matcher, transformer, opts) {
    opts = opts || {};
    var fn = transformFn(transformer, opts.verbose);
    vm.runInThisContext = function (code, file) {
        if (!shouldHook(matcher, file)) {
            return originalRunInThisContext(code, file);
        }
        var ret = fn(code, file);
        return originalRunInThisContext(ret.code, file);
    };
}

/**
 * unhooks vm.runInThisContext, restoring it to its original state.
 * @method unhookRunInThisContext
 * @static
 */
function unhookRunInThisContext() {
    vm.runInThisContext = originalRunInThisContext;
}

/**
 * provides a mechanism to transform code in the scope of `require` or `vm.createScript`.
 * This mechanism is general and relies on a user-supplied `matcher` function that determines when transformations should be
 * performed and a user-supplied `transformer` function that performs the actual transform.
 * Instrumenting code for coverage is one specific example of useful hooking.
 *
 * Note that both the `matcher` and `transformer` must execute synchronously.
 *
 * For the common case of matching filesystem paths based on inclusion/ exclusion patterns, use the `matcherFor`
 * function in the istanbul API to get a matcher.
 *
 * It is up to the transformer to perform processing with side-effects, such as caching, storing the original
 * source code to disk in case of dynamically generated scripts etc. The `Store` class can help you with this.
 *
 * @module AllExports
 * @example
 * var hook = require('istanbul-lib-hook'),
 *     myMatcher = function (file) { return file.match(/foo/); },
 *     myTransformer = function (code, file) {
 *         return 'console.log("' + file + '");' + code;
 *     };
 *
 * hook.hookRequire(myMatcher, myTransformer);
 * var foo = require('foo'); //will now print foo's module path to console
 */
module.exports = {
    hookRequire: hookRequire,
    unhookRequire: unhookRequire,
    hookCreateScript: hookCreateScript,
    unhookCreateScript: unhookCreateScript,
    hookRunInThisContext : hookRunInThisContext,
    unhookRunInThisContext : unhookRunInThisContext,
    unloadRequireCache: unloadRequireCache
};


