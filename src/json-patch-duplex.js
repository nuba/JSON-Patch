/*!
 * https://github.com/Starcounter-Jack/JSON-Patch
 * json-patch-duplex.js version: 1.1.10
 * (c) 2013 Joachim Wester
 * MIT license
 */
var jsonpatch;
(function (jsonpatch) {
    var _objectKeys = function (obj) {
        if (_isArray(obj)) {
            var keys = new Array(obj.length);
            for (var k = 0; k < keys.length; k++) {
                keys[k] = "" + k;
            }
            return keys;
        }
        if (Object.keys) {
            return Object.keys(obj);
        }
        var keys = [];
        for (var i in obj) {
            if (obj.hasOwnProperty(i)) {
                keys.push(i);
            }
        }
        return keys;
    };
    function _equals(a, b) {
        switch (typeof a) {
            case 'undefined':
            case 'boolean':
            case 'string':
            case 'number':
                return a === b;
            case 'object':
                if (a === null)
                    return b === null;
                if (_isArray(a)) {
                    if (!_isArray(b) || a.length !== b.length)
                        return false;
                    for (var i = 0, l = a.length; i < l; i++)
                        if (!_equals(a[i], b[i]))
                            return false;
                    return true;
                }
                var aKeys = _objectKeys(a);
                var bKeys = _objectKeys(b);
                for (var i_1 = 0; i_1 < aKeys.length; i_1++) {
                    var key_1 = aKeys[i_1];
                    // check all properties of `a` to equal their `b` counterpart
                    if (!_equals(a[key_1], b[key_1])) {
                        return false;
                    }
                    // remove the key from consideration in next step since we know it's "equal"
                    var bKeysIdx = bKeys.indexOf(key_1);
                    if (bKeysIdx >= 0) {
                        bKeys.splice(bKeysIdx, 1);
                    }
                }
                for (var i_2 = 0; i_2 < bKeys.length; i_2++) {
                    var key = bKeys[i_2];
                    // lastly, test any untested properties of `b`
                    if (!_equals(a[key], b[key])) {
                        return false;
                    }
                }
                return true;
            default:
                return false;
        }
    }
    /* We use a Javascript hash to store each
     function. Each hash entry (property) uses
     the operation identifiers specified in rfc6902.
     In this way, we can map each patch operation
     to its dedicated function in efficient way.
     */
    /* The operations applicable to an object */
    var objOps = {
        add: function (obj, key) {
            obj[key] = this.value;
        },
        remove: function (obj, key) {
            var removed = obj[key];
            delete obj[key];
            return removed;
        },
        replace: function (obj, key) {
            var removed = obj[key];
            obj[key] = this.value;
            return removed;
        },
        move: function (obj, key, document) {
            var originalValue = getValueByPointer(document, this.path);
            var newValue = getValueByPointer(document, this.from);
            applyOperation(document, { op: "remove", path: this.from });
            applyOperation(document, { op: "add", path: this.path, value: newValue });
            return originalValue;
        },
        copy: function (obj, key, document) {
            var valueToCopy = getValueByPointer(document, this.from);
            applyOperation(document, { op: "add", path: this.path, value: valueToCopy });
        },
        test: function (obj, key) {
            return _equals(obj[key], this.value);
        },
        _get: function (obj, key) {
            this.value = obj[key];
        }
    };
    /* The operations applicable to an array. Many are the same as for the object */
    var arrOps = {
        add: function (arr, i) {
            arr.splice(i, 0, this.value);
            // this may be needed when using '-' in an array
            return i;
        },
        remove: function (arr, i) {
            var removedList = arr.splice(i, 1);
            return removedList[0];
        },
        replace: function (arr, i) {
            var removed = arr[i];
            arr[i] = this.value;
            return removed;
        },
        move: objOps.move,
        copy: objOps.copy,
        test: objOps.test,
        _get: objOps._get
    };
    function _getPathRecursive(root, obj) {
        var found;
        for (var key in root) {
            if (root.hasOwnProperty(key)) {
                if (root[key] === obj) {
                    return escapePathComponent(key) + '/';
                }
                else if (typeof root[key] === 'object') {
                    found = _getPathRecursive(root[key], obj);
                    if (found != '') {
                        return escapePathComponent(key) + '/' + found;
                    }
                }
            }
        }
        return '';
    }
    function getPath(root, obj) {
        if (root === obj) {
            return '/';
        }
        var path = _getPathRecursive(root, obj);
        if (path === '') {
            throw new Error("Object not found in root");
        }
        return '/' + path;
    }
    var beforeDict = [];
    var Mirror = (function () {
        function Mirror(obj) {
            this.observers = [];
            this.obj = obj;
        }
        return Mirror;
    }());
    var ObserverInfo = (function () {
        function ObserverInfo(callback, observer) {
            this.callback = callback;
            this.observer = observer;
        }
        return ObserverInfo;
    }());
    function getMirror(obj) {
        for (var i = 0, ilen = beforeDict.length; i < ilen; i++) {
            if (beforeDict[i].obj === obj) {
                return beforeDict[i];
            }
        }
    }
    function getObserverFromMirror(mirror, callback) {
        for (var j = 0, jlen = mirror.observers.length; j < jlen; j++) {
            if (mirror.observers[j].callback === callback) {
                return mirror.observers[j].observer;
            }
        }
    }
    function removeObserverFromMirror(mirror, observer) {
        for (var j = 0, jlen = mirror.observers.length; j < jlen; j++) {
            if (mirror.observers[j].observer === observer) {
                mirror.observers.splice(j, 1);
                return;
            }
        }
    }
    /**
     * Detach an observer from an object
     */
    function unobserve(root, observer) {
        observer.unobserve();
    }
    jsonpatch.unobserve = unobserve;
    function deepClone(obj) {
        switch (typeof obj) {
            case "object":
                return JSON.parse(JSON.stringify(obj)); //Faster than ES5 clone - http://jsperf.com/deep-cloning-of-objects/5
            case "undefined":
                return null; //this is how JSON.stringify behaves for array items
            default:
                return obj; //no need to clone primitives
        }
    }
    /**
     * Observes changes made to an object, which can then be retieved using generate
     */
    function observe(obj, callback) {
        var patches = [];
        var root = obj;
        var observer;
        var mirror = getMirror(obj);
        if (!mirror) {
            mirror = new Mirror(obj);
            beforeDict.push(mirror);
        }
        else {
            observer = getObserverFromMirror(mirror, callback);
        }
        if (observer) {
            return observer;
        }
        observer = {};
        mirror.value = deepClone(obj);
        if (callback) {
            observer.callback = callback;
            observer.next = null;
            var dirtyCheck = function () {
                generate(observer);
            };
            var fastCheck = function () {
                clearTimeout(observer.next);
                observer.next = setTimeout(dirtyCheck);
            };
            if (typeof window !== 'undefined') {
                if (window.addEventListener) {
                    window.addEventListener('mouseup', fastCheck);
                    window.addEventListener('keyup', fastCheck);
                    window.addEventListener('mousedown', fastCheck);
                    window.addEventListener('keydown', fastCheck);
                    window.addEventListener('change', fastCheck);
                }
                else {
                    document.documentElement.attachEvent('onmouseup', fastCheck);
                    document.documentElement.attachEvent('onkeyup', fastCheck);
                    document.documentElement.attachEvent('onmousedown', fastCheck);
                    document.documentElement.attachEvent('onkeydown', fastCheck);
                    document.documentElement.attachEvent('onchange', fastCheck);
                }
            }
        }
        observer.patches = patches;
        observer.object = obj;
        observer.unobserve = function () {
            generate(observer);
            clearTimeout(observer.next);
            removeObserverFromMirror(mirror, observer);
            if (typeof window !== 'undefined') {
                if (window.removeEventListener) {
                    window.removeEventListener('mouseup', fastCheck);
                    window.removeEventListener('keyup', fastCheck);
                    window.removeEventListener('mousedown', fastCheck);
                    window.removeEventListener('keydown', fastCheck);
                }
                else {
                    document.documentElement.detachEvent('onmouseup', fastCheck);
                    document.documentElement.detachEvent('onkeyup', fastCheck);
                    document.documentElement.detachEvent('onmousedown', fastCheck);
                    document.documentElement.detachEvent('onkeydown', fastCheck);
                }
            }
        };
        mirror.observers.push(new ObserverInfo(callback, observer));
        return observer;
    }
    jsonpatch.observe = observe;
    /**
     * Generate an array of patches from an observer
     */
    function generate(observer) {
        var mirror;
        for (var i = 0, ilen = beforeDict.length; i < ilen; i++) {
            if (beforeDict[i].obj === observer.object) {
                mirror = beforeDict[i];
                break;
            }
        }
        _generate(mirror.value, observer.object, observer.patches, "");
        if (observer.patches.length) {
            applyPatch(mirror.value, observer.patches);
        }
        var temp = observer.patches;
        if (temp.length > 0) {
            observer.patches = [];
            if (observer.callback) {
                observer.callback(temp);
            }
        }
        return temp;
    }
    jsonpatch.generate = generate;
    // Dirty check if obj is different from mirror, generate patches and update mirror
    function _generate(mirror, obj, patches, path) {
        if (obj === mirror) {
            return;
        }
        if (typeof obj.toJSON === "function") {
            obj = obj.toJSON();
        }
        var newKeys = _objectKeys(obj);
        var oldKeys = _objectKeys(mirror);
        var changed = false;
        var deleted = false;
        //if ever "move" operation is implemented here, make sure this test runs OK: "should not generate the same patch twice (move)"
        for (var t = oldKeys.length - 1; t >= 0; t--) {
            var key = oldKeys[t];
            var oldVal = mirror[key];
            if (obj.hasOwnProperty(key) && !(obj[key] === undefined && oldVal !== undefined && _isArray(obj) === false)) {
                var newVal = obj[key];
                if (typeof oldVal == "object" && oldVal != null && typeof newVal == "object" && newVal != null) {
                    _generate(oldVal, newVal, patches, path + "/" + escapePathComponent(key));
                }
                else {
                    if (oldVal !== newVal) {
                        changed = true;
                        patches.push({ op: "replace", path: path + "/" + escapePathComponent(key), value: deepClone(newVal) });
                    }
                }
            }
            else {
                patches.push({ op: "remove", path: path + "/" + escapePathComponent(key) });
                deleted = true; // property has been deleted
            }
        }
        if (!deleted && newKeys.length == oldKeys.length) {
            return;
        }
        for (var t = 0; t < newKeys.length; t++) {
            var key = newKeys[t];
            if (!mirror.hasOwnProperty(key) && obj[key] !== undefined) {
                patches.push({ op: "add", path: path + "/" + escapePathComponent(key), value: deepClone(obj[key]) });
            }
        }
    }
    var _isArray;
    if (Array.isArray) {
        _isArray = Array.isArray;
    }
    else {
        _isArray = function (obj) {
            return obj.push && typeof obj.length === 'number';
        };
    }
    //3x faster than cached /^\d+$/.test(str)
    function isInteger(str) {
        var i = 0;
        var len = str.length;
        var charCode;
        while (i < len) {
            charCode = str.charCodeAt(i);
            if (charCode >= 48 && charCode <= 57) {
                i++;
                continue;
            }
            return false;
        }
        return true;
    }
    /**
    * Escapes a json pointer path
    * @param path The raw pointer
    * @return the Escaped path
    */
    function escapePathComponent(path) {
        if (path.indexOf('/') === -1 && path.indexOf('~') === -1)
            return path;
        return path.replace(/~/g, '~0').replace(/\//g, '~1');
    }
    jsonpatch.escapePathComponent = escapePathComponent;
    /**
     * Unescapes a json pointer path
     * @param path The escaped pointer
     * @return The unescaped path
     */
    function unescapePathComponent(path) {
        return path.replace(/~1/g, '/').replace(/~0/g, '~');
    }
    jsonpatch.unescapePathComponent = unescapePathComponent;
    /**
     * Retrieves a value from a JSON document by a JSON pointer.
     * Returns the value.
     *
     * @param document The document to get the value from
     * @param pointer an escaped JSON pointer
     * @return The retrieved value
     */
    function getValueByPointer(document, pointer) {
        var getOriginalDestination = { op: "_get", path: pointer };
        applyOperation(document, getOriginalDestination);
        return getOriginalDestination.value;
    }
    jsonpatch.getValueByPointer = getValueByPointer;
    /**
     * Apply a single JSON Patch Operation on a JSON document.
     * Returns the {newDocument, result} of the operation.
     *
     * @param document The document to patch
     * @param operation The operation to apply
     * @param validateOperation `false` is without validation, `true` to use default jsonpatch's validation, or you can pass a `validateOperation` callback to be used for validation.
     * @param mutateDocument Whether to mutate the original document or clone it before applying
     * @return `{newDocument, result}` after the operation
     */
    function applyOperation(document, operation, validateOperation, mutateDocument) {
        if (validateOperation === void 0) { validateOperation = false; }
        if (mutateDocument === void 0) { mutateDocument = true; }
        if (validateOperation) {
            if (typeof validateOperation == 'function') {
                validateOperation(operation, 0, document, operation.path);
            }
            else {
                validator(operation, 0);
            }
        }
        var returnValue = { newDocument: document, result: undefined };
        /* ROOT OPERATIONS */
        if (operation.path === "") {
            if (operation.op === 'add') {
                returnValue.newDocument = operation.value;
                return returnValue;
            }
            else if (operation.op === 'replace') {
                returnValue.newDocument = operation.value;
                returnValue.result = document; //document we removed
                return returnValue;
            }
            else if (operation.op === 'move' || operation.op === 'copy') {
                returnValue.newDocument = getValueByPointer(document, operation.from); // get the value by json-pointer in `from` field
                if (operation.op === 'move') {
                    returnValue.result = document;
                }
                return returnValue;
            }
            else if (operation.op === 'test') {
                returnValue.result = _equals(document, operation.value);
                if (returnValue.result == false) {
                    throw new JsonPatchError("Test operation failed", 'TEST_OPERATION_FAILED', 0, operation, document);
                }
                returnValue.newDocument = document;
                return returnValue;
            }
            else if (operation.op === 'remove') {
                returnValue.result = document;
                returnValue.newDocument = null;
                return returnValue;
            }
            else {
                if (validateOperation) {
                    throw new JsonPatchError('Operation `op` property is not one of operations defined in RFC-6902', 'OPERATION_OP_INVALID', 0, operation, document);
                }
                else {
                    return returnValue;
                }
            }
        } /* END ROOT OPERATIONS */
        else {
            if (!mutateDocument) {
                document = deepClone(document);
            }
            var path = operation.path || "";
            var keys = path.split('/');
            var obj = document;
            var t = 1; //skip empty element - http://jsperf.com/to-shift-or-not-to-shift
            var len = keys.length;
            var existingPathFragment = undefined;
            var key = void 0;
            var validateFunction = void 0;
            if (typeof validateOperation == 'function') {
                validateFunction = validateOperation;
            }
            else {
                validateFunction = validator;
            }
            while (true) {
                key = keys[t];
                if (validateOperation) {
                    if (existingPathFragment === undefined) {
                        if (obj[key] === undefined) {
                            existingPathFragment = keys.slice(0, t).join('/');
                        }
                        else if (t == len - 1) {
                            existingPathFragment = operation.path;
                        }
                        if (existingPathFragment !== undefined) {
                            validateFunction(operation, 0, document, existingPathFragment);
                        }
                    }
                }
                t++;
                if (_isArray(obj)) {
                    if (key === '-') {
                        key = obj.length;
                    }
                    else {
                        if (validateOperation && !isInteger(key)) {
                            throw new JsonPatchError("Expected an unsigned base-10 integer value, making the new referenced value the array element with the zero-based index", "OPERATION_PATH_ILLEGAL_ARRAY_INDEX", 0, operation.path, operation);
                        }
                        key = ~~key;
                    }
                    if (t >= len) {
                        if (validateOperation && operation.op === "add" && key > obj.length) {
                            throw new JsonPatchError("The specified index MUST NOT be greater than the number of elements in the array", "OPERATION_VALUE_OUT_OF_BOUNDS", 0, operation.path, operation);
                        }
                        returnValue.result = arrOps[operation.op].call(operation, obj, key, document); // Apply patch
                        returnValue.newDocument = document;
                        if (returnValue.result === false) {
                            throw new JsonPatchError("Test operation failed", 'TEST_OPERATION_FAILED', 0, operation, document);
                        }
                        return returnValue;
                    }
                }
                else {
                    if (key && key.indexOf('~') != -1) {
                        key = unescapePathComponent(key);
                    }
                    if (t >= len) {
                        returnValue.result = objOps[operation.op].call(operation, obj, key, document); // Apply patch
                        returnValue.newDocument = document;
                        if (returnValue.result === false) {
                            throw new JsonPatchError("Test operation failed", 'TEST_OPERATION_FAILED', 0, operation, document);
                        }
                        return returnValue;
                    }
                }
                obj = obj[key];
            }
        }
    }
    jsonpatch.applyOperation = applyOperation;
    /**
     * Apply a full JSON Patch array on a JSON document.
     * Returns the {newDocument, result} of the patch.
     *
     * @param document The document to patch
     * @param patch The patch to apply
     * @param validateOperation `false` is without validation, `true` to use default jsonpatch's validation, or you can pass a `validateOperation` callback to be used for validation.
     * @return An array of `{newDocument, result}` after the patch
     */
    function applyPatch(document, patch, validateOperation) {
        var results = new Array(patch.length);
        for (var i = 0, length_1 = patch.length; i < length_1; i++) {
            results[i] = applyOperation(document, patch[i], validateOperation);
            document = results[i].newDocument; // in case root was replaced
        }
        results.newDocument = document;
        return results;
    }
    jsonpatch.applyPatch = applyPatch;
    /**
     * Apply a JSON Patch on a JSON document.
     * Returns an array of results of operations.
     * Each element can either be a boolean (if op == 'test') or
     * the removed object (operations that remove things)
     * or just be undefined
     * @deprecated
     */
    function apply(document, patch, validateOperation) {
        console.warn('jsonpatch.apply is deprecated, please use `applyPatch` for applying patch sequences, or `applyOperation` to apply individual operations.');
        var results = new Array(patch.length);
        /* this code might be overkill, but will be removed soon, it is to prevent the breaking change of root operations */
        var _loop_1 = function(i, length_2) {
            if (patch[i].path == "" && patch[i].op != "remove" && patch[i].op != "test") {
                var value_1;
                if (patch[i].op == "replace" || patch[i].op == "move") {
                    results[i] = deepClone(document);
                }
                if (patch[i].op == "copy" || patch[i].op == "move") {
                    value_1 = getValueByPointer(document, patch[i].from);
                }
                if (patch[i].op == "replace" || patch[i].op == "add") {
                    value_1 = patch[i].value;
                }
                // empty the object
                Object.keys(document).forEach(function (key) { return delete document[key]; });
                //copy everything from value
                Object.keys(value_1).forEach(function (key) { return document[key] = value_1[key]; });
            }
            else {
                results[i] = applyOperation(document, patch[i], validateOperation, true).result;
            }
        };
        for (var i = 0, length_2 = patch.length; i < length_2; i++) {
            _loop_1(i, length_2);
        }
        return results;
    }
    jsonpatch.apply = apply;
    /**
     * Apply a single JSON Patch Operation on a JSON document.
     * Returns the updated document.
     * Suitable as a reducer.
     *
     * @param document The document to patch
     * @param operation The operation to apply
     * @return The updated document
     */
    function applyReducer(document, operation) {
        var operationResult = applyOperation(document, operation);
        if (operationResult.result === false) {
            throw new JsonPatchError("Test operation failed", 'TEST_OPERATION_FAILED', 0, operation, document);
        }
        return operationResult.newDocument;
    }
    jsonpatch.applyReducer = applyReducer;
    // provide scoped __extends for TypeScript's `extend` keyword so it will not provide global one during compilation
    function __extends(d, b) {
        for (var p in b)
            if (b.hasOwnProperty(p))
                d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    }
    var JsonPatchError = (function (_super) {
        __extends(JsonPatchError, _super);
        function JsonPatchError(message, name, index, operation, tree) {
            _super.call(this, message);
            this.message = message;
            this.name = name;
            this.index = index;
            this.operation = operation;
            this.tree = tree;
        }
        return JsonPatchError;
    }(Error));
    jsonpatch.JsonPatchError = JsonPatchError;
    /**
     * Recursively checks whether an object has any undefined values inside.
     */
    function hasUndefined(obj) {
        if (obj === undefined) {
            return true;
        }
        if (obj) {
            if (_isArray(obj)) {
                for (var i = 0, len = obj.length; i < len; i++) {
                    if (hasUndefined(obj[i])) {
                        return true;
                    }
                }
            }
            else if (typeof obj === "object") {
                var objKeys = _objectKeys(obj);
                var objKeysLength = objKeys.length;
                for (var i = 0; i < objKeysLength; i++) {
                    if (hasUndefined(obj[objKeys[i]])) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    /**
     * Validates a single operation. Called from `jsonpatch.validate`. Throws `JsonPatchError` in case of an error.
     * @param {object} operation - operation object (patch)
     * @param {number} index - index of operation in the sequence
     * @param {object} [document] - object where the operation is supposed to be applied
     * @param {string} [existingPathFragment] - comes along with `document`
     */
    function validator(operation, index, document, existingPathFragment) {
        debugger;
        if (typeof operation !== 'object' || operation === null || _isArray(operation)) {
            throw new JsonPatchError('Operation is not an object', 'OPERATION_NOT_AN_OBJECT', index, operation, document);
        }
        else if (!objOps[operation.op]) {
            throw new JsonPatchError('Operation `op` property is not one of operations defined in RFC-6902', 'OPERATION_OP_INVALID', index, operation, document);
        }
        else if (typeof operation.path !== 'string') {
            throw new JsonPatchError('Operation `path` property is not a string', 'OPERATION_PATH_INVALID', index, operation, document);
        }
        else if (operation.path.indexOf('/') !== 0 && operation.path.length > 0) {
            // paths that aren't empty string should start with "/"
            throw new JsonPatchError('Operation `path` property must start with "/"', 'OPERATION_PATH_INVALID', index, operation, document);
        }
        else if ((operation.op === 'move' || operation.op === 'copy') && typeof operation.from !== 'string') {
            throw new JsonPatchError('Operation `from` property is not present (applicable in `move` and `copy` operations)', 'OPERATION_FROM_REQUIRED', index, operation, document);
        }
        else if ((operation.op === 'add' || operation.op === 'replace' || operation.op === 'test') && operation.value === undefined) {
            throw new JsonPatchError('Operation `value` property is not present (applicable in `add`, `replace` and `test` operations)', 'OPERATION_VALUE_REQUIRED', index, operation, document);
        }
        else if ((operation.op === 'add' || operation.op === 'replace' || operation.op === 'test') && hasUndefined(operation.value)) {
            throw new JsonPatchError('Operation `value` property is not present (applicable in `add`, `replace` and `test` operations)', 'OPERATION_VALUE_CANNOT_CONTAIN_UNDEFINED', index, operation, document);
        }
        else if (document) {
            if (operation.op == "add") {
                var pathLen = operation.path.split("/").length;
                var existingPathLen = existingPathFragment.split("/").length;
                if (pathLen !== existingPathLen + 1 && pathLen !== existingPathLen) {
                    throw new JsonPatchError('Cannot perform an `add` operation at the desired path', 'OPERATION_PATH_CANNOT_ADD', index, operation, document);
                }
            }
            else if (operation.op === 'replace' || operation.op === 'remove' || operation.op === '_get') {
                if (operation.path !== existingPathFragment) {
                    throw new JsonPatchError('Cannot perform the operation at a path that does not exist', 'OPERATION_PATH_UNRESOLVABLE', index, operation, document);
                }
            }
            else if (operation.op === 'move' || operation.op === 'copy') {
                var existingValue = { op: "_get", path: operation.from, value: undefined };
                var error = validate([existingValue], document);
                if (error && error.name === 'OPERATION_PATH_UNRESOLVABLE') {
                    throw new JsonPatchError('Cannot perform the operation from a path that does not exist', 'OPERATION_FROM_UNRESOLVABLE', index, operation, document);
                }
            }
        }
    }
    jsonpatch.validator = validator;
    /**
     * Validates a sequence of operations. If `document` parameter is provided, the sequence is additionally validated against the object document.
     * If error is encountered, returns a JsonPatchError object
     * @param sequence
     * @param document
     * @returns {JsonPatchError|undefined}
     */
    function validate(sequence, document, externalValidator) {
        try {
            if (!_isArray(sequence)) {
                throw new JsonPatchError('Patch sequence must be an array', 'SEQUENCE_NOT_AN_ARRAY');
            }
            if (document) {
                document = JSON.parse(JSON.stringify(document)); //clone document so that we can safely try applying operations
                applyPatch(document, sequence, externalValidator || true);
            }
            else {
                externalValidator = externalValidator || validator;
                for (var i = 0; i < sequence.length; i++) {
                    externalValidator(sequence[i], i, document, undefined);
                }
            }
        }
        catch (e) {
            if (e instanceof JsonPatchError) {
                return e;
            }
            else {
                throw e;
            }
        }
    }
    jsonpatch.validate = validate;
    /**
     * Create an array of patches from the differences in two objects
     */
    function compare(tree1, tree2) {
        var patches = [];
        _generate(tree1, tree2, patches, '');
        return patches;
    }
    jsonpatch.compare = compare;
})(jsonpatch || (jsonpatch = {}));
if (typeof exports !== "undefined") {
    exports.apply = jsonpatch.apply;
    exports.applyPatch = jsonpatch.applyPatch;
    exports.applyOperation = jsonpatch.applyOperation;
    exports.applyReducer = jsonpatch.applyReducer;
    exports.getValueByPointer = jsonpatch.getValueByPointer;
    exports.escapePathComponent = jsonpatch.escapePathComponent;
    exports.unescapePathComponent = jsonpatch.unescapePathComponent;
    exports.observe = jsonpatch.observe;
    exports.unobserve = jsonpatch.unobserve;
    exports.generate = jsonpatch.generate;
    exports.compare = jsonpatch.compare;
    exports.validate = jsonpatch.validate;
    exports.validator = jsonpatch.validator;
    exports.JsonPatchError = jsonpatch.JsonPatchError;
}
else {
    var exports = {};
    var isBrowser = true;
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = jsonpatch;
/*
When in browser, setting `exports = {}`
fools other modules into thinking they're
running in a node environment, which breaks
some of them. Here is super light weight fix.
*/
if (isBrowser) {
    exports = undefined;
}
